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

    // 2. Launch tutorial 1 (clicks-and-runs) — uses no card art so it's
    //    independent of the CDN. This is a navigation, so wait for it.
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 15000 }),
      page.evaluate(() => startTutorial(0)),
    ]);

    // 3. Renderer constructed
    await page.waitForFunction(() => typeof cardRenderer !== 'undefined' && cardRenderer.app, null, { timeout: 15000 });

    // 4. Loading modal dismissed
    const t0 = Date.now();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return !el || getComputedStyle(el).display === 'none';
    }, null, { timeout: 12000 });
    const dismissMs = Date.now() - t0;
    console.log(`[smoke] loading modal dismissed after ${dismissMs} ms`);

    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENS, '02-tutorial.png') });

    // 5. HiDPI canvas sanity check
    const info = await page.evaluate(() => {
      const r = cardRenderer.app.renderer;
      const c = document.querySelector('canvas');
      return {
        canvasW: c.width, canvasH: c.height,
        cssW: c.clientWidth, cssH: c.clientHeight,
        screenW: r.screen.width, screenH: r.screen.height,
        resolution: r.resolution, autoResize: r.autoResize,
        dpr: window.devicePixelRatio,
      };
    });
    console.log('[smoke] renderer state:', JSON.stringify(info));

    if (!(info.resolution >= 1)) throw new Error(`unexpected renderer.resolution: ${info.resolution}`);
    if (!info.autoResize)        throw new Error(`autoResize should be true`);
    const expectedCanvasW = Math.round(info.cssW * info.resolution);
    if (Math.abs(info.canvasW - expectedCanvasW) > 1) {
      throw new Error(`canvas physical/CSS mismatch: canvasW=${info.canvasW} vs cssW=${info.cssW} × resolution=${info.resolution} (expected ~${expectedCanvasW})`);
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
