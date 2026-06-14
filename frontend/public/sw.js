// BolKhaata service worker — cache the app shell so the PWA opens offline.
// HTML/navigations are network-first so a new deploy is always picked up;
// hashed static assets are cache-first. Cross-origin (API) + writes pass through.
const CACHE = 'bolkhaata-v2'
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Only handle same-origin GET. API calls (cross-origin) and writes pass through.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return

  const isHTML =
    e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')

  if (isHTML) {
    // Network-first: always try to fetch the latest index.html; fall back to
    // cache only when offline. This prevents stale builds from sticking.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match(e.request).then((c) => c || caches.match('/index.html'))),
    )
    return
  }

  // Hashed static assets (immutable): cache-first.
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copy))
          }
          return res
        }),
    ),
  )
})
