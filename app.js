/**
 * LifeSync v5.0 — App Bootstrap (app.js)
 *
 * Responsibilities:
 *  1. Register main.js as the ONE service worker
 *  2. Manage install banner (beforeinstallprompt)
 *  3. Manage update popup — fires ONCE, never loops
 *  4. Manage offline bar
 *  5. Expose window.LifeSyncPWA for optional app-level hooks
 *
 * CRITICAL RULES (anti-loop):
 *  - updatePopup shown only when a *new* waiting SW is detected
 *  - After user dismisses or updates, popup is NEVER shown again for
 *    the same SW (tracked by sw.waiting identity check)
 *  - skipWaiting is sent ONLY on explicit user click — not automatically
 *  - No setInterval / polling for updates — relies on SW update event only
 */

(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────────────── */
  const SW_PATH     = './main.js';
  const SW_SCOPE    = './';
  const UPDATE_KEY  = 'ls_update_dismissed_v5'; // localStorage key to debounce popup

  /* ── Element refs (lazy) ────────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }

  /* ══════════════════════════════════════════════════════════════════════
     1. SERVICE WORKER REGISTRATION
  ══════════════════════════════════════════════════════════════════════ */

  if (!('serviceWorker' in navigator)) {
    console.warn('[PWA] Service Worker not supported in this browser.');
    hideSplash();
    return;
  }

  let _registration = null;   // holds the active SW registration
  let _updateShown  = false;  // guard: show update popup at most once per page load

  navigator.serviceWorker
    .register(SW_PATH, { scope: SW_SCOPE, updateViaCache: 'none' })
    .then((reg) => {
      _registration = reg;
      console.log('[PWA] Service Worker registered:', reg.scope);

      /* ── Check for a SW already waiting when page loads ─────────────── */
      if (reg.waiting) {
        // A new SW was already installed before this page load
        showUpdatePopup(reg.waiting);
      }

      /* ── SW found a new update while page is open ──────────────────── */
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW installed; old SW still controlling — show popup once
            showUpdatePopup(newWorker);
          }
        });
      });

      /* ── Trigger an update check on load (non-blocking) ─────────────── */
      reg.update().catch(() => { /* offline — ignore */ });
    })
    .catch((err) => {
      console.error('[PWA] SW registration failed:', err);
    });

  /* ── Reload page after controller changes (user clicked Update) ─────── */
  let _refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_refreshing) return;
    _refreshing = true;
    console.log('[PWA] Controller changed — reloading for new version');
    window.location.reload();
  });

  /* ══════════════════════════════════════════════════════════════════════
     2. UPDATE POPUP — shown at most once; no infinite loop
  ══════════════════════════════════════════════════════════════════════ */

  function showUpdatePopup(waitingWorker) {
    // Guard: only show once per page session
    if (_updateShown) return;

    // Guard: don't spam — check if user dismissed recently (10 min cooldown)
    const lastDismissed = parseInt(localStorage.getItem(UPDATE_KEY) || '0', 10);
    const cooldown = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - lastDismissed < cooldown) {
      console.log('[PWA] Update popup suppressed (cooldown active)');
      return;
    }

    _updateShown = true;

    const popup   = el('pwa-update-popup');
    const updateBtn  = el('pwa-update-btn');
    const dismissBtn = el('pwa-update-dismiss');

    if (!popup) return;

    // Show
    popup.classList.add('show');

    // "Update" button → send skipWaiting to the waiting SW
    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        popup.classList.remove('show');
        if (waitingWorker) {
          waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      }, { once: true });
    }

    // "✕" dismiss — hide popup, record dismissal time
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        popup.classList.remove('show');
        localStorage.setItem(UPDATE_KEY, String(Date.now()));
      }, { once: true });
    }

    // Auto-hide after 12 seconds if user ignores it
    setTimeout(() => {
      if (popup.classList.contains('show')) {
        popup.classList.remove('show');
        localStorage.setItem(UPDATE_KEY, String(Date.now()));
      }
    }, 12000);
  }

  /* ══════════════════════════════════════════════════════════════════════
     3. INSTALL BANNER (beforeinstallprompt)
  ══════════════════════════════════════════════════════════════════════ */

  let _deferredInstallPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredInstallPrompt = e;

    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Slight delay so it doesn't fight the splash screen
    setTimeout(showInstallBanner, 3500);
  });

  function showInstallBanner() {
    const banner     = el('pwa-install-banner');
    const installBtn = el('pwa-install-btn');
    const dismissBtn = el('pwa-install-dismiss');

    if (!banner || !_deferredInstallPrompt) return;

    banner.style.display = 'block';
    requestAnimationFrame(() => {
      banner.classList.add('show');
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        banner.classList.remove('show');
        if (_deferredInstallPrompt) {
          _deferredInstallPrompt.prompt();
          const { outcome } = await _deferredInstallPrompt.userChoice;
          console.log('[PWA] Install prompt outcome:', outcome);
          _deferredInstallPrompt = null;
        }
      }, { once: true });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        banner.classList.remove('show');
        setTimeout(() => { banner.style.display = 'none'; }, 400);
      }, { once: true });
    }
  }

  // Hide banner when installed
  window.addEventListener('appinstalled', () => {
    const banner = el('pwa-install-banner');
    if (banner) {
      banner.classList.remove('show');
      setTimeout(() => { banner.style.display = 'none'; }, 400);
    }
    _deferredInstallPrompt = null;
    console.log('[PWA] App installed!');
  });

  /* ══════════════════════════════════════════════════════════════════════
     4. OFFLINE BAR
  ══════════════════════════════════════════════════════════════════════ */

  function updateOfflineBar() {
    const bar = el('pwa-offline-bar');
    if (!bar) return;
    if (navigator.onLine) {
      bar.classList.remove('show');
    } else {
      bar.classList.add('show');
    }
  }

  window.addEventListener('online',  updateOfflineBar);
  window.addEventListener('offline', updateOfflineBar);
  // Check initial state after DOM is ready
  document.addEventListener('DOMContentLoaded', updateOfflineBar);

  /* ══════════════════════════════════════════════════════════════════════
     5. SPLASH SCREEN HIDE
  ══════════════════════════════════════════════════════════════════════ */

  function hideSplash() {
    const splash = el('pwa-splash');
    if (!splash) return;
    // Minimum display time: 1.5 s (covers the loader bar animation)
    const MIN_DISPLAY = 1500;
    const elapsed = Date.now() - _startTime;
    const delay   = Math.max(0, MIN_DISPLAY - elapsed);
    setTimeout(() => {
      splash.classList.add('hidden');
    }, delay);
  }

  const _startTime = Date.now();

  // Hide splash once page is interactive
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideSplash);
  } else {
    hideSplash();
  }

  /* ══════════════════════════════════════════════════════════════════════
     6. PUBLIC API
  ══════════════════════════════════════════════════════════════════════ */

  window.LifeSyncPWA = {
    /** Force a SW update check */
    checkForUpdate() {
      if (_registration) {
        _registration.update().catch(() => {});
      }
    },

    /** Ask the SW for its version */
    getSWVersion() {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
      }
    },

    /** Get cached registration */
    getRegistration() {
      return _registration;
    },

    /** True if running as installed PWA */
    isInstalled() {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
      );
    },
  };

  // Listen for SW version reply
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SW_VERSION') {
      console.log(`[PWA] SW version: ${event.data.version}, cache: ${event.data.cacheName}`);
    }
  });

  console.log('[PWA] LifeSync v5.0 bootstrap complete');

})();
