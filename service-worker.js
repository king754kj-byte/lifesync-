// LifeSync Service Worker v1.0
// Smart caching: Network-first for API/Firebase, Cache-first for static assets

const APP_VERSION   = 'lifesync-v1.0.0';
const STATIC_CACHE  = `${APP_VERSION}-static`;
const DYNAMIC_CACHE = `${APP_VERSION}-dynamic`;
const FONT_CACHE    = `${APP_VERSION}-fonts`;

// Assets to pre-cache on install (app shell)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Patterns that should ALWAYS go to network (Firebase, APIs)
const NETWORK_ONLY_PATTERNS = [
  /firestore\.googleapis\.com/,
  /firebase\.googleapis\.com/,
  /identitytoolkit\.googleapis\.com/,
  /securetoken\.googleapis\.com/,
  /fcm\.googleapis\.com/,
  /recaptcha\.net/,
  /recaptcha\.google\.com/,
  /openweathermap\.org/,
  /anthropic\.com\/v1/
];

// Patterns for cache-first (fonts, CDN assets)
const CACHE_FIRST_PATTERNS = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /cdnjs\.cloudflare\.com/
];

// ── INSTALL ────────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing', APP_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()) // Activate immediately
      .catch(err => console.warn('[SW] Pre-cache error:', err))
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating', APP_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== FONT_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim()) // Take control of all tabs
  );
});

// ── FETCH ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser-extension requests
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  // 1. Network-only for Firebase/API calls
  if (NETWORK_ONLY_PATTERNS.some(p => p.test(request.url))) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // 2. Cache-first for fonts & CDN
  if (CACHE_FIRST_PATTERNS.some(p => p.test(request.url))) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // 3. App shell (HTML) — Network-first with cache fallback
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/')))
    );
    return;
  }

  // 4. Static assets (icons, manifest) — Cache-first
  if (PRECACHE_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset.replace('/', '')))) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) caches.open(STATIC_CACHE).then(c => c.put(request, response.clone()));
        return response;
      }))
    );
    return;
  }

  // 5. Everything else — Stale-while-revalidate
  event.respondWith(
    caches.open(DYNAMIC_CACHE).then(cache =>
      cache.match(request).then(cached => {
        const fetchPromise = fetch(request).then(response => {
          if (response.ok && response.status < 400) {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});

// ── PUSH NOTIFICATIONS ─────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'LifeSync', body: 'You have a new reminder!' };
  try { data = { ...data, ...event.data.json() }; } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [100, 50, 100],
      data:    { url: data.url || '/' },
      actions: [
        { action: 'open',    title: '📱 Open App' },
        { action: 'dismiss', title: '✕ Dismiss' }
      ],
      tag:     'lifesync-reminder',
      renotify: true
    })
  );
});

// ── NOTIFICATION CLICK ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const existing = clients.find(c => c.url.includes(self.location.origin));
        if (existing) { existing.focus(); existing.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl }); }
        else self.clients.openWindow(targetUrl);
      })
  );
});

// ── BACKGROUND SYNC ────────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync-reminders') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'BACKGROUND_SYNC' }))
      )
    );
  }
});

// ── MESSAGE HANDLER ────────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    caches.open(DYNAMIC_CACHE).then(cache => cache.addAll(urls)).catch(() => {});
  }
});

console.log('[SW] LifeSync Service Worker loaded —', APP_VERSION);
