/**
 * LifeSync — app.js
 *
 * Responsibilities:
 *   1. Register main.js as the service worker (single registration, no duplicates)
 *   2. Hand the registration to index.html's PWA controller via
 *      window._pwaAttachSWListeners(reg)
 *
 * This file must be a classic script (not ES module) so it can be
 * loaded with <script type="module" src="./app.js"> — the SW scope
 * detection still works correctly.
 *
 * IMPORTANT: Do NOT add any other service worker registration anywhere.
 * main.js is the ONLY service worker.
 */

'use strict';

(async function registerSW() {
  // Guard — browser must support SW
  if (!('serviceWorker' in navigator)) {
    console.warn('[app.js] Service workers not supported in this browser.');
    return;
  }

  // Prevent double-registration on hot-reload / module re-evaluation
  if (window._swRegistered) {
    console.log('[app.js] SW already registered — skipping.');
    return;
  }
  window._swRegistered = true;

  try {
    // ── Register main.js as the service worker ──────────────────
    const reg = await navigator.serviceWorker.register('./main.js', {
      scope:        './',
      updateViaCache: 'none',   // Always check server for updated SW file
    });

    console.log('[app.js] main.js registered ✓  scope:', reg.scope);

    // ── Hand registration to the PWA controller in index.html ───
    // _pwaAttachSWListeners sets up:
    //   • update popup (fires only once per session)
    //   • controllerchange → reload
    //   • message handler (BACKGROUND_SYNC, NOTIFICATION_CLICK)
    //   • background sync tag
    if (typeof window._pwaAttachSWListeners === 'function') {
      window._pwaAttachSWListeners(reg);
    } else {
      // PWA controller script not yet executed — wait for it
      window._pendingSWReg = reg;
      console.warn('[app.js] _pwaAttachSWListeners not ready yet; stored in window._pendingSWReg');
    }

    // ── Check for updates every 60 minutes ──────────────────────
    setInterval(() => {
      reg.update().catch(() => {}); // Silently ignore if offline
    }, 60 * 60 * 1000);

  } catch (err) {
    // Registration failed — log but don't crash the app
    // This happens in some strict browser environments (private mode on iOS, etc.)
    console.warn('[app.js] SW registration failed:', err.message);
  }
})();

// ── Safety net: if app.js loaded before index.html's PWA script ──────────
// Runs after all scripts on page have executed
window.addEventListener('load', () => {
  if (window._pendingSWReg && typeof window._pwaAttachSWListeners === 'function') {
    console.log('[app.js] Attaching pending SW registration after load');
    window._pwaAttachSWListeners(window._pendingSWReg);
    delete window._pendingSWReg;
  }
});
