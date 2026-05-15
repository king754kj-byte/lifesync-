// ══════════════════════════════════════════
// LifeSync V2.2 — settings-manager.js
// Fixed Toggle • Smart Features • Premium Settings
// Replace FULL old settings-manager.js
// ══════════════════════════════════════════

const SETTINGS_DEFAULTS = {

  pin: false,
  fingerprint: true,
  privacy: false,

  notifs: true,
  sound: true,
  vibrate: true,
  missedAlert: true,

  dark: true,

  autoComplete: true,

  // NEW FEATURES
  quietMode: false,
  batterySaver: false,
  calendarSync: true,
  smartSuggestions: true,
  focusMode: false,
  autoBackup: true

};

class SettingsManager {

  constructor() {
    this._migrated = false;
  }

  // ═══════════════════════════════
  // MIGRATE OLD DATA
  // ═══════════════════════════════
  migrate() {

    if (!window.app || this._migrated) return;

    window.app.settings = Object.assign(
      {},
      SETTINGS_DEFAULTS,
      window.app.settings || {}
    );

    if (!window.app.completedReminders)
      window.app.completedReminders = [];

    if (!window.app.missedReminders)
      window.app.missedReminders = [];

    if (!window.app.version)
      window.app.version = '2.2';

    this._migrated = true;
  }

  // ═══════════════════════════════
  // TOGGLE
  // ═══════════════════════════════
  toggle(key) {

    this.migrate();

    window.app.settings[key] =
      !window.app.settings[key];

    const value = window.app.settings[key];

    // SOUND
    if (key === 'sound') {
      window.LifeSyncNotifications?.toggleSound(value);
    }

    // VIBRATION
    if (key === 'vibrate') {
      window.LifeSyncNotifications?.toggleVibrate(value);
    }

    // NOTIFICATIONS
    if (key === 'notifs') {
      this._handleNotifToggle(value);
    }

    // AMOLED
    if (key === 'dark') {

      document.body.classList.toggle(
        'amoled-mode',
        value
      );
    }

    // QUIET MODE
    if (key === 'quietMode') {

      window.showToast?.(
        value
          ? '🌙 Quiet Mode Enabled'
          : '🔔 Quiet Mode Disabled'
      );
    }

    // BATTERY SAVER
    if (key === 'batterySaver') {

      document.body.classList.toggle(
        'battery-saver',
        value
      );

      window.showToast?.(
        value
          ? '🔋 Battery Saver ON'
          : '⚡ Battery Saver OFF'
      );
    }

    // FOCUS MODE
    if (key === 'focusMode') {

      document.body.classList.toggle(
        'focus-mode',
        value
      );

      window.showToast?.(
        value
          ? '🎯 Focus Mode ON'
          : '📱 Focus Mode OFF'
      );
    }

    window.saveData?.();

    this.render();
  }

  // ═══════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════
  async _handleNotifToggle(on) {

    if (on) {

      const perm =
        await window.LifeSyncNotifications?.requestPermission();

      if (perm === 'granted') {

        window.showToast?.(
          '🔔 Notifications Enabled'
        );

      } else {

        window.app.settings.notifs = false;

        window.showToast?.(
          '⚠️ Browser blocked notifications'
        );

        this.render();
      }

    } else {

      window.showToast?.(
        '🔕 Notifications Disabled'
      );
    }
  }

  // ═══════════════════════════════
  // SAVE PROFILE
  // ═══════════════════════════════
  saveProfile() {

    const nameEl =
      document.getElementById('profile-name-inp');

    const emailEl =
      document.getElementById('profile-email-inp');

    if (!window.app.profile)
      window.app.profile = {};

    window.app.profile.name =
      nameEl?.value || 'User';

    window.app.profile.email =
      emailEl?.value || '';

    window.saveData?.();

    window.showToast?.(
      '✅ Profile Saved'
    );
  }

  // ═══════════════════════════════
  // EXPORT BACKUP
  // ═══════════════════════════════
  exportData() {

    const json =
      JSON.stringify(window.app, null, 2);

    const blob = new Blob(
      [json],
      { type:'application/json' }
    );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement('a');

    a.href = url;

    a.download =
      `lifesync-backup-${Date.now()}.json`;

    a.click();

    URL.revokeObjectURL(url);

    window.showToast?.(
      '💾 Backup Exported'
    );
  }

  // ═══════════════════════════════
  // IMPORT BACKUP
  // ═══════════════════════════════
  importData(file) {

    const reader = new FileReader();

    reader.onload = e => {

      try {

        const imported =
          JSON.parse(e.target.result);

        window.app = Object.assign(
          {},
          window.app,
          imported
        );

        window.saveData?.();

        window.showToast?.(
          '✅ Backup Imported'
        );

        window.renderPage?.(
          window.currentPage || 'home'
        );

      } catch {

        window.showToast?.(
          '❌ Invalid Backup File'
        );
      }
    };

    reader.readAsText(file);
  }

  // ═══════════════════════════════
  // RESET DATA
  // ═══════════════════════════════
  resetData() {

    if (
      !confirm(
        'Reset ALL LifeSync data?'
      )
    ) return;

    localStorage.removeItem(
      'lifesync_v2_data'
    );

    location.reload();
  }

  // ═══════════════════════════════
  // RENDER SETTINGS
  // ═══════════════════════════════
  render() {

    this.migrate();

    const sec =
      document.getElementById(
        'settings-sections'
      );

    if (!sec) return;

    const s =
      window.app?.settings || {};

    const sections = [

      {
        title:'Security',
        items:[
          { icon:'🔐', label:'PIN Lock', key:'pin' },
          { icon:'👆', label:'Fingerprint', key:'fingerprint' },
          { icon:'🤫', label:'Privacy Mode', key:'privacy' }
        ]
      },

      {
        title:'Notifications',
        items:[
          { icon:'🔔', label:'Notifications', key:'notifs' },
          { icon:'🔊', label:'Notification Sound', key:'sound' },
          { icon:'📳', label:'Vibration', key:'vibrate' },
          { icon:'⚠️', label:'Missed Alerts', key:'missedAlert' },
          { icon:'🌙', label:'Quiet Mode', key:'quietMode' }
        ]
      },

      {
        title:'Reminders',
        items:[
          { icon:'✅', label:'Auto Detect Missed', key:'autoComplete' },
          { icon:'📅', label:'Calendar Sync', key:'calendarSync' },
          { icon:'🧠', label:'Smart Suggestions', key:'smartSuggestions' }
        ]
      },

      {
        title:'Appearance',
        items:[
          { icon:'🌑', label:'AMOLED Dark', key:'dark' },
          { icon:'🎯', label:'Focus Mode', key:'focusMode' },
          { icon:'🔋', label:'Battery Saver', key:'batterySaver' }
        ]
      },

      {
        title:'Data',
        items:[

          {
            icon:'💾',
            label:'Export Backup',
            action:() => this.exportData()
          },

          {
            icon:'📥',
            label:'Import Backup',
            action:() => {

              const inp =
                document.createElement('input');

              inp.type = 'file';

              inp.accept = '.json';

              inp.onchange = e =>
                this.importData(
                  e.target.files[0]
                );

              inp.click();
            }
          },

          {
            icon:'🗑️',
            label:'Reset All Data',
            danger:true,
            action:() => this.resetData()
          }

        ]
      }

    ];

    sec.innerHTML = sections.map(section => `

      <div style="margin-bottom:16px;">

        <div style="
          font-size:12px;
          color:#666;
          margin-bottom:8px;
          letter-spacing:1px;
        ">
          ${section.title.toUpperCase()}
        </div>

        <div class="card">

          ${section.items.map((item,i) => {

            const on = s[item.key];

            const last =
              i === section.items.length - 1;

            const style =
              last
                ? 'border-bottom:none;margin-bottom:0;padding-bottom:0;'
                : '';

            // ACTION BUTTON
            if (item.action) {

              return `

              <div
                class="settings-row"
                style="${style}"
                onclick="(${item.action.toString()})()"
              >

                <span class="settings-icon">
                  ${item.icon}
                </span>

                <span
                  class="settings-label"
                  style="${
                    item.danger
                      ? 'color:#ff2d78;'
                      : ''
                  }"
                >
                  ${item.label}
                </span>

                <span style="
                  color:#666;
                  font-size:18px;
                ">
                  ›
                </span>

              </div>

              `;
            }

            // TOGGLE
            return `

            <div
              class="settings-row"
              style="${style}"
            >

              <span class="settings-icon">
                ${item.icon}
              </span>

              <span class="settings-label">
                ${item.label}
              </span>

              <div
                class="toggle-wrap"
                onclick="toggleSetting('${item.key}')"
                style="
                  background:${
                    on
                      ? 'linear-gradient(90deg,#00d4ff,#b44fff)'
                      : 'rgba(255,255,255,0.08)'
                  };

                  box-shadow:${
                    on
                      ? '0 0 12px rgba(0,212,255,0.5)'
                      : 'none'
                  };

                  transition:all .25s ease;
                "
              >

                <div
                  class="toggle-thumb"
                  style="
                    left:${
                      on
                        ? '22px'
                        : '3px'
                    };

                    transition:all .25s cubic-bezier(.34,1.56,.64,1);
                  "
                ></div>

              </div>

            </div>

            `;

          }).join('')}

        </div>

      </div>

    `).join('');

    // VERSION
    const versionEl =
      document.getElementById(
        'settings-version'
      );

    if (versionEl) {
      versionEl.textContent =
        'LifeSync V2.2';
    }
  }

}

// ═══════════════════════════════
// EXPORT
// ═══════════════════════════════

window.SettingsManager =
  new SettingsManager();

window.renderSettings =
  () => window.SettingsManager.render();

window.saveSettings =
  () => window.SettingsManager.saveProfile();

window.toggleSetting =
  key => {

    window.SettingsManager.toggle(key);

    setTimeout(() => {
      window.SettingsManager.render();
    }, 50);

  };

window.resetData =
  () => window.SettingsManager.resetData();

export default window.SettingsManager;

// ═══════════════════════════════
// START
// ═══════════════════════════════

window.addEventListener(
  'DOMContentLoaded',
  () => {

    window.SettingsManager.render();

  }
);
