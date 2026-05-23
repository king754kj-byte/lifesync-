/* ══════════════════════════════════════════════════════════════
   LifeSync V2.1 — app.js
   FIXED STABLE VERSION
══════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════
   SPLASH SCREEN
════════════════════════════════════════════════════════════ */
function hideSplash() {
  const splash = document.getElementById('pwa-splash');

  if (!splash) return;

  setTimeout(() => {
    splash.classList.add('hidden');

    splash.addEventListener(
      'transitionend',
      () => splash.remove(),
      { once: true }
    );
  }, 1600);
}

/* ════════════════════════════════════════════════════════════
   SERVICE WORKER
════════════════════════════════════════════════════════════ */

let swRegistration = null;
let refreshing = false;

async function registerServiceWorker() {

  if (!('serviceWorker' in navigator)) {
    console.log('[App] Service Worker not supported');
    return;
  }

  try {

    swRegistration = await navigator.serviceWorker.register('./main.js');

    console.log('[App] Service Worker Registered');

    /* UPDATE DETECT */
    swRegistration.addEventListener('updatefound', () => {

      const newWorker = swRegistration.installing;

      if (!newWorker) return;

      console.log('[App] New update found');

      newWorker.addEventListener('statechange', () => {

        if (
          newWorker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {

          console.log('[App] Update Available');

          showUpdatePopup();

        }

      });

    });

    /* AUTO UPDATE CHECK */
    setInterval(() => {

      if (swRegistration) {
        swRegistration.update();
      }

    }, 60 * 60 * 1000);

    /* RELOAD ONLY ONCE */
    navigator.serviceWorker.addEventListener('controllerchange', () => {

      if (refreshing) return;

      refreshing = true;

      window.location.reload();

    });

  } catch (err) {

    console.error('[App] SW Error:', err);

  }

}

/* ════════════════════════════════════════════════════════════
   INSTALL BANNER
════════════════════════════════════════════════════════════ */

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {

  event.preventDefault();

  deferredInstallPrompt = event;

  setTimeout(() => {
    showInstallBanner();
  }, 3000);

});

function showInstallBanner() {

  const banner = document.getElementById('pwa-install-banner');

  if (!banner) return;

  banner.style.display = 'block';

  requestAnimationFrame(() => {
    banner.classList.add('show');
  });

}

function hideInstallBanner() {

  const banner = document.getElementById('pwa-install-banner');

  if (!banner) return;

  banner.classList.remove('show');

  setTimeout(() => {
    banner.style.display = 'none';
  }, 300);

}

document.addEventListener('DOMContentLoaded', () => {

  const installBtn = document.getElementById('pwa-install-btn');

  if (installBtn) {

    installBtn.addEventListener('click', async () => {

      if (!deferredInstallPrompt) return;

      deferredInstallPrompt.prompt();

      const result = await deferredInstallPrompt.userChoice;

      console.log(result.outcome);

      deferredInstallPrompt = null;

      hideInstallBanner();

    });

  }

  const dismissBtn = document.getElementById('pwa-install-dismiss');

  if (dismissBtn) {

    dismissBtn.addEventListener('click', () => {

      hideInstallBanner();

    });

  }

});

/* ════════════════════════════════════════════════════════════
   UPDATE POPUP
════════════════════════════════════════════════════════════ */

function showUpdatePopup() {

  const popup = document.getElementById('pwa-update-popup');

  if (!popup) return;

  popup.classList.add('show');

}

function hideUpdatePopup() {

  const popup = document.getElementById('pwa-update-popup');

  if (!popup) return;

  popup.classList.remove('show');

}

document.addEventListener('DOMContentLoaded', () => {

  const updateBtn = document.getElementById('pwa-update-btn');

  if (updateBtn) {

    updateBtn.addEventListener('click', () => {

      hideUpdatePopup();

      if (
        swRegistration &&
        swRegistration.waiting
      ) {

        swRegistration.waiting.postMessage({
          type: 'SKIP_WAITING'
        });

      }

    });

  }

  const closeBtn = document.getElementById('pwa-update-dismiss');

  if (closeBtn) {

    closeBtn.addEventListener('click', () => {

      hideUpdatePopup();

    });

  }

});

/* ════════════════════════════════════════════════════════════
   OFFLINE / ONLINE
════════════════════════════════════════════════════════════ */

function showOfflineBar() {

  const bar = document.getElementById('pwa-offline-bar');

  if (bar) {
    bar.classList.add('show');
  }

}

function hideOfflineBar() {

  const bar = document.getElementById('pwa-offline-bar');

  if (bar) {
    bar.classList.remove('show');
  }

}

window.addEventListener('offline', showOfflineBar);
window.addEventListener('online', hideOfflineBar);

if (!navigator.onLine) {
  showOfflineBar();
}

/* ════════════════════════════════════════════════════════════
   SECURE BADGE
════════════════════════════════════════════════════════════ */

function initAppCheckBadge() {

  const badge = document.getElementById('appcheck-badge');

  if (!badge) return;

  if (
    location.protocol === 'https:' ||
    location.hostname === 'localhost'
  ) {

    badge.style.display = 'flex';

  }

}

/* ════════════════════════════════════════════════════════════
   REMINDER SYSTEM
════════════════════════════════════════════════════════════ */

window.ReminderSystem = {

  add(reminder) {

    if (!window.app) return;

    reminder.id = Date.now();

    window.app.reminders.unshift(reminder);

    if (window.saveData) window.saveData(true);

    if (window.renderReminders) window.renderReminders();

  },

  delete(id) {

    if (!window.app) return;

    window.app.reminders =
      window.app.reminders.filter(r => r.id !== id);

    if (window.saveData) window.saveData(true);

    if (window.renderReminders) window.renderReminders();

  },

  complete(id) {

    const reminder =
      window.app.reminders.find(r => r.id === id);

    if (!reminder) return;

    reminder.completed = true;

    if (window.saveData) window.saveData(true);

    if (window.renderReminders) window.renderReminders();

  }

};

/* ════════════════════════════════════════════════════════════
   APP INIT
════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  hideSplash();

  registerServiceWorker();

  initAppCheckBadge();

  console.log('LifeSync V2.1 Loaded');

});
