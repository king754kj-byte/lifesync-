/* ══════════════════════════════════════════════════════════════
   LifeSync V2.1 — main.js
   PWA Service Worker + Install Banner + Offline/Update logic
   This file is the Service Worker source. It should be placed at
   the ROOT of the project as  /main.js  (same level as index.html)
   and registered via:
     navigator.serviceWorker.register('./main.js')
══════════════════════════════════════════════════════════════ */

const CACHE_NAME   = 'lifesync-v2.1.0';
const STATIC_CACHE = 'lifesync-static-v2.1.0';
const DATA_CACHE   = 'lifesync-data-v2.1.0';

/* ── Assets to pre-cache on install ── */
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './main.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap',
];

/* ════════════════════════════════════════════════════════════
   INSTALL — pre-cache all static assets
════════════════════════════════════════════════════════════ */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing LifeSync Service Worker…');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())   // take control immediately
  );
});

/* ════════════════════════════════════════════════════════════
   ACTIVATE — clean up old caches
════════════════════════════════════════════════════════════ */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new Service Worker…');
  const validCaches = [STATIC_CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !validCaches.includes(key))
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())  // take control of all open tabs
  );
});

/* ════════════════════════════════════════════════════════════
   FETCH — Cache-first for static, Network-first for API
════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Network-first for Google Fonts (always fresh)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(networkFirstStrategy(request, DATA_CACHE));
    return;
  }

  // Network-first for any external API calls
  if (url.hostname !== location.hostname && url.hostname !== 'localhost') {
    event.respondWith(networkFirstStrategy(request, DATA_CACHE));
    return;
  }

  // Cache-first for all local app assets
  event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
});

/* ── Cache-first strategy ── */
async function cacheFirstStrategy(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn('[SW] Cache-first fetch failed:', err);
    // Return cached index.html as fallback for navigation
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/* ── Network-first strategy ── */
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    console.warn('[SW] Network-first fetch failed, no cache:', err);
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/* ════════════════════════════════════════════════════════════
   MESSAGE — handle skip-waiting request from update popup
════════════════════════════════════════════════════════════ */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING, activating now…');
    self.skipWaiting();
  }
});

/* ════════════════════════════════════════════════════════════
   PUSH — handle push notifications (optional / future use)
════════════════════════════════════════════════════════════ */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title   = data.title   || 'LifeSync';
  const options = {
    body:    data.body    || 'You have a new reminder!',
    icon:    './icon-192.png',
    badge:   './icon-192.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || './' },
    actions: [
      { action: 'view',    title: 'View'    },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification click ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const targetUrl = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
