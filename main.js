/**
 * LifeSync PWA — Service Worker
 * Version: 5.5
 * Cache: lifesync-v5.5
 *
 * Strategy:
 *  - Cache-first for static assets (shell)
 *  - Network-first for HTML navigation (always fresh)
 *  - Stale-while-revalidate for fonts/CDN
 *  - Safe cleanup: only delete OWN old caches, never foreign ones
 *  - Update notification: fires ONCE per new SW activation, never loops
 */

const APP_VERSION  = '5.5';
const CACHE_NAME   = 'lifesync-v5.5';

// All files that make up the app shell — cached on install
const SHELL_FILES = [
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

// ─── INSTALL ────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache each file individually — one failure won't break the whole install
      return Promise.allSettled(
        SHELL_FILES.map(url =>
          cache.add(url).catch(err => {
            console.warn(`[SW] Failed to cache ${url}:`, err.message);
          })
        )
      );
    }).then(() => {
      console.log(`[SW v${APP_VERSION}] Installed & shell cached.`);
      // Do NOT call skipWaiting() here — wait for user to confirm update
      // This prevents the infinite update notification loop
    })
  );
});

// ─── ACTIVATE ───────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => {
            // Only delete LifeSync caches that are NOT the current version
            return key.startsWith('lifesync-') && key !== CACHE_NAME;
          })
          .map(key => {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
      );
    }).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    }).then(() => {
      // Notify all clients that the new SW is active — fire ONCE
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: APP_VERSION,
            cache: CACHE_NAME,
          });
        });
      });
    })
  );
});

// ─── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin + CDN (fonts, etc.) — ignore cross-origin API calls
  if (
    request.method !== 'GET' ||
    (!url.origin.includes(self.location.hostname) &&
     !url.hostname.includes('fonts.googleapis.com') &&
     !url.hostname.includes('fonts.gstatic.com'))
  ) {
    return; // Let browser handle it
  }

  // HTML navigation → Network-first, fallback to cache, fallback to offline.html
  if (request.mode === 'navigate' || request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Update the cache with fresh HTML
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached || caches.match('./offline.html')
          )
        )
    );
    return;
  }

  // Fonts & external CDN → Stale-while-revalidate
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(response => {
            cache.put(request, response.clone());
            return response;
          });
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // App shell & static assets → Cache-first, fallback to network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        // Don't cache non-2xx or opaque responses for app shell
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => {
        // Last-resort: serve offline page for document requests
        if (request.headers.get('Accept')?.includes('text/html')) {
          return caches.match('./offline.html');
        }
      });
    })
  );
});

// ─── MESSAGE HANDLER ────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  const { data } = event;
  if (!data) return;

  // App confirmed "Update Now" — skip waiting and reload
  if (data.type === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting — activating new SW now.');
    self.skipWaiting();
  }

  // App asking for current version info
  if (data.type === 'GET_VERSION') {
    event.source?.postMessage({
      type: 'SW_VERSION',
      version: APP_VERSION,
      cache: CACHE_NAME,
    });
  }
});
