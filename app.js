/**
 * LifeSync PWA — App Bootstrap (app.js)
 * Version: 5.8
 *
 * Responsibilities:
 *   1. Register main.js as the one and only service worker
 *   2. Handle install banner (beforeinstallprompt)
 *   3. Handle update popup — shown ONCE per session, never loops
 *   4. Handle offline/online bar
 *   5. No duplicate registrations, no fake code
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const APP_VERSION = '5.8';

// ─── State ────────────────────────────────────────────────────────────────────
let _swRegistration     = null;   // holds the active SW registration
let _updateWaitingSW    = null;   // the SW waiting to activate
let _deferredInstall    = null;   // beforeinstallprompt event
let _updateShownOnce    = false;  // prevent repeated popups within a session
let _installDismissed   = false;  // remember if user dismissed install banner

// ─── Entry point ──────────────────────────────────────────────────────────────
(function init() {
  if ('serviceWorker' in navigator) {
    // Defer SW registration until page is loaded to not block first paint
    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW, { once: true });
    }
  }

  // Offline / online bar listeners (always active, even without SW)
  window.addEventListener('online',  onOnline);
  window.addEventListener('offline', onOffline);
  if (!navigator.onLine) onOffline();

  // Install banner trigger
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);

  // Wire up UI buttons once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButtons);
  } else {
    wireButtons();
  }
})();

// ─── Service Worker Registration ─────────────────────────────────────────────
function registerSW() {
  navigator.serviceWorker
    .register('./main.js', { scope: './' })
    .then(function (reg) {
      _swRegistration = reg;
      console.log('[app.js] SW registered. Scope:', reg.scope);

      // Check if there's already a waiting SW (e.g. page was refreshed)
      if (reg.waiting) {
        handleWaitingSW(reg.waiting);
      }

      // New SW found while page is open
      reg.addEventListener('updatefound', function () {
        const newSW = reg.installing;
        if (!newSW) return;
        console.log('[app.js] New SW installing…');

        newSW.addEventListener('statechange', function () {
          if (newSW.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // There IS an existing SW — this is a real update
              handleWaitingSW(newSW);
            } else {
              // First install — no existing SW, nothing to show
              console.log('[app.js] SW installed for the first time.');
            }
          }
        });
      });

      // Periodically check for updates every 60 minutes
      setInterval(function () {
        reg.update().catch(function () {}); // silent
      }, 60 * 60 * 1000);
    })
    .catch(function (err) {
      console.error('[app.js] SW registration failed:', err);
    });

  // When the controller changes (after skipWaiting), reload once
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing) return;
    refreshing = true;
    console.log('[app.js] Controller changed — reloading page.');
    window.location.reload();
  });
}

// ─── Update Handling ─────────────────────────────────────────────────────────
/**
 * Called when a new SW is in the "waiting" state.
 * Shows the update popup ONLY ONCE per session.
 */
function handleWaitingSW(sw) {
  _updateWaitingSW = sw;

  // ── GUARD: Only show once per browser session ──
  if (_updateShownOnce) {
    console.log('[app.js] Update popup already shown this session — skipping.');
    return;
  }

  // ── GUARD: Don't show if user dismissed within last 24h ──
  try {
    const dismissed = parseInt(localStorage.getItem('ls_update_dismissed') || '0', 10);
    if (dismissed && Date.now() - dismissed < 24 * 60 * 60 * 1000) {
      console.log('[app.js] Update popup dismissed recently — skipping.');
      return;
    }
  } catch (_) {}

  _updateShownOnce = true;
  showUpdatePopup();
}

function showUpdatePopup() {
  const popup = document.getElementById('pwa-update-popup');
  if (popup) popup.classList.add('show');
}

function hideUpdatePopup() {
  const popup = document.getElementById('pwa-update-popup');
  if (popup) popup.classList.remove('show');
}

// ─── Offline / Online Bar ─────────────────────────────────────────────────────
function onOffline() {
  const bar = document.getElementById('pwa-offline-bar');
  if (bar) bar.classList.add('show');
}

function onOnline() {
  const bar = document.getElementById('pwa-offline-bar');
  if (bar) bar.classList.remove('show');
}

// ─── Install Banner ───────────────────────────────────────────────────────────
function onBeforeInstallPrompt(e) {
  e.preventDefault();
  _deferredInstall = e;

  // Don't show if user already dismissed during this visit
  if (_installDismissed) return;

  // Don't show if already installed (standalone)
  if (isStandalone()) return;

  // Show after a short delay so it doesn't appear instantly
  setTimeout(showInstallBanner, 3000);
}

function onAppInstalled() {
  hideInstallBanner();
  _deferredInstall = null;
  console.log('[app.js] App installed!');
}

function showInstallBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) {
    banner.style.display = 'block';
    // Force reflow before adding class (animation)
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        banner.classList.add('show');
      });
    });
  }
}

function hideInstallBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) {
    banner.classList.remove('show');
    setTimeout(function () { banner.style.display = 'none'; }, 400);
  }
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

// ─── Wire UI Buttons ─────────────────────────────────────────────────────────
function wireButtons() {
  // ── Update popup: "Update" button ──
  const updateBtn = document.getElementById('pwa-update-btn');
  if (updateBtn) {
    updateBtn.addEventListener('click', function () {
      hideUpdatePopup();
      if (_updateWaitingSW) {
        // Tell the waiting SW to skip the wait and activate
        _updateWaitingSW.postMessage({ type: 'SKIP_WAITING' });
        // controllerchange handler in registerSW() will reload the page
      }
    });
  }

  // ── Update popup: "✕" dismiss button ──
  const updateDismiss = document.getElementById('pwa-update-dismiss');
  if (updateDismiss) {
    updateDismiss.addEventListener('click', function () {
      hideUpdatePopup();
      // Record dismissal time to suppress for 24h
      try {
        localStorage.setItem('ls_update_dismissed', String(Date.now()));
      } catch (_) {}
    });
  }

  // ── Install banner: "Install" button ──
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', function () {
      hideInstallBanner();
      if (_deferredInstall) {
        _deferredInstall.prompt();
        _deferredInstall.userChoice.then(function (result) {
          console.log('[app.js] Install prompt result:', result.outcome);
          _deferredInstall = null;
        });
      }
    });
  }

  // ── Install banner: "✕" dismiss button ──
  const installDismiss = document.getElementById('pwa-install-dismiss');
  if (installDismiss) {
    installDismiss.addEventListener('click', function () {
      _installDismissed = true;
      hideInstallBanner();
    });
  }
}
