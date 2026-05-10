// Smoke test that mirrors the maintainer's post-deploy checklist:
//   1. index.html loads
//   2. tutorial 1 (which needs no card art) launches
//   3. #loading modal is dismissed within ~10 s
//   4. cardRenderer is constructed at native pixel density
//   5. no unexpected console errors (sandbox-only network failures allowed)
//
// Runs against a local _site (built the same way pages.yml does) on an
// internal http.server. Screenshots written to tests/screenshots/.
//
// Designed to be standalone — no test runner, just `node tests/smoke.js`.

const { chromium, devices } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

const SITE = path.resolve(__dirname, '..', '_site');
const SCREENS = path.resolve(__dirname, 'screenshots');
const PORT = 8765;

// In CI / sandboxed envs the NetrunnerDB CDN is unreachable, so card-art
// fetches 404 and the PIXI render path throws on broken <img>s. Both are
// already tolerated by the deploy-time PIXI patch and the engine continues.
// Filter them out of the assertion set so the smoke test only fails on
// genuinely new errors.
const ALLOWED_ERROR_PATTERNS = [
  /Card art not found/,
  /\/images\/\d{5}\.jpg/,
  /ERR_CERT_AUTHORITY_INVALID/,
  /net::ERR_/i,
  /'broken' state/,
  /favicon\.ico/,
  /googletagmanager\.com/,    // GA blocked in sandbox
  /www\.google-analytics\.com/,
  /api\.ipify\.org/,           // injected by pages.yml; CI doesn't run that step
  // Pre-existing missing UI sprites that don't break the engine — track
  // separately if we want them back.
  /\/images\/history_(corp|runner)_small\.png/,
  /\/images\/NISEI_CREDIT\.png/,
];

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function startServer(dir, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const fp = path.join(dir, url === '/' ? '/index.html' : url);
      // Disallow path traversal
      if (!fp.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404); res.end('404'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'text/plain' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(port, () => resolve(server));
  });
}

(async () => {
  fs.mkdirSync(SCREENS, { recursive: true });
  if (!fs.existsSync(path.join(SITE, 'index.html'))) {
    throw new Error(`Built site missing at ${SITE}. Run the build steps in .github/workflows/ci.yml first.`);
  }

  const server = await startServer(SITE, PORT);
  let browser;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ ...devices['iPhone 13 Pro'], hasTouch: true });
    const page = await ctx.newPage();

    const errors = [];
    page.on('console', m => {
      if (m.type() !== 'error') return;
      // Browser-emitted "Failed to load resource" errors put the URL in
      // location(), not text(). Check both.
      const t = m.text();
      const u = (m.location() || {}).url || '';
      const blob = `${t}\n${u}`;
      if (!ALLOWED_ERROR_PATTERNS.some(p => p.test(blob))) errors.push(`[console] ${t} (${u})`);
    });
    page.on('pageerror', e => {
      if (!ALLOWED_ERROR_PATTERNS.some(p => p.test(e.message))) errors.push(`[pageerror] ${e.message}`);
    });

    // 1. Index loads
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.screenshot({ path: path.join(SCREENS, '01-index.png') });

    // 2. Launch tutorial 7 (vs Corp starter deck) directly via URL — it has
    //    a full System Gateway deck so totalFieldWidth > viewport on a phone,
    //    fieldZoom > 1, and the layout exercises the CSS-vs-PIXI-coord-space
    //    decoupling. Tutorial 1 is too small to trigger fieldZoom > 1 and
    //    therefore wouldn't catch a class of "canvas overflows viewport"
    //    regressions.
    const t7 = '/engine.html?ap=6&p=r&r=N4IglgJgpgdgLmOBPEAuAzABkwdgGwA0IAxgIYBOEAzmgNpbaEOZPYCMATAQ59++n0xsALILYBWMZJ4AOQR0zzFDDm3lqVrTBy0cc8-SrlH5x7BwCc8qwyyC7t5dnRdbr5wNufnwgLoBfIA&c=N4IglgJgpgdgLmOBPEAuAzABkwdhwGhAGMBDAJwgGc0BtLTdA%2Bx-ZgTle3Q-oBZNOmfoN4AmEQFZJIgGyyRTbL0WYZvQWo0qZ27T2wz9uAfRwnsOAIyCrN8afsXHudDden1Hm1NM%2BLEgF0AXyA&t=1';
    await page.goto(`http://127.0.0.1:${PORT}${t7}`, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // 3. Renderer constructed
    await page.waitForFunction(() => typeof cardRenderer !== 'undefined' && cardRenderer.app, null, { timeout: 15000 });

    // 4. Loading modal dismissed (safety timeout fires at 8s if textures stall)
    const t0 = Date.now();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return !el || getComputedStyle(el).display === 'none';
    }, null, { timeout: 12000 });
    const dismissMs = Date.now() - t0;
    console.log(`[smoke] loading modal dismissed after ${dismissMs} ms`);

    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENS, '02-tutorial.png') });

    // 5. HiDPI canvas + viewport sanity check
    const info = await page.evaluate(() => {
      const r = cardRenderer.app.renderer;
      const c = document.querySelector('canvas');
      return {
        canvasW: c.width, canvasH: c.height,
        cssW: c.clientWidth, cssH: c.clientHeight,
        screenW: r.screen.width, screenH: r.screen.height,
        resolution: r.resolution, autoResize: r.autoResize,
        dpr: window.devicePixelRatio,
        innerW: window.innerWidth, innerH: window.innerHeight,
      };
    });
    console.log('[smoke] renderer state:', JSON.stringify(info));

    if (!(info.resolution >= 1)) throw new Error(`unexpected renderer.resolution: ${info.resolution}`);
    if (!info.autoResize)        throw new Error(`autoResize should be true`);
    // Canvas pixel buffer = PIXI coord space × DPR. The PIXI coord space
    // (screen.width) can be larger than the viewport on a small phone where
    // fieldZoom > 1; the browser scales the buffer down to the CSS box.
    const expectedCanvasW = Math.round(info.screenW * info.resolution);
    if (Math.abs(info.canvasW - expectedCanvasW) > 1) {
      throw new Error(`canvas physical/PIXI mismatch: canvasW=${info.canvasW} vs screenW=${info.screenW} × resolution=${info.resolution} (expected ~${expectedCanvasW})`);
    }
    // Catch the "canvas overflows the viewport" class of bugs (fieldZoom × viewport
    // accidentally became the canvas CSS box, pushing all cards off-screen).
    if (Math.abs(info.cssW - info.innerW) > 5) {
      throw new Error(`canvas CSS width ${info.cssW} should match window.innerWidth ${info.innerW} (PIXI coord space stays larger via screen.width=${info.screenW})`);
    }
    if (Math.abs(info.cssH - info.innerH) > 5) {
      throw new Error(`canvas CSS height ${info.cssH} should match window.innerHeight ${info.innerH}`);
    }

    // 6. No unexpected console / page errors
    if (errors.length) {
      console.error('[smoke] unexpected errors:');
      errors.forEach(e => console.error('  ', e));
      throw new Error(`${errors.length} unexpected error(s)`);
    }

    console.log('[smoke] OK');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(e => {
  console.error('[smoke] FAILED:', e.stack || e.message);
  process.exit(1);
});
