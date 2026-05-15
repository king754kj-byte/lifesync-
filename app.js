// ══════════════════════════════════════════
// LifeSync V2.2 — app.js
// Ultra Core Bootstrap System
// Real Reminder • Smart UI • PWA Optimized
// Replace FULL old app.js
// ══════════════════════════════════════════

// ────────────────────────────────────────
// IMPORTS
// ────────────────────────────────────────

import Notifications from './notifications.js';
import ReminderSys from './reminder-system.js';
import Settings from './settings-manager.js';

// ────────────────────────────────────────
// BOOT
// ────────────────────────────────────────

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    console.log(
      '🚀 LifeSync V2.2 Booting...'
    );

    // SETTINGS
    Settings.migrate();

    // NOTIFICATION SETTINGS
    if (window.app?.settings) {

      Notifications.soundEnabled =
        window.app.settings.sound !== false;

      Notifications.vibEnabled =
        window.app.settings.vibrate !== false;

    }

    // START REMINDER ENGINE
    ReminderSys.start();

    // PATCH SYSTEMS
    patchReminderRender();
    patchNotificationPage();

    // SERVICE WORKER
    registerSW();

    // GLOBAL FUNCTIONS
    exposeGlobals();

    // ONLINE/OFFLINE
    setupConnectionListener();

    // APP RESTORE
    setupVisibilityRefresh();

    // AUTO SAVE
    setupAutoSave();

    // DAILY REFRESH
    setupDailyRefresh();

    // PERFORMANCE CLEANUP
    setupMemoryCleanup();

    // FIRST RENDER
    window.renderReminders?.();
    window.renderHome?.();
    window.renderCalendar?.();

    console.log(
      '✅ LifeSync V2.2 Ready'
    );

  }
);

// ────────────────────────────────────────
// REMINDER PATCH
// ────────────────────────────────────────

function patchReminderRender() {

  const original =
    window.renderReminders;

  window.renderReminders = function() {

    if (original)
      original();

    const list =
      document.getElementById(
        'remind-list'
      );

    if (!list) return;

    const reminders =
      window.app?.reminders || [];

    if (!reminders.length) {

      list.innerHTML = `

        <div style="
          color:#666;
          text-align:center;
          padding:28px;
          font-size:13px;
        ">
          No reminders yet
        </div>

      `;

      return;
    }

    const sorted = reminders.sort(
      (a,b) =>
        (a.daysLeft || 9999) -
        (b.daysLeft || 9999)
    );

    list.innerHTML =
      sorted.map(buildReminderCard)
      .join('');

  };

}

// ────────────────────────────────────────
// REMINDER CARD
// ────────────────────────────────────────

function buildReminderCard(r) {

  const status =
    r.status || 'active';

  const urgent =
    r.daysLeft <= 1 &&
    status === 'active';

  return `

  <div
    class="card remind-card ${urgent ? 'urgent-live' : ''}"
    data-reminder-id="${r.id}"
    style="
      margin-bottom:12px;
      border:
        1px solid ${
          status === 'missed'
            ? 'rgba(255,45,120,0.3)'
            : 'rgba(255,255,255,0.06)'
        };
    "
  >

    <div class="remind-card">

      <div
        class="remind-icon"
        style="
          background:${r.color || '#00d4ff'}22;
        "
      >
        ${r.icon || '⏰'}
      </div>

      <div
        style="
          flex:1;
          min-width:0;
        "
      >

        <div style="
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        ">

          <div style="
            font-size:14px;
            font-weight:700;
            color:${
              status === 'completed'
                ? '#666'
                : '#fff'
            };
          ">

            ${r.title}

          </div>

          ${
            status === 'completed'
              ? `
                <span class="remind-status-badge remind-status-completed">
                  ✓ DONE
                </span>
              `
              : ''
          }

          ${
            status === 'missed'
              ? `
                <span class="remind-status-badge remind-status-missed">
                  ❌ MISSED
                </span>
              `
              : ''
          }

        </div>

        <div style="
          font-size:11px;
          color:#777;
          margin-top:4px;
        ">
          ${r.label || ''}
        </div>

      </div>

      <div style="
        text-align:right;
      ">

        ${
          status === 'active'
            ? `
            <div
              class="remind-days"
              style="
                color:${
                  urgent
                    ? '#ff2d78'
                    : '#00d4ff'
                };
              "
            >
              ${r.daysLeft}
            </div>

            <div
              class="remind-dayslabel"
            >
              days
            </div>
            `
            : ''
        }

      </div>

    </div>

    <div style="
      display:flex;
      gap:8px;
      margin-top:12px;
      flex-wrap:wrap;
    ">

      ${
        status !== 'completed'
          ? `
          <button
            class="remind-action-btn btn-complete"
            onclick="completeReminder(${r.id})"
          >
            ✓ Complete
          </button>
          `
          : ''
      }

      <button
        class="remind-action-btn btn-snooze"
        onclick="editReminder(${r.id})"
      >
        ✏️ Edit
      </button>

      <button
        class="remind-action-btn"
        style="
          background:rgba(255,45,120,0.12);
          border:1px solid rgba(255,45,120,0.3);
          color:#ff2d78;
        "
        onclick="deleteReminder(${r.id})"
      >
        🗑 Delete
      </button>

    </div>

  </div>

  `;
}

// ────────────────────────────────────────
// NOTIFICATION PAGE PATCH
// ────────────────────────────────────────

function patchNotificationPage() {

  const original =
    window.renderNotifications;

  window.renderNotifications = function() {

    if (original)
      original();

    const counts =
      window.ReminderSystem?.getCounts?.() || {};

    const el =
      document.getElementById(
        'notif-stats-row'
      );

    if (!el) return;

    el.innerHTML = `

      <div class="card">

        <div style="
          font-size:22px;
          font-weight:900;
          color:#00e676;
        ">
          ${counts.completed || 0}
        </div>

        <div style="
          font-size:10px;
          color:#666;
        ">
          Completed
        </div>

      </div>

      <div class="card">

        <div style="
          font-size:22px;
          font-weight:900;
          color:#ff2d78;
        ">
          ${counts.missed || 0}
        </div>

        <div style="
          font-size:10px;
          color:#666;
        ">
          Missed
        </div>

      </div>

      <div class="card">

        <div style="
          font-size:22px;
          font-weight:900;
          color:#ffb300;
        ">
          ${counts.urgent || 0}
        </div>

        <div style="
          font-size:10px;
          color:#666;
        ">
          Urgent
        </div>

      </div>

    `;

  };

}

// ────────────────────────────────────────
// SERVICE WORKER
// ────────────────────────────────────────

function registerSW() {

  if (
    !('serviceWorker' in navigator)
  ) return;

  navigator.serviceWorker
    .register('./service-worker.js')
    .then(() => {

      console.log(
        '✅ SW V2.2 Registered'
      );

    })
    .catch(err => {

      console.warn(
        'SW Error:',
        err
      );

    });

}

// ────────────────────────────────────────
// GLOBALS
// ────────────────────────────────────────

function exposeGlobals() {

  window.completeReminder =
    id =>
      window.ReminderSystem?.complete(id);

  window.deleteReminder =
    id =>
      window.ReminderSystem?.delete(id);

  window.playNotifSound =
    type =>
      Notifications.playSound(type);

  window.exportBackup =
    () =>
      Settings.exportData();

}

// ────────────────────────────────────────
// CONNECTION LISTENER
// ────────────────────────────────────────

function setupConnectionListener() {

  window.addEventListener(
    'online',
    () => {

      window.showToast?.(
        '🌐 Back Online'
      );

      document.body.classList.remove(
        'offline-mode'
      );

    }
  );

  window.addEventListener(
    'offline',
    () => {

      window.showToast?.(
        '📴 Offline Mode'
      );

      document.body.classList.add(
        'offline-mode'
      );

    }
  );

}

// ────────────────────────────────────────
// APP RESTORE
// ────────────────────────────────────────

function setupVisibilityRefresh() {

  document.addEventListener(
    'visibilitychange',
    () => {

      if (!document.hidden) {

        window.renderReminders?.();
        window.renderHome?.();
        window.renderCalendar?.();

      }

    }
  );

}

// ────────────────────────────────────────
// AUTO SAVE
// ────────────────────────────────────────

function setupAutoSave() {

  setInterval(() => {

    window.saveData?.();

  }, 1000 * 60 * 3);

}

// ────────────────────────────────────────
// DAILY REFRESH
// ────────────────────────────────────────

function setupDailyRefresh() {

  setInterval(() => {

    const now =
      new Date();

    if (
      now.getHours() === 0 &&
      now.getMinutes() === 0
    ) {

      window.ReminderSystem?._checkAll();

    }

  }, 60000);

}

// ────────────────────────────────────────
// MEMORY CLEANUP
// ────────────────────────────────────────

function setupMemoryCleanup() {

  setInterval(() => {

    if (
      window.app?.notifications?.length > 100
    ) {

      window.app.notifications =
        window.app.notifications.slice(0, 80);

    }

  }, 1000 * 60 * 10);

}

// ────────────────────────────────────────
// LIVE CLOCK
// ────────────────────────────────────────

window.getCurrentTime = function() {

  return new Date()
    .toLocaleTimeString([], {

      hour:'2-digit',
      minute:'2-digit'

    });

};

// ────────────────────────────────────────
// DAILY SUMMARY
// ────────────────────────────────────────

setInterval(() => {

  window.LifeSyncAdvancedNotify?.dailySummary();

}, 1000 * 60 * 60 * 24);

// ────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────

export {
  Notifications,
  ReminderSys,
  Settings
};
