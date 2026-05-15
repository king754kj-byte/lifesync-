// ══════════════════════════════════════════
//  LifeSync V2.2 — settings-manager.js
//  Settings: toggles, profile, notification prefs, reset
// ══════════════════════════════════════════

const SETTINGS_DEFAULTS = {
  pin:         false,
  fingerprint: true,
  privacy:     false,
  notifs:      true,
  dark:        true,
  sound:       true,
  vibrate:     true,
  autoComplete:true,
  missedAlert: true,
};

class SettingsManager {
  constructor() {
    this._migrated = false;
  }

  // ── Ensure new keys exist on old data ───────────────────────────────────
  migrate() {
    if (!window.app || this._migrated) return;
    window.app.settings = Object.assign({}, SETTINGS_DEFAULTS, window.app.settings || {});

    // Ensure new V2.1 app fields exist
    if (!window.app.completedReminders) window.app.completedReminders = [];
    if (!window.app.missedReminders)    window.app.missedReminders    = [];
    if (!window.app.version)            window.app.version = '2.1';

    this._migrated = true;
  }

  // ── Toggle a boolean setting ─────────────────────────────────────────────
  toggle(key) {
    this.migrate();
    window.app.settings[key] = !window.app.settings[key];

    // Side effects
    if (key === 'sound')   window.LifeSyncNotifications?.toggleSound(window.app.settings.sound);
    if (key === 'vibrate') window.LifeSyncNotifications?.toggleVibrate(window.app.settings.vibrate);
    if (key === 'notifs')  this._handleNotifToggle(window.app.settings.notifs);

    window.saveData?.();
    this.render();
  }

  async _handleNotifToggle(on) {
    if (on) {
      const perm = await window.LifeSyncNotifications?.requestPermission();
      if (perm === 'granted') {
        window.showToast?.('🔔 Notifications enabled!');
      } else {
        window.app.settings.notifs = false;
        window.showToast?.('Notifications blocked by browser');
        this.render();
      }
    } else {
      window.showToast?.('🔕 Notifications disabled');
    }
  }

  // ── Profile save ─────────────────────────────────────────────────────────
  saveProfile() {
    const nameEl  = document.getElementById('profile-name-inp');
    const emailEl = document.getElementById('profile-email-inp');
    if (!window.app) return;
    window.app.profile.name  = nameEl?.value  || window.app.profile.name;
    window.app.profile.email = emailEl?.value || window.app.profile.email;
    window.saveData?.();
    window.showToast?.('Profile saved ✓');
  }

  // ── Reset all data ───────────────────────────────────────────────────────
  resetData() {
    if (!confirm('Reset ALL LifeSync data? This cannot be undone.')) return;
    const LS_KEY = 'lifesync_v2_data';
    localStorage.removeItem(LS_KEY);
    // Re-init from default
    if (window.defaultData) {
      window.app = JSON.parse(JSON.stringify(window.defaultData));
    }
    window.showToast?.('Data reset!');
    if (typeof window.renderPage === 'function') window.renderPage(window.currentPage || 'home');
  }

  // ── Export / Import ───────────────────────────────────────────────────────
  exportData() {
    const json = JSON.stringify(window.app, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `lifesync-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    window.showToast?.('💾 Backup exported!');
  }

  importData(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const imported = JSON.parse(e.target.result);
        window.app = Object.assign({}, window.app, imported);
        window.saveData?.();
        window.showToast?.('✅ Data imported!');
        window.renderPage?.(window.currentPage || 'home');
      } catch {
        window.showToast?.('⚠️ Import failed — invalid file');
      }
    };
    reader.readAsText(file);
  }

  // ── Render settings UI ────────────────────────────────────────────────────
  render() {
    this.migrate();

    const pn = document.getElementById('profile-name-inp');
    const pe = document.getElementById('profile-email-inp');
    if (pn) pn.value = window.app?.profile?.name  || 'Your Name';
    if (pe) pe.value = window.app?.profile?.email || 'user@email.com';

    const sec = document.getElementById('settings-sections');
    if (!sec) return;

    const s = window.app?.settings || {};

    const sections = [
      { title: 'Security', items: [
        { icon:'🔐', label:'PIN Lock',     key:'pin' },
        { icon:'👆', label:'Fingerprint',  key:'fingerprint' },
        { icon:'🤫', label:'Privacy Mode', key:'privacy' },
      ]},
      { title: 'Notifications', items: [
        { icon:'🔔', label:'Notifications',     key:'notifs' },
        { icon:'🔊', label:'Notification Sound', key:'sound' },
        { icon:'📳', label:'Vibration',          key:'vibrate' },
        { icon:'⚠️', label:'Missed Alerts',       key:'missedAlert' },
      ]},
      { title: 'Reminders', items: [
        { icon:'✅', label:'Auto-detect Missed', key:'autoComplete' },
      ]},
      { title: 'Appearance', items: [
        { icon:'🌑', label:'AMOLED Dark', key:'dark' },
      ]},
      { title: 'Data', items: [
        { icon:'💾', label:'Export Backup', action: () => this.exportData() },
        { icon:'📥', label:'Import Backup', action: () => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.json';
            inp.onchange = e => this.importData(e.target.files[0]);
            inp.click();
          }
        },
        { icon:'🗑️', label:'Reset All Data', action: () => this.resetData(), danger: true },
      ]},
    ];

    sec.innerHTML = sections.map(section => `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:#666;margin-bottom:8px;letter-spacing:1px;">${section.title.toUpperCase()}</div>
        <div class="card">
          ${section.items.map((item, i) => {
            const isLast = i === section.items.length - 1;
            const rowStyle = isLast ? 'border-bottom:none;padding-bottom:0;margin-bottom:0;' : '';
            if (item.action) {
              return `
                <div class="settings-row" style="${rowStyle}" onclick="(${item.action.toString()})()">
                  <span class="settings-icon">${item.icon}</span>
                  <span class="settings-label" style="${item.danger ? 'color:#ff2d78;' : ''}">${item.label}</span>
                  <span style="color:${item.danger ? '#ff2d78' : '#555'};font-size:18px;">›</span>
                </div>`;
            }
            const on = s[item.key];
            return `
              <div class="settings-row" style="${rowStyle}">
                <span class="settings-icon">${item.icon}</span>
                <span class="settings-label">${item.label}</span>
                <div class="toggle-wrap"
                     style="background:${on ? 'linear-gradient(90deg,#00d4ff,#b44fff)' : 'rgba(255,255,255,0.1)'};box-shadow:${on ? '0 0 10px rgba(0,212,255,0.4)' : 'none'};"
                     onclick="window.SettingsManager.toggle('${item.key}')">
                  <div class="toggle-thumb" style="left:${on ? '22px' : '3px'};"></div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`).join('');

    // V2.1 version badge
    const versionEl = document.getElementById('settings-version');
    if (versionEl) versionEl.textContent = 'LifeSync V2.1';
  }
}

// ── Export singleton ──────────────────────────────────────────────────────────
window.SettingsManager = new SettingsManager();

// Keep legacy function name compatibility
window.renderSettings  = () => window.SettingsManager.render();
window.saveSettings    = () => window.SettingsManager.saveProfile();
window.toggleSetting   = (key) => window.SettingsManager.toggle(key);
window.resetData       = () => window.SettingsManager.resetData();

export default window.SettingsManager;

window.toggleSetting = function(key) {
  Settings.toggle(key);
};

window.addEventListener('DOMContentLoaded', () => {
  Settings.render();
});

// ═══════════════════════════════════════
// LifeSync V2.2 Advanced Settings
// ═══════════════════════════════════════

window.LifeSyncSettingsPlus = {

  enableAMOLED() {
    document.body.classList.toggle('amoled-mode');
    localStorage.setItem(
      'lifesync_amoled',
      document.body.classList.contains('amoled-mode')
    );
  },

  toggleQuietMode() {
    const enabled = localStorage.getItem('lifesync_quiet') === 'true';

    localStorage.setItem(
      'lifesync_quiet',
      (!enabled).toString()
    );

    window.showToast?.(
      !enabled
        ? '🔕 Quiet Mode Enabled'
        : '🔔 Quiet Mode Disabled'
    );
  },

  exportBackup() {
    const data = JSON.stringify(window.app);

    const blob = new Blob([data], {
      type: 'application/json'
    });

    const a = document.createElement('a');

    a.href = URL.createObjectURL(blob);
    a.download = 'lifesync-backup.json';
    a.click();

    window.showToast?.('💾 Backup Exported');
  },

  clearCompleted() {
    if (!window.app.completedReminders) return;

    window.app.completedReminders = [];

    window.saveData?.();

    window.showToast?.('🗑 Completed reminders cleared');
  },

  appInfo() {
    window.showToast?.(
      'LifeSync V2.2 • Developed by Kr.P'
    );
  }

};

document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.toggle-wrap');

  if (!toggle) return;

  e.stopPropagation();
});
