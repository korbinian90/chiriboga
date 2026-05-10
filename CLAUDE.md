# CLAUDE.md — agent handoff for chiriboga

This repo is a solo Netrunner engine deployed statically to GitHub Pages from
the `dev` branch. Reference original at https://chiriboga.cronbach.com.

The maintainer wants you to **ship features autonomously to `dev`**. They review
functionality periodically, not every diff. Skip code-review-style PR cycles —
push, deploy, observe, iterate.

## Working agreement

- Push directly to `dev` in small, focused commits. No PRs unless the change
  is genuinely risky (deletes data, touches CI, or rewrites a system).
- Functional review only — don't ask for code-style approvals.
- Ask only when blocked, when a design decision would be hard to reverse, or
  when you need a third-party credential / asset the user has to provide.
- After every meaningful change, **update this file** in the same commit:
  move done items to "Done", add discovered work to the backlog. The next
  agent reads this first; keep it accurate.
- Do not work on items in "Done" or "Don't redo" again. The work has been
  validated.

## Where things stand

The Pages deploy was hanging at "Loading 0%". Root cause and fix shipped on
2026-05-09:

1. PIXI's canvas renderer throws `TypeError: Cannot read properties of
   undefined (reading 'tintId')` when an `<img>` 404s. That stops the ticker
   mid-listener-list every frame. The first listener is the `loadingTextures`
   splice loop in `cardrenderer/cardrenderer.js:1686-1714` — it's what
   dismisses the `#loading` modal once textures are valid. With the ticker
   bombing, the splice runs once and never again.
2. 31 small UI sprites (card backs, particle/glow textures, counter icons,
   menu SVGs, NSG keyword/faction SVGs) were 404-ing because `images/` was
   gitignored along with card art.
3. `.gitignore` now only excludes card-art patterns
   (`images/[0-9][0-9][0-9][0-9][0-9].jpg|png`, `images/hires/`,
   `images/preview/`); UI sprites are tracked.

Card art (5-digit JPGs) is fetched from `card-images.netrunnerdb.com` via
`sw.js` and stored in the Cache API. The CDN returns `access-control-allow-origin: *`
so PIXI textures stay CORS-clean.

## Verify after each deploy

1. `https://korbinian90.github.io/chiriboga/` on a phone, hit any tutorial.
2. Game UI renders within ~5 s, no console errors.
3. Reload near-instant (SW cache hit).
4. DevTools → Application → Cache Storage → `chiriboga-cards-v1` populated.

## Backlog (prioritized)

### A. Engine load reliability (small, ship one at a time)

- [ ] **SW pre-warm** for tutorial card art. On `install`, fetch the ~60
  cards used by tutorials 7+8 (deck params decoded from `index.php:443-444`
  with LZString) and put them in `chiriboga-cards-v1` so a cold visit to a
  tutorial doesn't have to wait on cross-origin fetches. Don't block install
  on it; use `event.waitUntil(Promise.allSettled(...))`.
- [ ] **Bundle deferred big SVGs.** `NSG_HB.svg` (3.9 MB, base64-embedded
  raster) and `NSG_JINTEKI.svg` (343 KB) were dropped from the UI-sprite
  commit because of push-size limits. Both are decklauncher-only (in-card-
  text icon replacement, `<img>` tags). Either re-author as actual SVG
  geometry, convert to PNG at display size (~64×64), or commit as-is in a
  separate push and accept the weight. Without these, HB/Jinteki faction
  icons render as broken-image in the deck builder.

### B. Mobile responsiveness (Phase A from earlier audit — mechanical, no design decisions)

Local audit of `/tmp/chiriboga-shots*/` (now gone, but findings are below).

- [ ] **PIXI canvas resize listener.** `cardrenderer/cardrenderer.js:1525-1527`
  sizes the canvas once from `innerWidth/innerHeight` and never again.
  Phone-rotate / browser-chrome show-hide leaves the scene mis-sized. Add
  `window.addEventListener('resize', ...)` → `app.renderer.resize(w, h)` +
  re-layout via the existing `ResizeCallback` (the cardRenderer constructor
  already accepts one — `init.js:229`).
- [ ] **HiDPI canvas.** PIXI Application is created without `resolution` or
  `autoDensity`. On a 3× retina phone, text is upscaled and soft. Pass
  `{ resolution: window.devicePixelRatio, autoDensity: true, transparent: true }`.
- [ ] **`touch-action: none`** on the canvas + `e.preventDefault()` in the
  canvas's `touchstart` listener so the browser doesn't fire double-tap-zoom
  or rubber-band scroll over the play area.
- [ ] **Safe-area-inset.** Anything `position: fixed` at top/bottom in
  `style.css` needs `padding-top: env(safe-area-inset-top)` etc., or the UI
  clips behind the iPhone notch / home indicator. Affects `#footer`,
  `#menubar`, `#history-wrapper`, `.fullscreen-button`. Add
  `viewport-fit=cover` to the viewport meta in `engine.php:5` (already
  present in `index.php:8`).
- [ ] **48 px touch targets** on small breakpoints. `style.css:2408` drops
  buttons to `min-width: 80px; padding: 6px 8px` at 360 px wide; counter
  badges to 16 px (`style.css:2368`). Apple HIG = 44 pt, Material = 48 dp.
  Bump the small-breakpoint buttons/badges to ≥48 px square hit areas.
- [ ] **`min-height: 100vh` → `100dvh`** in `style.css:1462` (the terminal
  frame). `100vh` overflows short phones (iPhone SE portrait ~667 px).
- [ ] **Re-enable pinch-zoom.** `index.php:8` sets `user-scalable=no,
  maximum-scale=1.0` and resets `document.body.style.zoom = 1` on
  visibility change (`index.php:105-116`). Remove the resets and switch
  to `user-scalable=yes` so users can pinch out as a fallback for any
  hit-target we miss.

### C. Mobile interaction polish (Phase B — interaction, no design)

- [ ] **Replace CSS `:hover` tooltips** (`style.css:1309`) with click /
  long-press equivalents — touch devices have no hover. History entries
  (`phase.js:1878-1879`), menu glow (`style.css:1503-1504`), the "> "
  active marker, button glow. The card-zoom long-press at
  `cardrenderer/cardrenderer.js:2328-2339` is the right model — extend it
  to chrome.
- [ ] **Touch lift-state for draggable cards.** Today a card with
  `availability == 2` is draggable but visually identical to others —
  touch users have to hold each card to discover what's playable.
  Runeterra and Snap do an instant "lift" animation on touchstart for
  draggable cards. Hook into the existing `pixi_onDragStart`
  (`cardrenderer.js:2322-2362`).
- [ ] **`navigator.vibrate()`** on key gameplay events (install, score,
  successful run, trash) behind a settings toggle. Snap's pattern. Trivial
  to add in `phase.js` event handlers.
- [ ] **Hold-to-confirm on Concede / dangerous prompts.** `engine.php`
  has `EXIT TO MAIN MENU` near thumb-rest territory. Two-step modal or
  500 ms hold to confirm.

### D. Phone-first layout (Phase C — design needed, talk to maintainer first)

- [ ] **Hybrid input.** Drag-to-zone for "play onto big zone" (install
  programs, advance ICE). Tap-then-tap for fiddly targeting (host arrows,
  individual ICE in remote servers, trace pumps). Today everything is
  drag, which causes finger occlusion on small targets.
- [ ] **Portrait-first PIXI scene.** Stack Corp servers top, runner rig +
  score middle, runner hand bottom. Same scene reflows for landscape /
  desktop by repositioning containers — single layout, not two UIs.
- [ ] **Counter chips for stacks.** HQ, R&D, Archives, Stack, Heap as
  small tap-to-expand badges instead of taking play-area real estate.
  Snap pattern.
- [ ] **Long-press keyword glossary** in card text. Runeterra-style. The
  decklauncher already has a keyword regex (`decklauncher.php:646`); reuse
  the matching list in-engine for tap-to-explain.

## Codebase landmarks

| File:line | What |
|---|---|
| `cardrenderer/cardrenderer.js:1525-1527` | PIXI Application init (no resize, no DPR) |
| `cardrenderer/cardrenderer.js:1686-1714` | texture-load splice ticker |
| `cardrenderer/cardrenderer.js:295` | every card pushes its frontTexture to `loadingTextures` |
| `cardrenderer/cardrenderer.js:2079` | `LoadTexture` → `PIXI.Texture.fromImage` |
| `cardrenderer/cardrenderer.js:2322-2362` | `pixi_onDragStart` (touch hold-zoom logic) |
| `init.js:229` | cardRenderer constructor takes a `ResizeCallback` |
| `init.js:285-288` | PIXI Loader for card-back textures, calls `Setup` |
| `init.js:1833` | `StartGame()` |
| `decks.js:570-583` | URL-param deck decompression (LZString) |
| `engine.php:592` | the `#loading` "DECKBUILDING…" modal |
| `index.php:8` | viewport meta (currently disables zoom) |
| `index.php:443-444` | tutorial 7+8 launch URLs (decoded for SW pre-warm) |
| `sw.js` | service worker, intercepts `/images/<5digit>.jpg` |
| `.github/workflows/pages.yml` | deploy: rsync + post-build patches |
| `style.css` media queries | 600 / 480 / 360 px width, 768 px height |

## Architectural notes

- **PIXI v4** (4.7.0). Old, but works. The `Texture.fromImage` API is
  patched in the deploy workflow (`pages.yml:87-93`) to set `valid=true`
  on baseTexture error, so 404'd card art doesn't permanently block the
  texture loop.
- **Single PIXI Application + canvas** for the table; HTML overlays for
  menus / modals / footer; jQuery for HTML manipulation.
- **Card data** lives in `sets/*.js`, each calling
  `cardSet[N] = { ... }`. Sets registered via `config.js:setRegistry`,
  loaded sequentially at engine boot via `document.write` (sequential —
  not currently a target for optimization).
- **Service worker** scope is the project root (`sw.js` at site root).
  It only intercepts paths matching `/.*\/images\/(\d{5})\.jpg$/`;
  everything else passes through.
- **Card-art bundling** is a non-starter (~600 MB, NetrunnerDB licensing).
  SW + CDN is the only path. Don't try to bundle card art.

## Known gotchas

- **Push limit on the proxy.** Single push payloads >~5 MB get rejected
  with `HTTP 403 / send-pack: unexpected disconnect`. Split into smaller
  commits if you're committing many binary assets at once.
- **Service worker activation timing.** SW only intercepts on the visit
  *after* the one that registered it. First visit on a fresh browser
  hits GitHub Pages directly → 404 for any card art. The PIXI patch lets
  the engine start anyway; SW + cache catches up on the second visit.
- **Local file serving.** The repo uses `*.php` for entry points. To
  test locally without PHP, render them to HTML the way `pages.yml` does:
  ```sh
  for f in index engine decklauncher gauntlet; do php -f "${f}.php" > "/tmp/_site/${f}.html"; done
  ```
  Or run `php -S localhost:8000` from the repo root.
- **Deploy rsync excludes.** `.git`, `.github`, `_site`, `*.php`,
  `.htaccess`. Anything else ships to Pages. Keep that in mind if you
  add a build artifact you don't want public.
- **`accessibilityMode == "text"` exists** as an alternate path in
  `init.js:237-279` that skips PIXI entirely. Useful for text-only test
  harnesses; don't break it casually.

## Don't redo (already validated)

- **Mobile UX research** — Hearthstone, MTG Arena, Marvel Snap, Runeterra,
  Slay the Spire, Balatro postmortems. Findings already baked into
  Sections B, C, D above. Don't re-survey.
- **Live-vs-original profiling.** Numbers were captured 2026-05-09:
  original loads in 2-3 s, our deploy was hanging at 0%. Once Section A
  ships, retest using a Playwright script along the lines of the one
  that lives at `/tmp/play.js` in the original handoff session (drop a
  fresh one if needed; it's not committed).
- **Service-worker design.** Card-art interception, CORS-clean response,
  cache-first storage, version-keyed cache name — all shipped. Don't
  redesign without good reason.

## Done (recent → older)

- 2026-05-10 — Modal-dismiss safety timeout in
  `cardrenderer/cardrenderer.js` (added at the top of the ticker setup,
  just before the existing texture-load splice loop). Independent
  `setTimeout(8000)` hides `#loading` and calls `StartGame()` if the
  modal is still visible 8 s after the renderer is constructed —
  survives a stalled ticker since it's not on the ticker. Logs a
  console.warn with the count of still-pending textures so a future
  regression is debuggable.
- 2026-05-09 — `70f339c` Bundle UI sprites; `0371331` carve gitignore so
  only card art is excluded. Fixes "Loading 0%" hang on Pages.
  (Originally PR #4; merged to dev.)
- 2026-05-04 — `3a58bbc` `sw.js` + workflow injection for service-worker
  registration + CSP allow-list for `card-images.netrunnerdb.com`.
- 2026-05-03 — `bd68527` PIXI patch in `pages.yml` to mark errored
  textures valid so the engine doesn't hang on missing card art.
- 2026-05-03 — Initial Pages deploy workflow + GA4 + CSP/Referrer-Policy
  meta tags.
