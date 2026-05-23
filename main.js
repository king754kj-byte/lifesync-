/* ══════════════════════════════════════════════════════════════
   LifeSync V2.1 Stable Service Worker
══════════════════════════════════════════════════════════════ */

const VERSION = '2.1';
const STATIC_CACHE = `lifesync-static-${VERSION}`;
const DATA_CACHE = `lifesync-data-${VERSION}`;

/* ─────────────────────────────────────────────────────────────
   PRE-CACHE FILES
───────────────────────────────────────────────────────────── */

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './offline.html',

  './calendarEngine.js',
  './config.js',
  './firestoreService.js',
  './habitEngine.js',
  './helpers.js',
  './indexedDB.js',
  './notificationEngine.js',
  './reminderEngine.js',
  './reminderScheduler.js',
  './streakManager.js',
  './syncService.js',
  './themeManager.js',

  './icon-192.png',
  './icon-512.png'
];

/* ══════════════════════════════════════════════════════════════
   INSTALL
══════════════════════════════════════════════════════════════ */

self.addEventListener('install', (event) => {

  console.log('[SW] Installing');

  event.waitUntil(

    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))

  );

});

/* ══════════════════════════════════════════════════════════════
   ACTIVATE
══════════════════════════════════════════════════════════════ */

self.addEventListener('activate', (event) => {

  console.log('[SW] Activating');

  event.waitUntil(

    caches.keys().then((keys) => {

      return Promise.all(

        keys.map((key) => {

          if (
            key !== STATIC_CACHE &&
            key !== DATA_CACHE
          ) {

            console.log('[SW] Removing:', key);

            return caches.delete(key);

          }

        })

      );

    }).then(() => self.clients.claim())

  );

});

/* ══════════════════════════════════════════════════════════════
   FETCH
══════════════════════════════════════════════════════════════ */

self.addEventListener('fetch', (event) => {

  const request = event.request;

  if (request.method !== 'GET') return;

  event.respondWith(

    caches.match(request).then((cached) => {

      if (cached) return cached;

      return fetch(request)
        .then((response) => {

          if (!response || response.status !== 200) {
            return response;
          }

          const cloned = response.clone();

          caches.open(DATA_CACHE)
            .then((cache) => {

              cache.put(request, cloned);

            });

          return response;

        })
        .catch(() => {

          if (request.mode === 'navigate') {

            return caches.match('./offline.html');

          }

        });

    })

  );

});

/* ══════════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS
══════════════════════════════════════════════════════════════ */

self.addEventListener('push', (event) => {

  let data = {};

  try {

    data = event.data.json();

  } catch {

    data = {
      title: 'LifeSync',
      body: 'New Reminder'
    };

  }

  const options = {

    body: data.body,

    icon: './icon-192.png',

    badge: './icon-192.png',

    vibrate: [200, 100, 200],

    data: {
      url: data.url || './'
    }

  };

  event.waitUntil(

    self.registration.showNotification(
      data.title,
      options
    )

  );

});

/* ══════════════════════════════════════════════════════════════
   NOTIFICATION CLICK
══════════════════════════════════════════════════════════════ */

self.addEventListener('notificationclick', (event) => {

  event.notification.close();

  const targetUrl =
    event.notification.data?.url || './';

  event.waitUntil(

    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((windowClients) => {

      for (const client of windowClients) {

        if ('focus' in client) {

          return client.focus();

        }

      }

      if (clients.openWindow) {

        return clients.openWindow(targetUrl);

      }

    })

  );

});

/* ══════════════════════════════════════════════════════════════
   MESSAGE EVENTS
══════════════════════════════════════════════════════════════ */

self.addEventListener('message', (event) => {

  if (event.data?.type === 'SKIP_WAITING') {

    self.skipWaiting();

  }

});

/* ══════════════════════════════════════════════════════════════
   READY
══════════════════════════════════════════════════════════════ */

console.log('[SW] LifeSync Ready v' + VERSION);
