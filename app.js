/* ══════════════════════════════════════════════════════════════
   LifeSync V2.1 — app.js
   PWA Bootstrap Module (ES Module)
   Loaded via: <script type="module" src="./app.js"></script>

   Responsibilities:
   ─ Service Worker registration & update detection
   ─ Install (Add to Home Screen) banner logic
   ─ Offline / Online status bar
   ─ Splash screen hide
   ─ PWA update popup
   ─ AppCheck badge (HTTPS detection)
   ─ Reminder System (ReminderSystem global)
   ─ SIP Age Calculator helper functions
══════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════
   1. SPLASH SCREEN — hide after 1.6 s
════════════════════════════════════════════════════════════ */
function hideSplash() {
  const splash = document.getElementById('pwa-splash');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('hidden');
    // Remove from DOM after transition
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
  }, 1600);
}

/* ════════════════════════════════════════════════════════════
   2. SERVICE WORKER REGISTRATION
════════════════════════════════════════════════════════════ */
let swRegistration = null;

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('[App] Service Workers not supported.');
    return;
  }
  try {
    swRegistration = await navigator.serviceWorker.register('./main.js', { scope: './' });
    console.log('[App] SW registered, scope:', swRegistration.scope);

    // Detect update available
    swRegistration.addEventListener('updatefound', () => {
      const newWorker = swRegistration.installing;
      console.log('[App] New SW installing…');
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // A new version is waiting — show update popup
          showUpdatePopup();
        }
      });
    });

    // Check for updates every 30 minutes
    setInterval(() => swRegistration.update(), 30 * 60 * 1000);
  } catch (err) {
    console.error('[App] SW registration failed:', err);
  }
}

/* ════════════════════════════════════════════════════════════
   3. INSTALL BANNER (Add to Home Screen)
════════════════════════════════════════════════════════════ */
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;

  // Only show if not already installed / dismissed recently
  const dismissed = localStorage.getItem('ls_install_dismissed');
  const now = Date.now();
  if (dismissed && (now - parseInt(dismissed)) < 7 * 24 * 60 * 60 * 1000) return; // 7 days

  setTimeout(showInstallBanner, 3000); // show 3 s after load
});

function showInstallBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (!banner) return;
  banner.style.display = 'block';
  requestAnimationFrame(() => banner.classList.add('show'));
}

function hideInstallBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (!banner) return;
  banner.classList.remove('show');
  setTimeout(() => { banner.style.display = 'none'; }, 400);
}

// Install button
document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      hideInstallBanner();
      const result = await deferredInstallPrompt.prompt();
      console.log('[App] Install prompt result:', result.outcome);
      deferredInstallPrompt = null;
    });
  }

  const dismissBtn = document.getElementById('pwa-install-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      hideInstallBanner();
      localStorage.setItem('ls_install_dismissed', String(Date.now()));
    });
  }
});

// Detect if already running as installed PWA
window.addEventListener('appinstalled', () => {
  hideInstallBanner();
  deferredInstallPrompt = null;
  console.log('[App] LifeSync installed as PWA ✓');
});

/* ════════════════════════════════════════════════════════════
   4. UPDATE POPUP
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
      if (swRegistration && swRegistration.waiting) {
        swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      // Reload once new SW takes control
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      }, { once: true });
    });
  }

  const updateDismiss = document.getElementById('pwa-update-dismiss');
  if (updateDismiss) {
    updateDismiss.addEventListener('click', hideUpdatePopup);
  }
});

/* ════════════════════════════════════════════════════════════
   5. OFFLINE / ONLINE BAR
════════════════════════════════════════════════════════════ */
function showOfflineBar() {
  const bar = document.getElementById('pwa-offline-bar');
  if (bar) bar.classList.add('show');
}

function hideOfflineBar() {
  const bar = document.getElementById('pwa-offline-bar');
  if (bar) bar.classList.remove('show');
}

window.addEventListener('online',  hideOfflineBar);
window.addEventListener('offline', showOfflineBar);

if (!navigator.onLine) showOfflineBar();

/* ════════════════════════════════════════════════════════════
   6. APPCHECK BADGE — show 🛡 on HTTPS / installed PWA
════════════════════════════════════════════════════════════ */
function initAppCheckBadge() {
  const badge = document.getElementById('appcheck-badge');
  if (!badge) return;
  const isSecure   = location.protocol === 'https:';
  const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isSecure || isLocalDev) {
    badge.style.display = 'flex';
    badge.title = 'Secure connection';
  }
}

/* ════════════════════════════════════════════════════════════
   7. REMINDER SYSTEM — global ReminderSystem
   Provides: add, edit, delete, complete, snooze
   Used by the main inline script (index.html)
════════════════════════════════════════════════════════════ */
window.ReminderSystem = {
  /** Add a new reminder and save */
  add(obj) {
    if (!window.app) return;
    obj.id = window.nextId ? window.nextId() : Date.now();
    window.app.reminders.unshift(obj);
    if (typeof window.saveData === 'function') window.saveData(true);
    if (typeof window.renderReminders === 'function') window.renderReminders();
    if (typeof window.showToast === 'function') window.showToast('Reminder added ✓');
  },

  /** Update existing reminder by id */
  update(id, changes) {
    if (!window.app) return;
    const idx = window.app.reminders.findIndex(r => r.id == id);
    if (idx < 0) return;
    window.app.reminders[idx] = { ...window.app.reminders[idx], ...changes };
    if (typeof window.saveData === 'function') window.saveData(true);
    if (typeof window.renderReminders === 'function') window.renderReminders();
  },

  /** Delete reminder by id */
  delete(id) {
    if (!window.app) return;
    window.app.reminders = window.app.reminders.filter(r => r.id != id);
    if (typeof window.saveData === 'function') window.saveData(true);
    if (typeof window.renderReminders === 'function') window.renderReminders();
    if (typeof window.showToast === 'function') window.showToast('Reminder deleted');
  },

  /** Mark a reminder as complete */
  complete(id) {
    if (!window.app) return;
    const r = window.app.reminders.find(x => x.id == id);
    if (!r) return;
    if (!window.app.completedReminders) window.app.completedReminders = [];
    window.app.completedReminders.push({ ...r, completedAt: new Date().toISOString() });
    this.delete(id);
    if (typeof window.showToast === 'function') window.showToast('✅ Marked as done!');
  },

  /** Snooze a reminder by N days */
  snooze(id, days) {
    if (!window.app) return;
    const r = window.app.reminders.find(x => x.id == id);
    if (!r) return;
    r.days = (r.days || 0) + days;
    r.snoozed = true;
    if (!window.app.snoozeLog) window.app.snoozeLog = [];
    window.app.snoozeLog.push({ id, days, at: new Date().toISOString() });
    if (typeof window.saveData === 'function') window.saveData(true);
    if (typeof window.renderReminders === 'function') window.renderReminders();
    if (typeof window.showToast === 'function') window.showToast(`😴 Snoozed for ${days} day${days > 1 ? 's' : ''}`);
  },

  /** Get all reminders sorted by urgency */
  getSorted() {
    if (!window.app) return [];
    return [...window.app.reminders].sort((a, b) => a.days - b.days);
  },
};

/* ════════════════════════════════════════════════════════════
   8. AGE CALCULATOR (Smart Tools — age-modal)
════════════════════════════════════════════════════════════ */
window.calcAge = function () {
  const dobVal = document.getElementById('age-dob')?.value;
  if (!dobVal) { if (window.showToast) window.showToast('Select date of birth'); return; }

  const dob   = new Date(dobVal);
  const now   = new Date();
  const result = document.getElementById('age-result');
  if (!result) return;

  let years  = now.getFullYear()  - dob.getFullYear();
  let months = now.getMonth()     - dob.getMonth();
  let days   = now.getDate()      - dob.getDate();

  if (days < 0) {
    months--;
    const prev = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prev.getDate();
  }
  if (months < 0) { years--; months += 12; }

  const totalDays   = Math.floor((now - dob) / 86400000);
  const totalWeeks  = Math.floor(totalDays / 7);
  const totalMonths = years * 12 + months;

  // Next birthday
  const nextBirthday = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
  if (nextBirthday <= now) nextBirthday.setFullYear(now.getFullYear() + 1);
  const daysUntilBday = Math.ceil((nextBirthday - now) / 86400000);

  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const birthDay  = dayNames[dob.getDay()];

  result.style.display = 'block';
  result.innerHTML = `
    <div style="background:rgba(0,212,255,0.07);border:1px solid rgba(0,212,255,0.2);border-radius:14px;padding:16px;margin-top:12px;">
      <div style="text-align:center;margin-bottom:14px;">
        <div style="font-size:42px;font-weight:900;color:#00d4ff;font-family:'Syne',sans-serif;">${years}</div>
        <div style="font-size:12px;color:#888;">years, ${months} months, ${days} days</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">
        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:#b44fff;">${totalMonths}</div>
          <div style="color:#666;margin-top:2px;">Total Months</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:#00e676;">${totalWeeks.toLocaleString()}</div>
          <div style="color:#666;margin-top:2px;">Total Weeks</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:#ffb300;">${totalDays.toLocaleString()}</div>
          <div style="color:#666;margin-top:2px;">Total Days</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:#ff2d78;">${daysUntilBday}</div>
          <div style="color:#666;margin-top:2px;">Days to Birthday 🎂</div>
        </div>
      </div>
      <div style="margin-top:12px;text-align:center;font-size:11px;color:#555;">
        You were born on a <span style="color:#00d4ff;font-weight:700;">${birthDay}</span>
      </div>
    </div>`;
};

/* ════════════════════════════════════════════════════════════
   9. SIP CALCULATOR (Smart Tools — sip-modal)
════════════════════════════════════════════════════════════ */
window.calcSIP = function () {
  const monthly  = parseFloat(document.getElementById('sip-monthly')?.value)  || 0;
  const rate     = parseFloat(document.getElementById('sip-rate')?.value)      || 0;
  const years    = parseInt(document.getElementById('sip-years')?.value)       || 0;
  const result   = document.getElementById('sip-result');
  if (!result || !monthly || !rate || !years) { result && (result.style.display = 'none'); return; }

  const r      = rate / 100 / 12;
  const n      = years * 12;
  const fv     = monthly * (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
  const invested = monthly * n;
  const returns  = fv - invested;

  result.style.display = 'block';
  result.innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:11px;color:#888;margin-bottom:4px;">ESTIMATED RETURNS</div>
      <div style="font-size:32px;font-weight:900;color:#00e676;font-family:'Syne',sans-serif;">₹${Math.round(fv).toLocaleString('en-IN')}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;font-size:12px;">
      <div style="text-align:center;">
        <div style="font-weight:700;color:#fff;">₹${Math.round(invested).toLocaleString('en-IN')}</div>
        <div style="color:#666;margin-top:2px;">Invested</div>
      </div>
      <div style="text-align:center;">
        <div style="font-weight:700;color:#00e676;">₹${Math.round(returns).toLocaleString('en-IN')}</div>
        <div style="color:#666;margin-top:2px;">Earnings</div>
      </div>
    </div>`;
};

/* ════════════════════════════════════════════════════════════
   10. INIT — called on DOMContentLoaded
════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  hideSplash();
  registerServiceWorker();
  initAppCheckBadge();
  console.log('[App] LifeSync V2.1 — app.js loaded ✓');
});
