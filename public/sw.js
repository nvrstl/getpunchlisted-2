const CACHE = 'punchlister-v1';
const OFFLINE_URL = '/';

// Install: cache the app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for assets
self.addEventListener('fetch', (e) => {
  const { url } = e.request;

  // Always go to network for API calls
  if (url.includes('/api/')) return;

  // For navigation (HTML), try network then fall back to cached /
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // For static assets: cache-first, update cache in background
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fromNetwork = fetch(e.request).then((res) => {
        if (res.ok) {
          caches.open(CACHE).then((cache) => cache.put(e.request, res.clone()));
        }
        return res;
      });
      return cached || fromNetwork;
    })
  );
});
