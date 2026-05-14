/* ═══════════════════════════════════════════════════
   LifeSync Premium — Service Worker
   GitHub Pages / PWABuilder / AppsGeyser Compatible
   Version: lifesync-premium-v1
═══════════════════════════════════════════════════ */

const CACHE_NAME = "lifesync-premium-v1";

const STATIC_CACHE  = CACHE_NAME + "-static";
const DYNAMIC_CACHE = CACHE_NAME + "-dynamic";
const FONT_CACHE    = CACHE_NAME + "-fonts";

/* Assets to pre-cache on install */
const urlsToCache = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

/* URLs that must always go to the network (Firebase, APIs) */
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

/* URLs that are safe to serve from cache first */
const CACHE_FIRST_PATTERNS = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /cdnjs\.cloudflare\.com/
];

/* ── Install: pre-cache shell ─────────────────────── */
self.addEventListener("install", (event) => {
  console.log("[SW] Installing", CACHE_NAME);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        /* addAll can fail if any URL is missing — use individual adds */
        return Promise.allSettled(
          urlsToCache.map(url =>
            cache.add(url).catch(err =>
              console.warn("[SW] Pre-cache skip:", url, err.message)
            )
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: clean old caches ───────────────────── */
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating", CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (
            cache !== STATIC_CACHE &&
            cache !== DYNAMIC_CACHE &&
            cache !== FONT_CACHE
          ) {
            console.log("[SW] Deleting old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* ── Fetch: smart routing ─────────────────────────── */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  /* Only handle GET requests over http/https */
  if (req.method !== "GET" || !req.url.startsWith("http")) return;

  /* 1. Network-only: Firebase & live APIs — never cache */
  if (NETWORK_ONLY_PATTERNS.some(p => p.test(req.url))) {
    event.respondWith(
      fetch(req).catch(() => new Response("", { status: 503 }))
    );
    return;
  }

  /* 2. Cache-first: Google Fonts & CDN assets */
  if (CACHE_FIRST_PATTERNS.some(p => p.test(req.url))) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(req).then((hit) =>
          hit || fetch(req).then((r) => {
            if (r.ok) cache.put(req, r.clone());
            return r;
          })
        )
      )
    );
    return;
  }

  /* 3. Navigation (HTML): network-first, fallback to cache */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            caches.open(STATIC_CACHE).then((c) => c.put(req, r.clone()));
          }
          return r;
        })
        .catch(() =>
          caches.match(req).then(
            (hit) => hit || caches.match("./index.html")
          )
        )
    );
    return;
  }

  /* 4. Everything else: stale-while-revalidate */
  event.respondWith(
    caches.open(DYNAMIC_CACHE).then((cache) =>
      cache.match(req).then((hit) => {
        const fresh = fetch(req)
          .then((r) => {
            if (r.ok) cache.put(req, r.clone());
            return r;
          })
          .catch(() => hit);
        return hit || fresh;
      })
    )
  );
});

/* ── Push notifications ───────────────────────────── */
self.addEventListener("push", (event) => {
  let data = { title: "LifeSync", body: "You have a reminder!" };
  try { data = { ...data, ...event.data.json() }; } catch (err) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      vibrate: [100, 50, 100],
      data: { url: data.url || "./" },
      actions: [
        { action: "open",    title: "Open App" },
        { action: "dismiss", title: "Dismiss"  }
      ],
      tag: "lifesync",
      renotify: true
    })
  );
});

/* ── Notification click ───────────────────────────── */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const url = event.notification.data?.url || "./";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const win = clients.find((c) => c.url.includes(self.location.origin));
        if (win) {
          win.focus();
          win.postMessage({ type: "NOTIFICATION_CLICK", url });
        } else {
          self.clients.openWindow(url);
        }
      })
  );
});

/* ── Message from page (skip waiting) ────────────── */
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

console.log("[SW] LifeSync Premium SW ready —", CACHE_NAME);
