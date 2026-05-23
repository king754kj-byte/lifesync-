/**
 * LifeSync PWA — main.js
 * Service Worker (the ONLY SW file — no service-worker.js needed)
 *
 * Strategy:
 *   - Firebase / API calls  → Network-only (never cached)
 *   - Google Fonts / CDN    → Cache-first  (long-lived)
 *   - HTML pages (navigate) → Network-first, cache fallback → offline.html
 *   - Everything else       → Stale-while-revalidate
 *
 * Cache versioning:
 *   Bump CACHE_VERSION to force full cache replacement on next deploy.
 *   Old caches are deleted automatically during the activate phase.
 */

'use strict';

// ─── VERSION ───────────────────────────────────────────────────────────────
const CACHE_VERSION  = 'v3';
const STATIC_CACHE   = `lifesync-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE  = `lifesync-dynamic-${CACHE_VERSION}`;
const FONT_CACHE     = `lifesync-fonts-${CACHE_VERSION}`;
const ALL_CACHES     = [STATIC_CACHE, DYNAMIC_CACHE, FONT_CACHE];

// ─── STATIC SHELL (pre-cached on install) ─────────────────────────────────
const STATIC_SHELL = [
  './',
  './index.html',
  './offline.html',
  './app.js',
  './manifest.json',
];

// ─── NETWORK-ONLY PATTERNS ────────────────────────────────────────────────
// These are always fetched fresh — never served from cache
const NETWORK_ONLY = [
  /firestore\.googleapis\.com/,
  /firebase\.googleapis\.com/,
  /identitytoolkit\.googleapis\.com/,
  /securetoken\.googleapis\.com/,
  /fcm\.googleapis\.com/,
  /recaptcha\.net/,
  /recaptcha\.google\.com/,
  /openweathermap\.org/,
  /open-meteo\.com/,
  /geocoding-api\.open-meteo\.com/,
  /anthropic\.com\/v1/,
];

// ─── CACHE-FIRST PATTERNS ─────────────────────────────────────────────────
// Long-lived assets: served from cache, updated in background
const CACHE_FIRST = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /cdnjs\.cloudflare\.com/,
  /gstatic\.com/,
];

// ─── HELPERS ──────────────────────────────────────────────────────────────
function isNetworkOnly(url) {
  return NETWORK_ONLY.some(p => p.test(url));
}
function isCacheFirst(url) {
  return CACHE_FIRST.some(p => p.test(url));
}

// ─── INSTALL ──────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing', CACHE_VERSION);

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        // Add each file individually — one failure won't abort entire install
        return Promise.allSettled(
          STATIC_SHELL.map(url => cache.add(url).catch(err => {
            console.warn('[SW] Failed to pre-cache:', url, err.message);
          }))
        );
      })
      // Skip waiting immediately — new SW takes control without waiting
      // for all tabs to close.  The client-side code handles the reload.
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating', CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then(existingCaches => {
        const toDelete = existingCaches.filter(name => !ALL_CACHES.includes(name));
        if (toDelete.length) {
          console.log('[SW] Deleting old caches:', toDelete);
        }
        return Promise.all(toDelete.map(name => caches.delete(name)));
      })
      .then(() => self.clients.claim())   // Take control of all open pages
  );
});

// ─── FETCH ────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req  = event.request;
  const url  = req.url;

  // Ignore non-GET and non-http(s)
  if (req.method !== 'GET' || !url.startsWith('http')) return;

  // ── Network-only (Firebase, AI APIs, weather) ──────────────────
  if (isNetworkOnly(url)) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // ── Cache-first (fonts, CDN) ───────────────────────────────────
  if (isCacheFirst(url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(response => {
            if (response.ok) cache.put(req, response.clone());
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // ── Navigation (page loads) — network-first, offline fallback ──
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(response => {
          if (response.ok) {
            caches.open(STATIC_CACHE)
              .then(cache => cache.put(req, response.clone()))
              .catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(req)
            .then(cached => cached || caches.match('./offline.html'))
        )
    );
    return;
  }

  // ── Everything else — stale-while-revalidate ───────────────────
  event.respondWith(
    caches.open(DYNAMIC_CACHE).then(cache =>
      cache.match(req).then(cached => {
        const networkFetch = fetch(req)
          .then(response => {
            if (response.ok) cache.put(req, response.clone()).catch(() => {});
            return response;
          })
          .catch(() => cached || new Response('', { status: 503 }));

        // Return cache immediately if available, revalidate in background
        return cached || networkFetch;
      })
    )
  );
});

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'LifeSync', body: 'You have a reminder!', url: '/' };
  try {
    if (event.data) Object.assign(data, event.data.json());
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:      data.body,
      icon:      './icon-192.png',
      badge:     './icon-192.png',
      vibrate:   [100, 50, 100],
      tag:       'lifesync-reminder',
      renotify:  true,
      data:      { url: data.url },
      actions: [
        { action: 'open',    title: 'Open App' },
        { action: 'dismiss', title: 'Dismiss'  },
      ],
    })
  );
});

// ─── NOTIFICATION CLICK ───────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Focus existing window if already open
        const existing = clients.find(c =>
          c.url.includes(self.location.origin)
        );
        if (existing) {
          existing.focus();
          existing.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl });
        } else {
          self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ─── MESSAGES FROM CLIENT ─────────────────────────────────────────────────
self.addEventListener('message', event => {
  // Client sends SKIP_WAITING → SW activates immediately
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received — activating now');
    self.skipWaiting();
  }

  // Client requests cache info (debug / admin panel)
  if (event.data?.type === 'GET_CACHE_VERSION') {
    event.source?.postMessage({ type: 'CACHE_VERSION', version: CACHE_VERSION });
  }
});

// ─── BACKGROUND SYNC ──────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync-reminders') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'BACKGROUND_SYNC' }))
      )
    );
  }
});

console.log('[SW] LifeSync main.js ready —', CACHE_VERSION);
