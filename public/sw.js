/* Offline shell for قِرطاس. Teachers open this on flaky mobile data; once the
   app has loaded a first time it must keep working with no network at all. */
const CACHE = 'qirtas-v1'
const SHELL = new URL('./index.html', self.registration.scope).toString()

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  // Navigation: try the network so updates land, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          const cache = await caches.open(CACHE)
          cache.put(SHELL, fresh.clone())
          return fresh
        } catch {
          const cache = await caches.open(CACHE)
          return (await cache.match(SHELL)) || (await cache.match(request)) || Response.error()
        }
      })(),
    )
    return
  }

  // Hashed assets never change under the same URL, so cache-first is safe.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(request)
      if (hit) return hit
      try {
        const fresh = await fetch(request)
        if (fresh.ok) cache.put(request, fresh.clone())
        return fresh
      } catch {
        return Response.error()
      }
    })(),
  )
})
