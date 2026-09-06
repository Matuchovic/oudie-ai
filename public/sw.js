/* ------------------------------------------------------------------
   Oudie service worker

   Two rules, and the second one matters more than the first:

   1. The shell is cached so the app opens instantly and works offline.
   2. Nothing that could carry personal data is ever written to the cache.
      Anything under /api/, anything authenticated, and every non-GET
      request goes straight to the network. A cache that outlives a
      logout is a leak, and it is the kind nobody notices.
   ------------------------------------------------------------------ */

const VERSION = 'oudie-v1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      // addAll rejects the whole batch if any single URL 404s, which would
      // leave the worker uninstalled. Add them one at a time.
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isPrivate(url) {
  return url.pathname.startsWith('/api/') ||
         url.pathname.startsWith('/auth/') ||
         url.searchParams.has('token');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivate(url)) return;                       // never touch the cache

  // Navigations: fresh when online, shell when not. Serving a stale page
  // from cache first would show yesterday's app for a second on every load.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error()))
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

/* Signing out must leave nothing behind. The page posts this. */
self.addEventListener('message', (e) => {
  if (e.data === 'oudie:purge') {
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});
