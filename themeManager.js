/**
 * themeManager.js
 * LifeSync Premium — Theme & PWA Manager
 * Contains:
 *   - Splash screen hide logic
 *   - PWA install banner (beforeinstallprompt)
 *   - PWA update popup (Service Worker updatefound)
 *   - Offline / online bar
 *   - Theme toggle (dark / light)
 *   - Service Worker registration
 */

// ─── SPLASH SCREEN ────────────────────────────────────────────────────────────
(function initSplash() {
  const splash = document.getElementById('pwa-splash');
  if (!splash) return;

  // Hide splash after the loader bar animation completes (~1.4s) + small buffer
  window.addEventListener('load', () => {
    setTimeout(() => {
      splash.classList.add('hidden');
    }, 1600);
  });
})();

// ─── PWA INSTALL BANNER ───────────────────────────────────────────────────────
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;

  // Show banner after a short delay so it doesn't pop instantly
  setTimeout(() => {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.add('show');
  }, 3000);
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.remove('show');
  if (typeof showToast === 'function') showToast('✅ LifeSync installed!');
});

/** Called by the "Install" button in the banner */
function pwaInstall() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(choice => {
    _deferredInstallPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.remove('show');
  });
}

/** Called by the "✕" close button in the banner */
function pwaInstallDismiss() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.remove('show');
}

// ─── PWA UPDATE POPUP ─────────────────────────────────────────────────────────
let _waitingWorker = null;

function showUpdatePopup() {
  const popup = document.getElementById('pwa-update-popup');
  if (popup) popup.classList.add('show');
}

/** Called by the "Update" button in the popup */
function pwaApplyUpdate() {
  if (_waitingWorker) {
    _waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }
  window.location.reload();
}

/** Called by the "✕" close button in the popup */
function pwaDismissUpdate() {
  const popup = document.getElementById('pwa-update-popup');
  if (popup) popup.classList.remove('show');
}

// ─── OFFLINE / ONLINE BAR ─────────────────────────────────────────────────────
(function initOfflineBar() {
  const bar = document.getElementById('pwa-offline-bar');
  if (!bar) return;

  function setOffline() { bar.classList.add('show'); }
  function setOnline()  { bar.classList.remove('show'); }

  window.addEventListener('offline', setOffline);
  window.addEventListener('online',  setOnline);

  // Show immediately if already offline on load
  if (!navigator.onLine) setOffline();
})();

// ─── SERVICE WORKER REGISTRATION ─────────────────────────────────────────────
(function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js').then(reg => {
    // Watch for an update to the SW
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          _waitingWorker = newWorker;
          showUpdatePopup();
        }
      });
    });
  }).catch(() => {
    // Service worker registration failed — silently continue
  });

  // When the new SW takes control, reload the page
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
})();

// ─── THEME TOGGLE ─────────────────────────────────────────────────────────────

/**
 * Apply a theme to the document.
 * @param {'dark'|'light'} theme
 */
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.style.setProperty('--bg', '#f0f4f8');
    root.style.setProperty('--card-bg', '#ffffff');
    root.style.setProperty('--text-primary', '#0a0a14');
    root.style.setProperty('--text-secondary', '#555');
    document.body.style.background = '#e8ecf0';
  } else {
    // Dark (default)
    root.style.setProperty('--bg', '#050508');
    root.style.setProperty('--card-bg', 'rgba(255,255,255,0.04)');
    root.style.setProperty('--text-primary', '#ffffff');
    root.style.setProperty('--text-secondary', '#888');
    document.body.style.background = '#000000';
  }
}

/**
 * Toggle between dark and light theme and persist the choice.
 * Called by the Settings page toggle.
 */
function toggleTheme() {
  const isDark = app.settings.dark;
  app.settings.dark = !isDark;
  applyTheme(app.settings.dark ? 'dark' : 'light');
  if (typeof saveDataSilent === 'function') saveDataSilent();
  if (typeof showToast === 'function') {
    showToast(app.settings.dark ? '🌙 Dark mode on' : '☀️ Light mode on');
  }
}

// Apply saved theme immediately on script load
(function applyStoredTheme() {
  try {
    const raw   = localStorage.getItem(typeof LS_KEY !== 'undefined' ? LS_KEY : 'lifesync_v2_data');
    const saved = raw ? JSON.parse(raw) : null;
    const dark  = saved?.settings?.dark !== false; // default: dark
    applyTheme(dark ? 'dark' : 'light');
  } catch (e) {
    applyTheme('dark');
  }
})();
