/**
 * LifeSync v5.0 — Service Worker (main.js)
 *
 * Rules:
 *  - ONE cache name tied to APP_VERSION — bump version to force refresh
 *  - Install: pre-cache shell assets
 *  - Activate: delete ALL old caches (no duplicates)
 *  - Fetch: cache-first for shell, network-first for API/external
 *  - Update popup fires ONCE per SW lifecycle via postMessage
 *  - No infinite update loops — skipWaiting only on explicit client message
 */

const APP_VERSION  = '5.0';
const CACHE_NAME   = 'lifesync-v5.0';

/* ── Shell assets to pre-cache on install ─────────────────────────────── */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app.js',
  './offline.html',
  './icon-192.png',
  './icon-512.png',
];

/* ── INSTALL ──────────────────────────────────────────────────────────── */
self.addEventListener('install', (event) => {
  console.log(`[SW ${APP_VERSION}] Installing…`);

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Add shell assets; ignore failures for optional assets (icons may 404)
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Pre-cache skip: ${url}`, err.message);
          })
        )
      );
    })
    // Do NOT call skipWaiting() here — wait for client approval
    // to prevent surprise reloads while user is mid-session
  );
});

/* ── ACTIVATE ─────────────────────────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  console.log(`[SW ${APP_VERSION}] Activating — cleaning old caches…`);

  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
      );
    }).then(() => {
      // Take control of all open clients immediately after activation
      return self.clients.claim();
    })
  );
});

/* ── FETCH ────────────────────────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (CDN fonts, Firebase, etc.)
  if (url.origin !== self.location.origin) return;

  // Skip chrome-extension and other non-http schemes
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(cacheFirst(request));
});

/**
 * Cache-first strategy:
 *  1. Return cached response if available
 *  2. Otherwise fetch from network, cache a clone, return response
 *  3. On network error, return offline.html for navigation requests
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) {
    // Serve from cache; update in background for HTML/JS/CSS
    const ext = new URL(request.url).pathname.split('.').pop().toLowerCase();
    if (['html', 'js', 'css'].includes(ext)) {
      updateInBackground(cache, request);
    }
    return cached;
  }

  // Not in cache — try network
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (_err) {
    // Network failed — return offline page for navigation
    if (request.mode === 'navigate') {
      const offline = await cache.match('./offline.html');
      if (offline) return offline;
    }
    // For other assets return a minimal error response
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/** Silently refresh a cached asset in the background (stale-while-revalidate) */
function updateInBackground(cache, request) {
  fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type !== 'opaque') {
        cache.put(request, response);
      }
    })
    .catch(() => { /* ignore — offline */ });
}

/* ── MESSAGE HANDLER ──────────────────────────────────────────────────── */
/**
 * Clients send messages to control the SW:
 *
 *  { type: 'SKIP_WAITING' }
 *    → SW takes over immediately (user clicked "Update" in popup)
 *
 *  { type: 'GET_VERSION' }
 *    → SW replies with current version string
 */
self.addEventListener('message', (event) => {
  if (!event.data || !event.data.type) return;

  switch (event.data.type) {
    case 'SKIP_WAITING':
      console.log(`[SW ${APP_VERSION}] Skip waiting — updating now`);
      self.skipWaiting();
      break;

    case 'GET_VERSION':
      if (event.source) {
        event.source.postMessage({
          type: 'SW_VERSION',
          version: APP_VERSION,
          cacheName: CACHE_NAME,
        });
      }
      break;

    default:
      break;
  }
});
