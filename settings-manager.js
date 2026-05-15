// ══════════════════════════════════════════
// LifeSync V2.2 — settings-manager.js
// FULL WORKING SETTINGS SYSTEM
// Replace FULL old settings-manager.js
// ══════════════════════════════════════════

const SETTINGS_DEFAULTS = {

  pin:false,
  fingerprint:true,
  privacy:false,

  notifs:true,
  sound:true,
  vibrate:true,

  dark:true,
  amoled:true,

  autoBackup:true,
  autoSync:true,

  quietMode:false,
  missedAlert:true,

  autoComplete:true,

  reminderRealtime:true

};

class SettingsManager {

  constructor() {

    this._migrated = false;

  }

  // ═══════════════════════════════
  // MIGRATE
  // ═══════════════════════════════

  migrate() {

    if (!window.app) return;

    if (this._migrated) return;

    window.app.settings = Object.assign(

      {},
      SETTINGS_DEFAULTS,
      window.app.settings || {}

    );

    if (!window.app.completedReminders)
      window.app.completedReminders = [];

    if (!window.app.missedReminders)
      window.app.missedReminders = [];

    if (!window.app.notifications)
      window.app.notifications = [];

    if (!window.app.version)
      window.app.version = '2.2';

    this._migrated = true;

  }

  // ═══════════════════════════════
  // TOGGLE
  // ═══════════════════════════════

  async toggle(key) {

    this.migrate();

    const settings =
      window.app.settings;

    settings[key] = !settings[key];

    // SOUND
    if (key === 'sound') {

      window.LifeSyncNotifications
        ?.toggleSound(settings.sound);

    }

    // VIBRATE
    if (key === 'vibrate') {

      window.LifeSyncNotifications
        ?.toggleVibrate(settings.vibrate);

    }

    // NOTIFICATIONS
    if (key === 'notifs') {

      if (settings.notifs) {

        const perm =
          await window
            .LifeSyncNotifications
            ?.requestPermission();

        if (perm !== 'granted') {

          settings.notifs = false;

          window.showToast?.(
            '❌ Notification Permission Denied'
          );

        } else {

          window.showToast?.(
            '🔔 Notifications Enabled'
          );

        }

      } else {

        window.showToast?.(
          '🔕 Notifications Disabled'
        );

      }

    }

    // AMOLED
    if (key === 'amoled') {

      document.body.classList.toggle(
        'amoled-mode',
        settings.amoled
      );

    }

    // QUIET MODE
    if (key === 'quietMode') {

      window.showToast?.(

        settings.quietMode
          ? '🤫 Quiet Mode Enabled'
          : '🔔 Quiet Mode Disabled'

      );

    }

    // AUTO SYNC
    if (key === 'autoSync') {

      window.showToast?.(

        settings.autoSync
          ? '☁️ Auto Sync Enabled'
          : '☁️ Auto Sync Disabled'

      );

    }

    window.saveData?.();

    this.render();

  }

  // ═══════════════════════════════
  // SAVE PROFILE
  // ═══════════════════════════════

  saveProfile() {

    const name =
      document.getElementById(
        'profile-name-inp'
      );

    const email =
      document.getElementById(
        'profile-email-inp'
      );

    if (!window.app.profile)
      window.app.profile = {};

    window.app.profile.name =
      name?.value || '';

    window.app.profile.email =
      email?.value || '';

    window.saveData?.();

    window.showToast?.(
      '✅ Profile Saved'
    );

  }

  // ═══════════════════════════════
  // EXPORT
  // ═══════════════════════════════

  exportData() {

    const data =
      JSON.stringify(
        window.app,
        null,
        2
      );

    const blob =
      new Blob([data], {

        type:'application/json'

      });

    const a =
      document.createElement('a');

    a.href =
      URL.createObjectURL(blob);

    a.download =
      `lifesync-v2.2-backup.json`;

    a.click();

    window.showToast?.(
      '💾 Backup Exported'
    );

  }

  // ═══════════════════════════════
  // IMPORT
  // ═══════════════════════════════

  importData(file) {

    const reader =
      new FileReader();

    reader.onload = e => {

      try {

        const data =
          JSON.parse(e.target.result);

        window.app =
          Object.assign(
            {},
            window.app,
            data
          );

        window.saveData?.();

        window.showToast?.(
          '✅ Backup Imported'
        );

        location.reload();

      } catch {

        window.showToast?.(
          '❌ Invalid Backup File'
        );

      }

    };

    reader.readAsText(file);

  }

  // ═══════════════════════════════
  // RESET
  // ═══════════════════════════════

  resetData() {

    if (
      !confirm(
        'Reset all LifeSync data?'
      )
    ) return;

    localStorage.clear();

    window.showToast?.(
      '🗑 Data Reset'
    );

    setTimeout(() => {

      location.reload();

    }, 1000);

  }

  // ═══════════════════════════════
  // CLEAR COMPLETED
  // ═══════════════════════════════

  clearCompleted() {

    window.app.completedReminders = [];

    window.saveData?.();

    window.showToast?.(
      '🧹 Completed Cleared'
    );

  }

  // ═══════════════════════════════
  // RENDER
  // ═══════════════════════════════

  render() {

    this.migrate();

    const sec =
      document.getElementById(
        'settings-sections'
      );

    if (!sec) return;

    const s =
      window.app.settings;

    const rows = [

      ['🔔','Notifications','notifs'],
      ['🔊','Sound','sound'],
      ['📳','Vibration','vibrate'],
      ['🌑','AMOLED Mode','amoled'],
      ['🤫','Quiet Mode','quietMode'],
      ['☁️','Auto Sync','autoSync'],
      ['💾','Auto Backup','autoBackup'],
      ['⚡','Realtime Reminder','reminderRealtime'],
      ['⚠️','Missed Alerts','missedAlert']

    ];

    sec.innerHTML = rows.map(r => {

      const icon = r[0];
      const label = r[1];
      const key = r[2];

      const on = s[key];

      return `

      <div class="settings-row">

        <div class="settings-icon">
          ${icon}
        </div>

        <div class="settings-label">
          ${label}
        </div>

        <div class="toggle-wrap"

          onclick="toggleSetting('${key}')"

          style="
            background:${
              on
              ? 'linear-gradient(90deg,#00d4ff,#b44fff)'
              : 'rgba(255,255,255,0.1)'
            };

            box-shadow:${
              on
              ? '0 0 14px rgba(0,212,255,0.35)'
              : 'none'
            };
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
            "

          ></div>

        </div>

      </div>

      `;

    }).join('');

    const version =
      document.getElementById(
        'settings-version'
      );

    if (version) {

      version.textContent =
        'LifeSync V2.2';

    }

  }

}

// ═══════════════════════════════
// EXPORTS
// ═══════════════════════════════

window.SettingsManager =
  new SettingsManager();

window.renderSettings =
  () => window.SettingsManager.render();

window.toggleSetting =
  key => window.SettingsManager.toggle(key);

window.saveSettings =
  () => window.SettingsManager.saveProfile();

window.resetData =
  () => window.SettingsManager.resetData();

export default window.SettingsManager;

// ═══════════════════════════════
// AUTO START
// ═══════════════════════════════

window.addEventListener(
  'DOMContentLoaded',
  () => {

    window.SettingsManager.render();

  }
);

console.log(
  '⚙️ Settings Manager V2.2 Ready'
);
