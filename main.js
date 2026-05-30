/* ============================================================
   LifeSync PWA — Service Worker  (main.js)
   Version  : 6.1
   Cache    : lifesync-v6.1
   Scope    : ./
   Strategy : Cache-first static · Network-first navigation
   ============================================================ */

'use strict';

const APP_VERSION = '6.1';
const CACHE_NAME  = 'lifesync-v6.1';

/* ── Core assets to pre-cache on install ─────────────────── */
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './main.js',
  './manifest.json',
  './styles.css',
  './offline.html',
  './icon-192.png',
  './icon-512.png',
];

/* ── Patterns that must NOT be cached (external / dynamic) ── */
const BYPASS_PATTERNS = [
  /^https:\/\/(www\.)?gstatic\.com/,
  /^https:\/\/firestore\.googleapis\.com/,
  /^https:\/\/firebase\.googleapis\.com/,
  /^https:\/\/identitytoolkit\.googleapis\.com/,
  /^https:\/\/securetoken\.googleapis\.com/,
  /^https:\/\/fonts\.googleapis\.com/,
  /^https:\/\/fonts\.gstatic\.com/,
  /^https:\/\/api\.open-meteo\.com/,
  /^https:\/\/api\.weatherapi\.com/,
  /^https:\/\/fcm\.googleapis\.com/,
  /^https:\/\/recaptcha\.net/,
  /^https:\/\/www\.google\.com\/recaptcha/,
];

/* ══════════════════════════════════════════════════════════
   INSTALL — pre-cache core assets
══════════════════════════════════════════════════════════ */
self.addEventListener('install', (event) => {
  console.log(`[SW ${APP_VERSION}] Installing — cache: ${CACHE_NAME}`);

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      /*
       * Use individual addAll calls so a single 404 doesn't
       * blow up the entire install (icons may not exist yet).
       */
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn(`[SW] Precache miss (non-fatal): ${url}`, err.message);
          })
        )
      );
    })
  );
  /*
   * DO NOT call self.skipWaiting() here.
   * We wait for the user to trigger "Update Now" via postMessage.
   * This prevents surprise reloads and breaks the update-popup loop.
   */
});

/* ══════════════════════════════════════════════════════════
   ACTIVATE — safe cleanup of old caches only
══════════════════════════════════════════════════════════ */
self.addEventListener('activate', (event) => {
  console.log(`[SW ${APP_VERSION}] Activating`);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      const toDelete = cacheNames.filter(
        (name) =>
          /* Only delete LifeSync caches — never touch foreign caches */
          name.startsWith('lifesync-') && name !== CACHE_NAME
      );

      if (toDelete.length) {
        console.log('[SW] Removing old caches:', toDelete);
      }

      return Promise.all(toDelete.map((name) => caches.delete(name)));
    }).then(() => {
      /*
       * claim() makes this SW control all open tabs immediately
       * after activation — so users don't need to reload manually
       * when the SW updates for the very first time.
       */
      return self.clients.claim();
    })
  );
});

/* ══════════════════════════════════════════════════════════
   FETCH — routing strategy
══════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  /* Only handle GET */
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* ── Bypass: external / Firebase / fonts / weather APIs ── */
  if (BYPASS_PATTERNS.some((re) => re.test(request.url))) return;

  /* ── Navigation requests (HTML pages): Network-first ──────
     Keeps the app always up-to-date while still working offline */
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  /* ── Same-origin static assets: Cache-first ─────────────── */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }
});

/* ── Network-first for navigation ───────────────────────── */
async function networkFirstNavigate(request) {
  try {
    const networkResponse = await fetch(request);
    /* Cache a fresh copy on success */
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_err) {
    /* Offline — serve cached index.html or offline fallback */
    const cachedIndex = await caches.match('./index.html');
    if (cachedIndex) return cachedIndex;
    const offline = await caches.match('./offline.html');
    return offline || new Response('You are offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/* ── Cache-first for static assets ──────────────────────── */
async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_err) {
    /* Last-resort: offline page */
    return (await caches.match('./offline.html')) ||
      new Response('Offline', { status: 503 });
  }
}

/* ══════════════════════════════════════════════════════════
   MESSAGE — inter-thread communication
══════════════════════════════════════════════════════════ */
self.addEventListener('message', (event) => {
  if (!event.data || !event.data.type) return;

  switch (event.data.type) {

    /*
     * SKIP_WAITING — sent by app.js when the user taps "Update Now".
     * Calling skipWaiting here (and ONLY here) ensures the update
     * only happens when the user explicitly requests it.
     */
    case 'SKIP_WAITING':
      console.log('[SW] skipWaiting() requested by client');
      self.skipWaiting();
      break;

    /* GET_VERSION — diagnostic / version-check from the app */
    case 'GET_VERSION':
      event.source?.postMessage({
        type:      'SW_VERSION',
        version:   APP_VERSION,
        cacheName: CACHE_NAME,
      });
      break;

    /* CLEAR_CACHE — manual cache wipe (admin / debug) */
    case 'CLEAR_CACHE':
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('lifesync-'))
            .map((k) => caches.delete(k))
        )
      ).then(() => {
        event.source?.postMessage({ type: 'CACHE_CLEARED' });
        console.log('[SW] All LifeSync caches cleared');
      });
      break;

    default:
      break;
  }
});

/* ══════════════════════════════════════════════════════════
   PUSH — background notification support (future-proof)
══════════════════════════════════════════════════════════ */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try   { payload = event.data.json(); }
  catch { payload = { title: 'LifeSync', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'LifeSync', {
      body:    payload.body  || '',
      icon:    payload.icon  || './icon-192.png',
      badge:   payload.badge || './icon-192.png',
      data:    payload.data  || {},
      tag:     payload.tag   || 'lifesync-notif',
      renotify: false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        if (clientList.length > 0) return clientList[0].focus();
        return self.clients.openWindow('./');
      })
  );
});

console.log(`[SW] LifeSync Service Worker v${APP_VERSION} loaded ✓`);
