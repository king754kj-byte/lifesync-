/* ═══════════════════════════════════════════════════════════════
   LifeSync Service Worker v2.1
   Premium Stable Production Version
═══════════════════════════════════════════════════════════════ */

const APP_VERSION = "2.1";
const CACHE_NAME = "lifesync-v2.1";

/* ═══════════════════════════════════════════════════════════════
   FILES TO CACHE
═══════════════════════════════════════════════════════════════ */

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./main.js",
  "./manifest.json",
  "./offline.html",

  "./icon-192.png",
  "./icon-512.png",

  "./calendarEngine.js",
  "./config.js",
  "./firestoreService.js",
  "./habitEngine.js",
  "./helpers.js",
  "./indexedDB.js",
  "./notificationEngine.js",
  "./reminderEngine.js",
  "./reminderScheduler.js",
  "./streakManager.js",
  "./syncService.js",
  "./themeManager.js"
];

/* ═══════════════════════════════════════════════════════════════
   INSTALL
═══════════════════════════════════════════════════════════════ */

self.addEventListener("install", (event) => {

  console.log("[SW] Installing v" + APP_VERSION);

  self.skipWaiting();

  event.waitUntil(

    caches.open(CACHE_NAME)
      .then((cache) => {

        console.log("[SW] Caching Assets");

        return cache.addAll(STATIC_ASSETS);

      })

  );

});

/* ═══════════════════════════════════════════════════════════════
   ACTIVATE
═══════════════════════════════════════════════════════════════ */

self.addEventListener("activate", (event) => {

  console.log("[SW] Activating");

  event.waitUntil(

    caches.keys()
      .then((keys) => {

        return Promise.all(

          keys.map((key) => {

            if (key !== CACHE_NAME) {

              console.log("[SW] Removing Old Cache:", key);

              return caches.delete(key);

            }

          })

        );

      })
      .then(() => {

        return self.clients.claim();

      })

  );

});

/* ═══════════════════════════════════════════════════════════════
   FETCH
═══════════════════════════════════════════════════════════════ */

self.addEventListener("fetch", (event) => {

  if (event.request.method !== "GET") return;

  event.respondWith(

    caches.match(event.request)
      .then((cachedResponse) => {

        /* Return Cache First */

        if (cachedResponse) {

          return cachedResponse;

        }

        /* Fetch From Network */

        return fetch(event.request)
          .then((networkResponse) => {

            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            const responseClone = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {

                cache.put(event.request, responseClone);

              });

            return networkResponse;

          })
          .catch(() => {

            /* Offline Fallback */

            if (event.request.mode === "navigate") {

              return caches.match("./offline.html");

            }

          });

      })

  );

});

/* ═══════════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS
═══════════════════════════════════════════════════════════════ */

self.addEventListener("push", (event) => {

  let data = {};

  try {

    data = event.data.json();

  } catch (e) {

    data = {
      title: "LifeSync",
      body: "You have a new reminder"
    };

  }

  const title = data.title || "LifeSync Reminder";

  const options = {

    body: data.body || "New Notification",

    icon: "./icon-192.png",

    badge: "./icon-192.png",

    vibrate: [200, 100, 200],

    requireInteraction: true,

    data: {
      url: data.url || "./"
    }

  };

  event.waitUntil(

    self.registration.showNotification(title, options)

  );

});

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION CLICK
═══════════════════════════════════════════════════════════════ */

self.addEventListener("notificationclick", (event) => {

  event.notification.close();

  const targetUrl = event.notification.data?.url || "./";

  event.waitUntil(

    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    })
    .then((clients) => {

      for (const client of clients) {

        if (client.url.includes(targetUrl) && "focus" in client) {

          return client.focus();

        }

      }

      if (self.clients.openWindow) {

        return self.clients.openWindow(targetUrl);

      }

    })

  );

});

/* ═══════════════════════════════════════════════════════════════
   BACKGROUND SYNC
═══════════════════════════════════════════════════════════════ */

self.addEventListener("sync", (event) => {

  if (event.tag === "background-sync-reminders") {

    console.log("[SW] Background Sync Running");

    event.waitUntil(

      self.clients.matchAll({
        type: "window"
      })
      .then((clients) => {

        clients.forEach((client) => {

          client.postMessage({
            type: "BACKGROUND_SYNC"
          });

        });

      })

    );

  }

});

/* ═══════════════════════════════════════════════════════════════
   MESSAGE EVENTS
═══════════════════════════════════════════════════════════════ */

let skipWaitingDone = false;

self.addEventListener("message", (event) => {

  const type = event.data?.type;

  /* Skip Waiting */

  if (type === "SKIP_WAITING") {

    console.log("[SW] Skip Waiting");

    if (!skipWaitingDone) {

      skipWaitingDone = true;

      self.skipWaiting();

    }

    return;

  }

  /* Clear Cache */

  if (type === "CLEAR_CACHE") {

    caches.keys()
      .then((keys) => {

        return Promise.all(

          keys.map((key) => caches.delete(key))

        );

      })
      .then(() => {

        if (event.source) {

          event.source.postMessage({
            type: "CACHE_CLEARED"
          });

        }

      });

    return;

  }

  /* Get Version */

  if (type === "GET_VERSION") {

    if (event.source) {

      event.source.postMessage({
        type: "VERSION",
        version: APP_VERSION
      });

    }

    return;

  }

});

/* ═══════════════════════════════════════════════════════════════
   READY
═══════════════════════════════════════════════════════════════ */

console.log("[SW] LifeSync Ready v" + APP_VERSION);
