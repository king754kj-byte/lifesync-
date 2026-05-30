/* ============================================================
   LifeSync PWA — App Bootstrap  (app.js)
   Version  : 6.1

   Responsibilities:
     1. Register main.js as the ONE service worker (no duplicates)
     2. Handle install banner (A2HS prompt)
     3. Handle update popup — WITHOUT infinite loop
     4. Handle offline / online status bar
     5. Expose window.pwaRequestUpdate() for manual update trigger

   ⚠  This file must NEVER register any SW other than main.js.
   ⚠  All SW logic lives in main.js — this file only drives UI.
   ============================================================ */

'use strict';

(function () {

  /* ── Constants ────────────────────────────────────────────── */
  const APP_VERSION      = '6.1';
  const SW_PATH          = './main.js';
  const SW_SCOPE         = './';

  /*
   * Prevent showing the update popup more than ONCE per browser
   * session, regardless of how many updatefound / statechange
   * events fire.  Stored in sessionStorage so it resets cleanly
   * after the user-triggered reload.
   */
  const UPDATE_SHOWN_KEY = 'ls_update_popup_shown_v' + APP_VERSION;

  /* ── Internal state ──────────────────────────────────────── */
  let _deferredInstallPrompt = null;   // BeforeInstallPromptEvent
  let _waitingWorker         = null;   // ServiceWorker waiting to activate
  let _isRefreshing          = false;  // Guard against double-reload

  /* ══════════════════════════════════════════════════════════
     SERVICE WORKER REGISTRATION
  ══════════════════════════════════════════════════════════ */
  function registerSW () {
    if (!('serviceWorker' in navigator)) {
      console.warn('[App] Service Workers not supported.');
      return;
    }

    /*
     * Guard: if somehow this script is loaded twice, abort.
     * (Should not happen in normal use but protects in edge cases.)
     */
    if (window.__lsSWRegistered) {
      console.warn('[App] SW already registered — skipping duplicate call.');
      return;
    }
    window.__lsSWRegistered = true;

    navigator.serviceWorker
      .register(SW_PATH, { scope: SW_SCOPE, updateViaCache: 'none' })
      .then(onSWRegistered)
      .catch((err) => {
        console.error('[App] SW registration failed:', err);
      });

    /*
     * controllerchange fires when a waiting SW takes control
     * (after skipWaiting).  We reload once to activate the
     * new version.  The _isRefreshing guard prevents loops.
     */
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_isRefreshing) return;
      _isRefreshing = true;
      console.log('[App] Controller changed — reloading for new version');
      window.location.reload();
    });
  }

  /* ── Called when registration succeeds ─────────────────── */
  function onSWRegistered (reg) {
    console.log(`[App] SW registered ✓  scope: ${reg.scope}`);

    /*
     * If a SW is already waiting when we open the page (e.g. the
     * user had the tab open during an update), show the popup only
     * if we weren't already on the latest version — i.e. if there
     * was a previous controller.
     */
    if (reg.waiting && navigator.serviceWorker.controller) {
      maybeShowUpdatePopup(reg.waiting);
    }

    /* Detect future updates */
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        /*
         * 'installed' + controller present = genuine update
         * (first-install has no prior controller, so we skip it)
         */
        if (
          newWorker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          maybeShowUpdatePopup(newWorker);
        }
      });
    });

    /* Periodically check for updates (every 60 min) */
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }

  /* ══════════════════════════════════════════════════════════
     UPDATE POPUP  — shown at most ONCE per session
  ══════════════════════════════════════════════════════════ */
  function maybeShowUpdatePopup (worker) {
    /* ── Prevent the popup loop ─────────────────────────────
     *
     * Root cause of old loop:
     *   1. SW installs → updatefound fires → popup shows
     *   2. User clicks "Update" → skipWaiting → reload
     *   3. After reload there is a *new* waiting worker
     *      from the old iteration → popup fires again → loop
     *
     * Fix:
     *   • Only show once per session (sessionStorage flag).
     *   • After reload the flag is gone, but the condition
     *     `navigator.serviceWorker.controller` is now the
     *     fresh SW, so reg.waiting will be null → no popup.
     */
    if (sessionStorage.getItem(UPDATE_SHOWN_KEY)) {
      console.log('[App] Update popup already shown this session — suppressed.');
      return;
    }

    sessionStorage.setItem(UPDATE_SHOWN_KEY, '1');
    _waitingWorker = worker;
    showUpdatePopup();
  }

  function showUpdatePopup () {
    const popup = document.getElementById('pwa-update-popup');
    if (popup) {
      popup.classList.add('show');
      console.log('[App] Update popup displayed ✓');
    }
  }

  function hideUpdatePopup () {
    const popup = document.getElementById('pwa-update-popup');
    if (popup) popup.classList.remove('show');
  }

  /* ── Trigger the actual update (called by button click) ── */
  function applyUpdate () {
    hideUpdatePopup();
    if (_waitingWorker) {
      _waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      _waitingWorker = null;
    }
  }

  /* Expose globally so inline onclick handlers can call it */
  window.pwaRequestUpdate = applyUpdate;

  /* ══════════════════════════════════════════════════════════
     INSTALL BANNER  (Add to Home Screen prompt)
  ══════════════════════════════════════════════════════════ */
  const INSTALL_DISMISSED_KEY = 'ls_install_dismissed_v' + APP_VERSION;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredInstallPrompt = e;

    /* Don't show if user already dismissed */
    if (sessionStorage.getItem(INSTALL_DISMISSED_KEY)) return;

    /* Delay banner slightly so it doesn't fight the splash */
    setTimeout(showInstallBanner, 3000);
  });

  function showInstallBanner () {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.add('show');
  }

  function hideInstallBanner () {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.classList.remove('show');
      setTimeout(() => { banner.style.display = 'none'; }, 500);
    }
  }

  /* ── Install button clicked ──────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    const installBtn     = document.getElementById('pwa-install-btn');
    const installDismiss = document.getElementById('pwa-install-dismiss');
    const updateBtn      = document.getElementById('pwa-update-btn');
    const updateDismiss  = document.getElementById('pwa-update-dismiss');

    installBtn?.addEventListener('click', async () => {
      if (!_deferredInstallPrompt) return;
      hideInstallBanner();
      _deferredInstallPrompt.prompt();
      const { outcome } = await _deferredInstallPrompt.userChoice;
      console.log('[App] Install prompt outcome:', outcome);
      _deferredInstallPrompt = null;
    });

    installDismiss?.addEventListener('click', () => {
      sessionStorage.setItem(INSTALL_DISMISSED_KEY, '1');
      hideInstallBanner();
    });

    updateBtn?.addEventListener('click', () => {
      applyUpdate();
    });

    updateDismiss?.addEventListener('click', () => {
      hideUpdatePopup();
      /* Don't call applyUpdate — user dismissed, keep old version running */
    });
  });

  /* Hide banner after successful install */
  window.addEventListener('appinstalled', () => {
    hideInstallBanner();
    console.log('[App] PWA installed ✓');
  });

  /* ══════════════════════════════════════════════════════════
     OFFLINE / ONLINE BAR
  ══════════════════════════════════════════════════════════ */
  function updateOnlineStatus () {
    const bar = document.getElementById('pwa-offline-bar');
    if (!bar) return;

    if (!navigator.onLine) {
      bar.classList.add('show');
    } else {
      bar.classList.remove('show');
    }
  }

  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  /* Run once on load (in case we start offline) */
  document.addEventListener('DOMContentLoaded', updateOnlineStatus);

  /* ══════════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════════ */
  /*
   * Register the SW as early as possible so the browser can
   * start evaluating main.js in parallel with app load.
   * Using DOMContentLoaded ensures the DOM exists for popups
   * but registration itself can fire sooner.
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerSW);
  } else {
    /* Already loaded (deferred script) */
    registerSW();
  }

  console.log(`[App] LifeSync app.js v${APP_VERSION} bootstrapped ✓`);

})();
