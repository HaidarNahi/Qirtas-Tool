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

/* Nothing is pre-cached at install: the hashed asset names are only known to
   the build, not to this file. So the new cache is EMPTY when it activates, and
   everything the app needs is sitting in the outgoing one — put there by the
   old worker, including the new build's HTML and assets that the still-open
   page fetched while this worker waited.

   Deleting the old cache at that moment is what turns an update into a broken
   app the next time the device is offline. The entries are carried across
   first, and only then are the old caches dropped.

   The cap is what keeps this from being "never purge anything" with extra
   steps: a build is around sixty files, so two generations fit and the third
   pushes the least useful out. Anything dropped is re-fetched and re-cached the
   next time the device is online. */
const CARRY_LIMIT = 140

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const stale = (await caches.keys()).filter((key) => key !== CACHE)

      let room = CARRY_LIMIT - (await cache.keys()).length
      for (const key of stale) {
        const previous = await caches.open(key)
        // The shell first: it is the one entry whose absence means the app does
        // not open at all.
        const requests = await previous.keys()
        requests.sort((a, b) => (a.url === SHELL ? -1 : b.url === SHELL ? 1 : 0))
        for (const request of requests) {
          if (room <= 0) break
          if (await cache.match(request)) continue
          const response = await previous.match(request)
          if (!response) continue
          await cache.put(request, response)
          room--
        }
      }

      await Promise.all(stale.map((key) => caches.delete(key)))
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
