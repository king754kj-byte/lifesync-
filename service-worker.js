// ══════════════════════════════════════════
// LifeSync V2.2 — service-worker.js
// Ultra Smart PWA Service Worker
// Offline • Cache • Push • Background Sync
// Replace FULL old service-worker.js
// ══════════════════════════════════════════

const CACHE_NAME = 'lifesync-v2.2-ultra';

const OFFLINE_URL = './offline.html';

// ═══════════════════════════════
// PRECACHE FILES
// ═══════════════════════════════

const PRECACHE_ASSETS = [

  './',
  './index.html',
  './offline.html',

  './manifest.json',

  './style.css',

  './app.js',
  './reminder-system.js',
  './notifications.js',
  './settings-manager.js',

  './icon-192.png',
  './icon-512.png',

  'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&display=swap'

];

// ═══════════════════════════════
// INSTALL
// ═══════════════════════════════

self.addEventListener('install', event => {

  console.log('✅ SW Installed');

  self.skipWaiting();

  event.waitUntil(

    caches.open(CACHE_NAME).then(cache => {

      return Promise.allSettled(

        PRECACHE_ASSETS.map(asset =>

          cache.add(asset).catch(err => {

            console.warn(
              '❌ Cache Failed:',
              asset,
              err.message
            );

          })

        )

      );

    })

  );

});

// ═══════════════════════════════
// ACTIVATE
// ═══════════════════════════════

self.addEventListener('activate', event => {

  console.log('✅ SW Activated');

  event.waitUntil(

    caches.keys().then(keys =>

      Promise.all(

        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))

      )

    ).then(() => self.clients.claim())

  );

});

// ═══════════════════════════════
// FETCH
// ═══════════════════════════════

self.addEventListener('fetch', event => {

  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // SKIP CHROME EXTENSION
  if (
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'data:'
  ) return;

  // GOOGLE FONTS
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {

    event.respondWith(
      cacheFirst(request)
    );

    return;
  }

  // API CALLS
  if (
    url.hostname.includes('open-meteo.com') ||
    url.hostname.includes('firebase')
  ) {

    event.respondWith(
      networkFirst(request)
    );

    return;
  }

  // MAIN APP
  event.respondWith(
    appShellStrategy(request)
  );

});

// ═══════════════════════════════
// CACHE FIRST
// ═══════════════════════════════

async function cacheFirst(request) {

  const cached =
    await caches.match(request);

  if (cached) return cached;

  try {

    const response =
      await fetch(request);

    const cache =
      await caches.open(CACHE_NAME);

    cache.put(
      request,
      response.clone()
    );

    return response;

  } catch {

    return new Response(
      'Offline',
      { status: 503 }
    );

  }

}

// ═══════════════════════════════
// NETWORK FIRST
// ═══════════════════════════════

async function networkFirst(request) {

  try {

    const response =
      await fetch(request);

    const cache =
      await caches.open(CACHE_NAME);

    cache.put(
      request,
      response.clone()
    );

    return response;

  } catch {

    const cached =
      await caches.match(request);

    if (cached) return cached;

    return new Response(

      JSON.stringify({
        offline:true
      }),

      {
        status:503,
        headers:{
          'Content-Type':'application/json'
        }
      }

    );

  }

}

// ═══════════════════════════════
// APP SHELL STRATEGY
// ═══════════════════════════════

async function appShellStrategy(request) {

  const cached =
    await caches.match(request);

  if (cached) {

    // UPDATE IN BACKGROUND
    fetch(request)
      .then(async response => {

        const cache =
          await caches.open(CACHE_NAME);

        cache.put(
          request,
          response.clone()
        );

      })
      .catch(() => {});

    return cached;
  }

  try {

    const response =
      await fetch(request);

    const cache =
      await caches.open(CACHE_NAME);

    cache.put(
      request,
      response.clone()
    );

    return response;

  } catch {

    if (request.mode === 'navigate') {

      const offline =
        await caches.match(OFFLINE_URL);

      if (offline) return offline;

    }

    return new Response(

      '⚠️ Offline — LifeSync V2.2',

      { status:503 }

    );

  }

}

// ═══════════════════════════════
// BACKGROUND SYNC
// ═══════════════════════════════

self.addEventListener('sync', event => {

  if (
    event.tag === 'lifesync-sync'
  ) {

    console.log(
      '🔄 Background Sync'
    );

    event.waitUntil(

      self.clients.matchAll().then(clients => {

        clients.forEach(client => {

          client.postMessage({
            type:'SYNC_SUCCESS'
          });

        });

      })

    );

  }

});

// ═══════════════════════════════
// PUSH NOTIFICATIONS
// ═══════════════════════════════

self.addEventListener('push', event => {

  if (!event.data) return;

  let data = {};

  try {

    data = event.data.json();

  } catch {

    data = {
      title:'LifeSync',
      body:event.data.text()
    };

  }

  const options = {

    body:
      data.body ||
      'You have a new reminder',

    icon:'./icon-192.png',

    badge:'./icon-192.png',

    vibrate:[100,50,100],

    tag:
      data.tag ||
      'lifesync-notification',

    renotify:true,

    requireInteraction:
      data.urgent || false,

    data: {

      url:
        data.url || './'

    },

    actions:[

      {
        action:'open',
        title:'📂 Open'
      },

      {
        action:'dismiss',
        title:'❌ Dismiss'
      }

    ]

  };

  event.waitUntil(

    self.registration.showNotification(

      `LifeSync: ${
        data.title || 'Reminder'
      }`,

      options

    )

  );

});

// ═══════════════════════════════
// NOTIFICATION CLICK
// ═══════════════════════════════

self.addEventListener(
  'notificationclick',
  event => {

    event.notification.close();

    if (
      event.action === 'dismiss'
    ) return;

    event.waitUntil(

      clients.matchAll({

        type:'window',
        includeUncontrolled:true

      }).then(clientList => {

        for (const client of clientList) {

          if (
            'focus' in client
          ) {

            return client.focus();

          }

        }

        if (clients.openWindow) {

          return clients.openWindow('./');

        }

      })

    );

  }
);

// ═══════════════════════════════
// MESSAGE LISTENER
// ═══════════════════════════════

self.addEventListener('message', event => {

  if (
    event.data &&
    event.data.type === 'SKIP_WAITING'
  ) {

    self.skipWaiting();

  }

});

// ═══════════════════════════════
// PERIODIC CLEANUP
// ═══════════════════════════════

async function cleanupOldCache() {

  const cache =
    await caches.open(CACHE_NAME);

  const keys =
    await cache.keys();

  if (keys.length > 100) {

    for (let i = 0; i < 30; i++) {

      await cache.delete(keys[i]);

    }

  }

}

setInterval(() => {

  cleanupOldCache();

}, 1000 * 60 * 60);

// ═══════════════════════════════
// ONLINE / OFFLINE DETECTION
// ═══════════════════════════════

self.addEventListener('online', () => {

  console.log('🌐 Back Online');

});

self.addEventListener('offline', () => {

  console.log('📴 Offline Mode');

});
