/* Offline shell for قِرطاس. Teachers open this on flaky mobile data; once the
   app has loaded a first time it must keep working with no network at all. */

/* The build id rides in on the registration URL (`sw.js?v=…`), so every deploy
   is a different script to the browser and gets its own cache. Without it the
   cache name never changed, the activate-time purge below never fired, and
   every past deploy's chunks and fonts stayed on the device forever. */
const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `qirtas-${BUILD}`
const SHELL = new URL('./index.html', self.registration.scope).toString()

/* Deliberately no skipWaiting(). A page that is already open keeps the hashed
   chunk URLs it was served with, and the PDF exporter loads two of them lazily
   — swapping the worker out underneath it turns "download" into a 404. The new
   worker takes over once the last old tab is gone. */

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
