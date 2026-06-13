// BolKhaata service worker — cache the app shell so the PWA opens offline.
// API calls (port 8000) are always network-first and never cached.
const CACHE = 'bolkhaata-v1'
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
  // Never intercept API or non-GET requests.
  if (e.request.method !== 'GET' || url.port === '8000' || url.pathname.startsWith('/auth') || url.pathname.startsWith('/ledger')) {
    return
  }
  // App shell + static assets: cache-first, fall back to network.
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request)
          .then((res) => {
            if (res.ok && url.origin === self.location.origin) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(e.request, copy))
            }
            return res
          })
          .catch(() => caches.match('/index.html')),
    ),
  )
})
