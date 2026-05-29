const CACHE = 'realtqr-v1'

// Cache Next.js static chunks on first fetch
const isStaticAsset = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  url.pathname.startsWith('/icons/') ||
  /\.(woff2?|ttf|otf|ico|png|jpg|jpeg|svg|webp)$/.test(url.pathname)

const isExternal = (url) =>
  url.hostname !== self.location.hostname

const isApiOrAuth = (url) =>
  url.pathname.startsWith('/api/') ||
  url.hostname.includes('supabase') ||
  url.hostname.includes('stripe')

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never intercept external, API, or non-GET requests
  if (event.request.method !== 'GET' || isExternal(url) || isApiOrAuth(url)) return

  if (isStaticAsset(url)) {
    // Cache-first: static assets are content-hashed, safe to cache indefinitely
    event.respondWith(
      caches.match(event.request).then(
        (cached) => cached || fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(event.request, clone))
          }
          return res
        })
      )
    )
    return
  }

  // Network-first for navigation: always try to get fresh HTML
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    )
    return
  }
})
