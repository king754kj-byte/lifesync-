/* ══════════════════════════════════════════════════════════════════════════
   LifeSync Premium — service-worker.js
   Version : lifesync-v2.1
   Place at : /service-worker.js  (root of project, same folder as index.html)

   Registered by index.html via:
     navigator.serviceWorker.register('./service-worker.js', { scope: './' })

   Strategies used:
   ─ Network-only  : Firebase APIs, Anthropic API, reCAPTCHA (never cache auth)
   ─ Cache-first   : Google Fonts, CDN assets (stable, safe to serve stale)
   ─ Network-first : HTML navigation pages (always try fresh)
   ─ Stale-While-Revalidate : all other local assets (app shell, JS, CSS, icons)

   Features:
   ─ Push notifications (Firebase Cloud Messaging payload)
   ─ Notification click → focus/open app window
   ─ Background sync registration (reminders sync)
   ─ SKIP_WAITING message handler (update popup)
   ─ Auto cache cleanup on activate
══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Cache names ──────────────────────────────────────────────────────────────
const APP_VERSION   = 'lifesync-v2.1';
const STATIC_CACHE  = APP_VERSION;
const DYNAMIC_CACHE = APP_VERSION + '-dynamic';
const FONT_CACHE    = APP_VERSION + '-fonts';

// ── URLs that must NEVER be served from cache (live data / auth) ─────────────
const NETWORK_ONLY_PATTERNS = [
  /firestore\.googleapis\.com/,
  /firebase\.googleapis\.com/,
  /identitytoolkit\.googleapis\.com/,
  /securetoken\.googleapis\.com/,
  /fcm\.googleapis\.com/,
  /fcmregistrations\.googleapis\.com/,
  /firebaseinstallations\.googleapis\.com/,
  /recaptcha\.net/,
  /recaptcha\.google\.com/,
  /www\.google\.com\/recaptcha/,
  /openweathermap\.org/,
  /open-meteo\.com/,
  /geocoding-api\.open-meteo\.com/,
  /anthropic\.com\/v1/,
  /gstatic\.com\/firebasejs/,   // Firebase SDK itself — always fresh
];

// ── URLs served cache-first (stable CDN / fonts) ─────────────────────────────
const CACHE_FIRST_PATTERNS = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /cdnjs\.cloudflare\.com/,
];

// ── App shell URLs to pre-cache on install ───────────────────────────────────
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

/* ════════════════════════════════════════════════════════════════════════════
   INSTALL — pre-cache app shell
════════════════════════════════════════════════════════════════════════════ */
self.addEventListener('install', (event) => {
  console.log('[SW] Install', APP_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // addAll is all-or-nothing; we wrap each in individual add to be resilient
        return Promise.allSettled(
          PRECACHE_URLS.map(url => cache.add(url).catch(err => {
            console.warn('[SW] Pre-cache skip:', url, err.message);
          }))
        );
      })
      .then(() => {
        // Take control immediately so new SW is active without waiting
        return self.skipWaiting();
      })
  );
});

/* ════════════════════════════════════════════════════════════════════════════
   ACTIVATE — clean up old caches
════════════════════════════════════════════════════════════════════════════ */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate', APP_VERSION);
  const validCaches = new Set([STATIC_CACHE, DYNAMIC_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !validCaches.has(key))
            .map((key) => {
              console.log('[SW] Deleting stale cache:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ════════════════════════════════════════════════════════════════════════════
   FETCH — routing strategy
════════════════════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests and http/https URLs
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;

  const url = req.url;

  // ── 1. Network-only: Firebase / Auth / APIs ──────────────────────────────
  if (NETWORK_ONLY_PATTERNS.some(p => p.test(url))) {
    event.respondWith(
      fetch(req).catch(() => new Response(
        JSON.stringify({ error: 'offline' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // ── 2. Cache-first: Google Fonts + CDN ───────────────────────────────────
  if (CACHE_FIRST_PATTERNS.some(p => p.test(url))) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((response) => {
            if (response && response.ok) {
              cache.put(req, response.clone());
            }
            return response;
          }).catch(() => hit); // serve stale on failure
        })
      )
    );
    return;
  }

  // ── 3. Network-first: HTML navigation (always fresh page) ────────────────
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.ok) {
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match('./index.html'))
        )
    );
    return;
  }

  // ── 4. Stale-While-Revalidate: all other requests (JS, CSS, icons…) ──────
  event.respondWith(
    caches.open(DYNAMIC_CACHE).then((cache) =>
      cache.match(req).then((cachedResponse) => {
        // Always fetch fresh in background
        const fetchPromise = fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            cache.put(req, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cachedResponse); // network failed → return stale

        // Return cached immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
    )
  );
});

/* ════════════════════════════════════════════════════════════════════════════
   PUSH — Firebase Cloud Messaging payload handling
════════════════════════════════════════════════════════════════════════════ */
self.addEventListener('push', (event) => {
  let data = {
    title: 'LifeSync',
    body:  'You have a reminder! 🔔',
    icon:  './icon-192.png',
    badge: './icon-192.png',
    url:   './',
  };

  try {
    const payload = event.data ? event.data.json() : {};
    data = { ...data, ...payload };
    // Support FCM data-only messages
    if (payload.data) {
      data.title = payload.data.title || data.title;
      data.body  = payload.data.body  || data.body;
      data.url   = payload.data.url   || data.url;
    }
  } catch (err) {
    // Non-JSON push payload — use text if available
    try { data.body = event.data.text(); } catch (_) {}
  }

  const options = {
    body:    data.body,
    icon:    data.icon,
    badge:   data.badge,
    vibrate: [200, 100, 200],
    data:    { url: data.url },
    tag:     'lifesync-reminder',
    renotify: true,
    actions: [
      { action: 'open',    title: '📋 Open App' },
      { action: 'dismiss', title: '✕ Dismiss'   },
    ],
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

/* ════════════════════════════════════════════════════════════════════════════
   NOTIFICATION CLICK — open or focus app window
════════════════════════════════════════════════════════════════════════════ */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // User clicked "Dismiss" action — do nothing
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // If app already open, focus that tab and send navigation message
        const existingClient = clients.find((c) =>
          c.url.includes(self.location.origin)
        );
        if (existingClient) {
          existingClient.focus();
          existingClient.postMessage({
            type: 'NOTIFICATION_CLICK',
            url: targetUrl,
          });
          return;
        }
        // Otherwise, open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

/* ════════════════════════════════════════════════════════════════════════════
   BACKGROUND SYNC — sync reminders when connectivity restored
════════════════════════════════════════════════════════════════════════════ */
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-reminders') {
    console.log('[SW] Background sync: reminders');
    event.waitUntil(
      // Notify all open clients to trigger Firestore sync
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC' });
        });
      })
    );
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   MESSAGE — handle commands from app
════════════════════════════════════════════════════════════════════════════ */
self.addEventListener('message', (event) => {
  const type = event.data?.type;

  // Update available — skip waiting to activate immediately
  if (type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING — activating new SW');
    self.skipWaiting();
    return;
  }

  // Manual cache clear
  if (type === 'CLEAR_CACHE') {
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => {
        if (event.source) {
          event.source.postMessage({ type: 'CACHE_CLEARED' });
        }
      });
    return;
  }

  // Version ping
  if (type === 'GET_VERSION') {
    if (event.source) {
      event.source.postMessage({ type: 'VERSION', version: APP_VERSION });
    }
    return;
  }
});

console.log('[SW] LifeSync service-worker.js ready —', APP_VERSION);
