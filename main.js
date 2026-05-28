/**
 * LifeSync PWA — Service Worker (main.js)
 * Version: 5.8
 * Cache: lifesync-v5.8
 *
 * ─ Single file, no service-worker.js companion
 * ─ Stable update flow — no popup loops
 * ─ Safe cache cleanup — only removes known LS caches
 * ─ Offline fallback via offline.html
 * ─ GitHub Pages compatible
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const APP_VERSION  = '5.8';
const CACHE_NAME   = 'lifesync-v5.8';

/**
 * Files to pre-cache on install.
 * Adjust paths if your GitHub Pages repo is in a subdirectory.
 * e.g. if your repo is github.com/user/lifesync, base path stays './'
 */
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './offline.html',
  './icon-192.png',
  './icon-512.png',
];

/**
 * Only caches belonging to THIS app are cleaned up.
 * This prevents accidentally nuking other PWA caches on the same origin.
 */
const CACHE_PREFIX = 'lifesync-v';

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', function (event) {
  console.log('[SW v' + APP_VERSION + '] Installing…');

  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Use individual adds so one missing file doesn't abort everything
      const preCachePromises = PRECACHE_URLS.map(function (url) {
        return cache.add(url).catch(function (err) {
          console.warn('[SW] Could not pre-cache: ' + url, err.message);
        });
      });
      return Promise.all(preCachePromises);
    }).then(function () {
      console.log('[SW v' + APP_VERSION + '] Pre-cache complete.');
      /**
       * IMPORTANT: Do NOT call skipWaiting() here automatically.
       * This is the root cause of infinite update loops.
       * skipWaiting is only triggered by an explicit message from app.js
       * after the user taps "Update" — see message handler below.
       */
    })
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', function (event) {
  console.log('[SW v' + APP_VERSION + '] Activating…');

  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          // Only delete OLD LifeSync caches, never touch foreign caches
          if (
            cacheName.startsWith(CACHE_PREFIX) &&
            cacheName !== CACHE_NAME
          ) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function () {
      console.log('[SW v' + APP_VERSION + '] Activated. Claiming clients…');
      // Claim all open tabs/windows immediately
      return self.clients.claim();
    })
  );
});

// ─── Fetch — Network-first for HTML, Cache-first for assets ───────────────────
self.addEventListener('fetch', function (event) {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Ignore non-http(s) requests (chrome-extension://, etc.)
  if (!req.url.startsWith('http')) return;

  // Ignore cross-origin requests (Firebase, CDN fonts, etc.) — let them go direct
  const reqUrl = new URL(req.url);
  if (reqUrl.origin !== self.location.origin) return;

  event.respondWith(handleFetch(req));
});

async function handleFetch(req) {
  const url = new URL(req.url);
  const isNavigate = req.mode === 'navigate';

  try {
    if (isNavigate) {
      // ── Navigation: Network-first, fallback to cache, then offline.html ──
      try {
        const networkRes = await fetch(req);
        if (networkRes && networkRes.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkRes.clone()); // update cache silently
          return networkRes;
        }
      } catch (_) {
        // Network failed — try cache
      }
      const cached = await caches.match(req);
      if (cached) return cached;
      // Last resort: offline page
      const offlinePage = await caches.match('./offline.html');
      return offlinePage || new Response('<h1>Offline</h1>', {
        headers: { 'Content-Type': 'text/html' },
      });
    } else {
      // ── Assets: Cache-first, revalidate in background ──
      const cached = await caches.match(req);
      if (cached) {
        // Revalidate in background (stale-while-revalidate)
        revalidate(req);
        return cached;
      }
      // Not in cache — fetch and store
      const networkRes = await fetch(req);
      if (networkRes && networkRes.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, networkRes.clone());
      }
      return networkRes;
    }
  } catch (err) {
    // Network + cache both failed
    if (isNavigate) {
      const offlinePage = await caches.match('./offline.html');
      return offlinePage || new Response('<h1>Offline</h1>', {
        headers: { 'Content-Type': 'text/html' },
      });
    }
    throw err;
  }
}

function revalidate(req) {
  fetch(req).then(function (res) {
    if (res && res.ok) {
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(req, res);
      });
    }
  }).catch(function () { /* offline, ignore */ });
}

// ─── Message Handler ──────────────────────────────────────────────────────────
/**
 * app.js sends messages to the SW.
 * - { type: 'SKIP_WAITING' }  → called only after user taps "Update"
 * - { type: 'GET_VERSION' }   → responds with current SW version
 */
self.addEventListener('message', function (event) {
  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'SKIP_WAITING':
      console.log('[SW] SKIP_WAITING received. Activating new SW…');
      self.skipWaiting();
      break;

    case 'GET_VERSION':
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ version: APP_VERSION, cache: CACHE_NAME });
      }
      break;

    default:
      break;
  }
});
