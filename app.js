/**
 * LifeSync PWA — App Bootstrap
 * Version: 5.5
 *
 * Responsibilities:
 *  1. Register main.js as the ONLY service worker
 *  2. Handle install banner (beforeinstallprompt)
 *  3. Handle update popup — show ONCE, never loop
 *  4. Handle offline/online bar
 *
 * Rules:
 *  - NO service worker logic here — that lives in main.js
 *  - NO duplicate registrations
 *  - Update popup shown at most ONCE per session
 */

(function () {
  'use strict';

  const APP_VERSION = '5.5';

  // ── Guards to prevent notification loops ──────────────────────────────────
  let updatePopupShown   = false; // shown at most once per page load
  let installBannerShown = false;
  let deferredInstall    = null;  // holds BeforeInstallPromptEvent

  // ─── 1. SERVICE WORKER REGISTRATION ───────────────────────────────────────
  if ('serviceWorker' in navigator) {
    // Use DOMContentLoaded so the page renders first
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./main.js', { scope: './' })
        .then(reg => {
          console.log('[App] SW registered, scope:', reg.scope);
          monitorSWUpdate(reg);
        })
        .catch(err => {
          console.warn('[App] SW registration failed:', err);
        });

      // Listen for messages from the service worker
      navigator.serviceWorker.addEventListener('message', onSWMessage);

      // When SW controller changes (after update + skipWaiting), reload once
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return; // prevent double-reload
        refreshing = true;
        console.log('[App] New SW controller — reloading page.');
        window.location.reload();
      });
    });
  }

  // ─── 2. MONITOR FOR SW UPDATES ────────────────────────────────────────────
  function monitorSWUpdate(reg) {
    // Check for a waiting SW that was already installed before this page loaded
    if (reg.waiting) {
      showUpdatePopup(reg.waiting);
      return;
    }

    // Listen for a new SW entering the waiting state
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New SW is ready and there IS an existing controller (not first install)
          showUpdatePopup(newWorker);
        }
      });
    });

    // Periodically check for updates (every 30min) — but only when tab is visible
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        reg.update().catch(() => {}); // silent fail if offline
      }
    }, 30 * 60 * 1000);
  }

  // ─── 3. UPDATE POPUP — shown at most ONCE per session ─────────────────────
  function showUpdatePopup(newWorker) {
    if (updatePopupShown) return; // ← KEY: prevents the infinite loop
    updatePopupShown = true;

    const popup   = document.getElementById('pwa-update-popup');
    const btnUpdate  = document.getElementById('pwa-update-btn');
    const btnDismiss = document.getElementById('pwa-update-dismiss');

    if (!popup) return;

    // Small delay so it doesn't pop up the instant the page loads
    setTimeout(() => {
      popup.classList.add('show');
    }, 2000);

    // "Update Now" — tell SW to skip waiting, then controllerchange will reload
    btnUpdate?.addEventListener('click', () => {
      popup.classList.remove('show');
      newWorker.postMessage({ type: 'SKIP_WAITING' });
    });

    // Dismiss — hide the popup, do NOT reload
    btnDismiss?.addEventListener('click', () => {
      popup.classList.remove('show');
    });
  }

  // ─── 4. HANDLE MESSAGES FROM SW ───────────────────────────────────────────
  function onSWMessage(event) {
    const { data } = event;
    if (!data) return;

    if (data.type === 'SW_ACTIVATED') {
      console.log(`[App] SW v${data.version} activated (cache: ${data.cache})`);
      // SW just activated — this is fine, no popup needed (it's a fresh load after update)
    }

    if (data.type === 'SW_VERSION') {
      console.log(`[App] SW version: ${data.version}`);
    }
  }

  // ─── 5. INSTALL BANNER ────────────────────────────────────────────────────
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;

    // Don't show if already installed or dismissed this session
    const dismissed = sessionStorage.getItem('pwa-install-dismissed');
    if (dismissed) return;

    if (!installBannerShown) {
      installBannerShown = true;
      const banner = document.getElementById('pwa-install-banner');
      if (banner) {
        setTimeout(() => {
          banner.style.display = 'block';
          requestAnimationFrame(() => banner.classList.add('show'));
        }, 3500);
      }
    }
  });

  // Install button
  document.addEventListener('click', event => {
    if (event.target.id === 'pwa-install-btn') {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall.userChoice.then(choice => {
        console.log('[App] Install choice:', choice.outcome);
        deferredInstall = null;
        hideInstallBanner();
      });
    }
    if (event.target.id === 'pwa-install-dismiss') {
      sessionStorage.setItem('pwa-install-dismissed', '1');
      hideInstallBanner();
    }
  });

  function hideInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.classList.remove('show');
      setTimeout(() => { banner.style.display = 'none'; }, 400);
    }
  }

  // Hide banner if already installed (standalone mode)
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    sessionStorage.setItem('pwa-install-dismissed', '1');
  }

  window.addEventListener('appinstalled', () => {
    console.log('[App] PWA installed!');
    deferredInstall = null;
    hideInstallBanner();
  });

  // ─── 6. OFFLINE / ONLINE BAR ──────────────────────────────────────────────
  const offlineBar = document.getElementById('pwa-offline-bar');

  function updateOnlineStatus() {
    if (!offlineBar) return;
    if (!navigator.onLine) {
      offlineBar.classList.add('show');
    } else {
      offlineBar.classList.remove('show');
    }
  }

  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Check immediately on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateOnlineStatus);
  } else {
    updateOnlineStatus();
  }

})();
