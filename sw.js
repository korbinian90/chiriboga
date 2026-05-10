// Service Worker: cache-first proxy for card art on the static GitHub Pages
// deploy. Card images aren't bundled (licensing + size); when the engine
// requests /images/<5digit>.jpg we proxy to the NetrunnerDB CDN (declared
// in carddata/carddata.json as imageUrlTemplate) and store the response in
// the Cache API so subsequent requests in any session never hit the network.

const CACHE_VERSION = 'chiriboga-cards-v1';
const CARD_HOST = 'https://card-images.netrunnerdb.com/v2/large/';
const CARD_PATH_RE = /\/images\/(\d{5})\.jpg$/;

// Card codes used by tutorials 7 + 8 (the two starter-deck tutorials in
// index.php). Both tutorials share the same two System Gateway decks; the
// player just swaps sides. Decoded once from the LZString deck params at
// index.php:443-444. Update if those tutorials change.
const TUTORIAL_PREWARM_CODES = [
  '30006', '30012', '30013', '30014', '30015', '30018', '30020', '30021',
  '30026', '30027', '30028', '30029', '30030', '30032', '30033', '30034',
  '30037', '30039', '30040', '30042', '30045', '30046', '30047', '30064',
  '30067', '30069', '30070', '30071', '30072', '30073', '30074', '30075',
  '30076', '30077',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Pre-warm tutorial card art so a cold visit to tutorial 7/8 doesn't have
  // to wait on ~34 cross-origin fetches in series. Promise.allSettled so a
  // single CDN miss doesn't fail install.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(TUTORIAL_PREWARM_CODES.map(async (code) => {
      const proxyKey = new Request(new URL('images/' + code + '.jpg', self.registration.scope).href);
      if (await cache.match(proxyKey)) return;
      const res = await fetch(CARD_HOST + code + '.jpg', { mode: 'cors', credentials: 'omit' });
      if (res.ok) await cache.put(proxyKey, res);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => n === CACHE_VERSION ? null : caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(CARD_PATH_RE);
  if (!match) return;
  event.respondWith(handleCardArt(event.request, match[1]));
});

async function handleCardArt(request, code) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(CARD_HOST + code + '.jpg', {
      mode: 'cors',
      credentials: 'omit',
    });
    if (response.ok) {
      cache.put(request, response.clone());
      return response;
    }
  } catch (e) {
    // network failure — fall through to 404
  }
  return new Response('', { status: 404, statusText: 'Card art not found' });
}
