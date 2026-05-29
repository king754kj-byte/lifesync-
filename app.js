/**
 * LifeSync PWA v6.0 — app.js
 *
 * Responsibilities:
 *  1. Register main.js as the ONE service worker
 *  2. Show update popup ONCE per new SW (no loop)
 *  3. Show install banner (once, respecting dismissal)
 *  4. Show/hide offline bar
 *
 * Rules:
 *  - No SW logic lives here — only registration + UI.
 *  - Update popup shows at most ONCE per session after a new SW is found.
 *  - skipWaiting is sent only when the user clicks "Update".
 */

(function () {
  'use strict';

  const APP_VERSION = '6.0';

  // ── Guard: run only once ─────────────────────────────────────────────────
  if (window.__LS_APP_JS_LOADED__) {
    console.warn('[app.js] Already loaded — skipping duplicate init');
    return;
  }
  window.__LS_APP_JS_LOADED__ = true;

  // ── State ────────────────────────────────────────────────────────────────
  let _swRegistration    = null;
  let _updateShownOnce   = false;   // ensure popup shown only once per session
  let _deferredInstall   = null;    // BeforeInstallPromptEvent

  // ────────────────────────────────────────────────────────────────────────
  //  SERVICE WORKER REGISTRATION
  // ────────────────────────────────────────────────────────────────────────
  function registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[app.js] Service Worker not supported');
      return;
    }

    navigator.serviceWorker
      .register('./main.js', { scope: './' })
      .then((reg) => {
        _swRegistration = reg;
        console.log('[app.js] SW registered:', reg.scope);

        // ── Check for a waiting SW immediately (page reload after update) ──
        if (reg.waiting) {
          showUpdatePopup(reg.waiting);
          return;
        }

        // ── Detect new SW being installed ──
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;

          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed') {
              // Only show if there is an active (old) SW controlling the page
              if (navigator.serviceWorker.controller) {
                showUpdatePopup(newSW);
              }
              // If no controller yet: first install — no popup needed
            }
          });
        });

        // ── Periodic update check (every 60 min) ──
        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch((err) => {
        console.error('[app.js] SW registration failed:', err);
      });

    // ── When SW activates, refresh page data ────────────────────────────
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { data } = event;
      if (!data) return;

      if (data.type === 'SW_ACTIVATED') {
        console.log('[app.js] New SW activated, version:', data.version);
        // Page was already reloaded by controllerchange below — nothing to do
      }
    });

    // ── Reload once when a new SW takes control ──────────────────────────
    let _refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_refreshing) return;
      _refreshing = true;
      console.log('[app.js] Controller changed — reloading');
      window.location.reload();
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  //  UPDATE POPUP
  //  Shows exactly ONCE per session. User must click Update or Dismiss.
  // ────────────────────────────────────────────────────────────────────────
  function showUpdatePopup(swWorker) {
    if (_updateShownOnce) return;      // ← prevents the infinite loop
    _updateShownOnce = true;

    const popup   = document.getElementById('pwa-update-popup');
    const btnOk   = document.getElementById('pwa-update-btn');
    const btnDismiss = document.getElementById('pwa-update-dismiss');
    if (!popup) return;

    popup.classList.add('show');

    // ── Update button: tell SW to skip waiting → controllerchange → reload ─
    btnOk?.addEventListener('click', () => {
      popup.classList.remove('show');
      if (swWorker) {
        swWorker.postMessage({ type: 'SKIP_WAITING' });
      }
    }, { once: true });

    // ── Dismiss: hide popup, do nothing else ─────────────────────────────
    btnDismiss?.addEventListener('click', () => {
      popup.classList.remove('show');
    }, { once: true });

    // ── Auto-dismiss after 12 s if user ignores it ──────────────────────
    setTimeout(() => popup.classList.remove('show'), 12000);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  INSTALL BANNER  (A2HS)
  // ────────────────────────────────────────────────────────────────────────
  function initInstallBanner() {
    // Don't show if already installed
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    ) return;

    // Don't show if dismissed before
    if (sessionStorage.getItem('ls_install_dismissed')) return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferredInstall = e;

      // Delay banner slightly so it doesn't compete with splash
      setTimeout(showInstallBanner, 4000);
    });
  }

  function showInstallBanner() {
    const banner  = document.getElementById('pwa-install-banner');
    const btnInst = document.getElementById('pwa-install-btn');
    const btnDism = document.getElementById('pwa-install-dismiss');
    if (!banner) return;

    banner.style.display = 'block';
    // Force reflow before adding class for transition to work
    requestAnimationFrame(() => {
      requestAnimationFrame(() => banner.classList.add('show'));
    });

    btnInst?.addEventListener('click', async () => {
      banner.classList.remove('show');
      if (_deferredInstall) {
        _deferredInstall.prompt();
        const { outcome } = await _deferredInstall.userChoice;
        console.log('[app.js] Install prompt outcome:', outcome);
        _deferredInstall = null;
      }
    }, { once: true });

    btnDism?.addEventListener('click', () => {
      banner.classList.remove('show');
      sessionStorage.setItem('ls_install_dismissed', '1');
    }, { once: true });
  }

  // ────────────────────────────────────────────────────────────────────────
  //  OFFLINE / ONLINE BAR
  // ────────────────────────────────────────────────────────────────────────
  function initOfflineBar() {
    const bar = document.getElementById('pwa-offline-bar');
    if (!bar) return;

    function updateBar() {
      if (navigator.onLine) {
        bar.classList.remove('show');
      } else {
        bar.classList.add('show');
      }
    }

    window.addEventListener('online',  updateBar);
    window.addEventListener('offline', updateBar);
    updateBar(); // initial state
  }

  // ────────────────────────────────────────────────────────────────────────
  //  BOOT
  // ────────────────────────────────────────────────────────────────────────
  function boot() {
    initOfflineBar();
    initInstallBanner();
    registerSW();
    console.log(`[app.js] LifeSync v${APP_VERSION} boot complete`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
