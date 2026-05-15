// ══════════════════════════════════════════
//  LifeSync V2.1 — service-worker.js
//  PWA Cache: offline-first, background sync
// ══════════════════════════════════════════

const CACHE_NAME    = "lifesync-v2.1";
const OFFLINE_URL   = "./offline.html";

// ── Assets to pre-cache on install ───────────────────────────────────────────
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.json",
  "./style.css",
  "./app.js",
  "./reminder-system.js",
  "./notifications.js",
  "./settings-manager.js",
  "./icon-192.png",
  "./icon-512.png",
  "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap",
];

// ── External API domains to cache on fetch (network-first then cache) ─────────
const NETWORK_FIRST_ORIGINS = [
  "geocoding-api.open-meteo.com",
  "api.open-meteo.com",
];

// ── Install: pre-cache core assets ───────────────────────────────────────────
self.addEventListener("install", event => {
  console.log("[SW v2.1] install");
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(e => console.warn("[SW] precache skip:", url, e.message))
        )
      );
    })
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener("activate", event => {
  console.log("[SW v2.1] activate");
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => { console.log("[SW] delete old cache:", k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: offline-first strategy ────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, or Firebase requests
  if (request.method !== "GET") return;
  if (url.protocol === "chrome-extension:") return;
  if (url.hostname.includes("firebaseapp.com") ||
      url.hostname.includes("googleapis.com") && url.pathname.includes("firebase")) return;

  // External weather APIs → network-first, fallback to cache
  if (NETWORK_FIRST_ORIGINS.some(h => url.hostname.includes(h))) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Font files → cache-first (long-lived)
  if (url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com") {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // App shell → cache-first with offline fallback
  event.respondWith(cacheFirstWithOfflineFallback(request));
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function cacheFirstWithOfflineFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch {
    // Return offline page for navigation requests
    if (request.mode === "navigate") {
      const offlinePage = await caches.match(OFFLINE_URL);
      if (offlinePage) return offlinePage;
    }
    return new Response("Offline — LifeSync V2.1", { status: 503 });
  }
}

async function networkFirstStrategy(request) {
  try {
    const resp = await fetch(request, { signal: AbortSignal.timeout?.(5000) });
    if (resp.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ offline: true }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ── Background sync placeholder ───────────────────────────────────────────────
self.addEventListener("sync", event => {
  if (event.tag === "lifesync-sync") {
    console.log("[SW v2.1] background sync triggered");
    // Future: sync Firebase data when back online
  }
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener("push", event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: "LifeSync", body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification("LifeSync: " + (payload.title || "Reminder"), {
      body:   payload.body || "You have a new notification",
      icon:   "./icon-192.png",
      badge:  "./icon-192.png",
      vibrate:[100, 50, 100],
      tag:    "lifesync-push",
      data:   payload,
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes("lifesync") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow("./");
    })
  );
});
