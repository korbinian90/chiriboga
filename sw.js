// Service Worker: cache-first proxy for card art on the static GitHub Pages
// deploy. Card images aren't bundled (licensing + size); when the engine
// requests /images/<5digit>.jpg we proxy to the NetrunnerDB CDN (declared
// in carddata/carddata.json as imageUrlTemplate) and store the response in
// the Cache API so subsequent requests in any session never hit the network.

const CACHE_VERSION = 'chiriboga-cards-v1';
const CARD_HOST = 'https://card-images.netrunnerdb.com/v2/large/';
const CARD_PATH_RE = /\/images\/(\d{5})\.jpg$/;

self.addEventListener('install', () => {
  self.skipWaiting();
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
