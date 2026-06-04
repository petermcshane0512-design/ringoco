// BellAveGo Service Worker — handles Web Push notifications.
//
// Lifecycle:
//   1. Browser registers this file via navigator.serviceWorker.register('/sw.js')
//   2. Browser subscribes via pushManager.subscribe({ applicationServerKey: VAPID })
//   3. Backend POSTs the subscription to /api/push/subscribe → stored in profiles
//   4. When a call/booking event fires, backend uses web-push to POST a payload
//      to the browser's push server → this worker's 'push' handler fires
//      even when the tab is closed.
//
// Payload shape (sent from src/lib/push.ts):
//   { title, body, url, tag, icon, badge, data: { ... } }

self.addEventListener('install', (event) => {
  // Activate the new worker immediately on update so users don't need to
  // close and reopen the PWA to get the latest push handler.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Take control of all open BellAveGo tabs immediately.
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'BellAveGo', body: event.data.text() }
  }

  const title = payload.title || 'BellAveGo'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/logo.png',
    badge: payload.badge || '/logo.png',
    tag: payload.tag || 'bellavego-lead',
    // renotify=true makes the same tag re-buzz/alert if a newer push arrives
    // with the same tag (e.g. two leads in a row should both alert).
    renotify: true,
    requireInteraction: payload.requireInteraction ?? false,
    data: {
      url: payload.url || '/dashboard',
      ...payload.data,
    },
    // vibrate pattern on Android (ignored on iOS)
    vibrate: payload.urgency === 'emergency' ? [200, 100, 200, 100, 200] : [100, 50, 100],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/dashboard'
  // Resolve to absolute URL so comparisons work and iOS PWA openWindow accepts it.
  const absoluteUrl = new URL(targetUrl, self.location.origin).href

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

    // Pass 1: existing tab already AT the target URL → focus it. No nav needed.
    for (const client of clientsList) {
      if (client.url === absoluteUrl) {
        return client.focus()
      }
    }

    // Pass 2: existing tab on our origin → focus + try navigate. iOS PWA
    // commonly silently drops .navigate() but doesn't throw, so we still
    // fall through to openWindow if no actual navigation occurred.
    for (const client of clientsList) {
      if (client.url.startsWith(self.location.origin)) {
        try {
          const focused = await client.focus()
          if ('navigate' in focused) {
            // Some iOS Safari builds reject cross-path navigate() — wrap.
            const navigated = await focused.navigate(absoluteUrl).catch(() => null)
            if (navigated && navigated.url === absoluteUrl) return navigated
          }
        } catch {
          // focus failed too — fall through
        }
      }
    }

    // Pass 3: open a brand-new window at the target URL.
    if (self.clients.openWindow) {
      return self.clients.openWindow(absoluteUrl)
    }
  })())
})
