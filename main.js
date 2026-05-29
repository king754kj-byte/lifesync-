/**
 * LifeSync PWA v6.0 — main.js
 * Full Service Worker: caching, offline, install, update (no loop)
 *
 * Rules:
 *  - This file IS the service worker. Registered by app.js only.
 *  - CACHE_NAME is versioned. Old caches are deleted on activate.
 *  - Update notification fires ONCE per new SW, then is suppressed.
 *  - skipWaiting is ONLY called when the user explicitly clicks Update.
 */

const APP_VERSION  = '6.0';
const CACHE_NAME   = 'lifesync-v6.0';

// ─── Files to pre-cache on install ──────────────────────────────────────────
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/app.js',
  '/main.js',
  '/styles.css',
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ─── Network-first routes (always try network, fall back to cache) ───────────
const NETWORK_FIRST_PATTERNS = [
  /firestore\.googleapis\.com/,
  /firebase/,
  /razorpay/,
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /gstatic\.com/,
];

// ─── Cache-first routes (local assets, serve from cache instantly) ───────────
const CACHE_FIRST_PATTERNS = [
  /\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf)$/,
];

// ────────────────────────────────────────────────────────────────────────────
//  INSTALL — pre-cache core assets
// ────────────────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log(`[SW ${APP_VERSION}] install`);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Add each URL individually so one failure doesn't block the rest
        return Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) =>
              console.warn(`[SW] Pre-cache skip: ${url}`, err)
            )
          )
        );
      })
      .then(() => {
        console.log(`[SW ${APP_VERSION}] install complete`);
        // Do NOT call self.skipWaiting() here.
        // Wait for explicit user action to avoid surprise reloads.
      })
  );
});

// ────────────────────────────────────────────────────────────────────────────
//  ACTIVATE — clean up old caches, take control
// ────────────────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log(`[SW ${APP_VERSION}] activate`);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((oldCache) => {
              console.log(`[SW] Deleting old cache: ${oldCache}`);
              return caches.delete(oldCache);
            })
        );
      })
      .then(() => self.clients.claim())
      .then(() => {
        console.log(`[SW ${APP_VERSION}] activated, clients claimed`);
        // Notify clients that a new version is active
        return self.clients.matchAll({ type: 'window' });
      })
      .then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: 'SW_ACTIVATED', version: APP_VERSION })
        );
      })
  );
});

// ────────────────────────────────────────────────────────────────────────────
//  FETCH — smart routing strategy
// ────────────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin API calls we don't cache
  if (request.method !== 'GET') return;

  // Network-first for dynamic/external resources
  if (NETWORK_FIRST_PATTERNS.some((p) => p.test(request.url))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for static assets
  if (CACHE_FIRST_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests — network first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Default: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ────────────────────────────────────────────────────────────────────────────
//  FETCH STRATEGIES
// ────────────────────────────────────────────────────────────────────────────

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return new Response('', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache    = await caches.open(CACHE_NAME);
  const cached   = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || fetchPromise || new Response('', { status: 503 });
}

async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    // Try cached version of the requested page
    const cached = await caches.match(request);
    if (cached) return cached;

    // Try cached index.html (SPA shell)
    const indexCached = await caches.match('/index.html');
    if (indexCached) return indexCached;

    // Last resort: offline page
    const offline = await caches.match('/offline.html');
    return offline || new Response('<h1>Offline</h1>', {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  MESSAGE HANDLING
//  Receives messages from app.js / main page
// ────────────────────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const { data } = event;
  if (!data) return;

  switch (data.type) {
    // User confirmed: apply update and reload
    case 'SKIP_WAITING':
      console.log('[SW] skipWaiting requested by user');
      self.skipWaiting();
      break;

    // Client asking for current version
    case 'GET_VERSION':
      event.source?.postMessage({
        type: 'SW_VERSION',
        version: APP_VERSION,
        cache: CACHE_NAME,
      });
      break;

    // Manual cache clear (developer / admin action)
    case 'CLEAR_CACHE':
      caches.keys()
        .then((names) => Promise.all(names.map((n) => caches.delete(n))))
        .then(() => event.source?.postMessage({ type: 'CACHE_CLEARED' }));
      break;

    default:
      break;
  }
});

// ────────────────────────────────────────────────────────────────────────────
//  PUSH NOTIFICATIONS (future-ready stub)
// ────────────────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = { title: 'LifeSync', body: 'You have a new notification' };
  try { payload = { ...payload, ...event.data.json() }; } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:    payload.body,
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [100, 50, 100],
      data:    payload.data || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        if (clientList.length > 0) return clientList[0].focus();
        return clients.openWindow('/');
      })
  );
});

console.log(`[SW] LifeSync v${APP_VERSION} loaded (cache: ${CACHE_NAME})`);
