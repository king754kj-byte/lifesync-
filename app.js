// ══════════════════════════════════════════
// LifeSync V2.2 — app.js
// FULL CORE APP SYSTEM
// Replace FULL old app.js
// ══════════════════════════════════════════

// ────────────────────────────────────────
// IMPORTS
// ────────────────────────────────────────

import Notifications
from './notifications.js';

import ReminderSys
from './reminder-system.js';

import Settings
from './settings-manager.js';

// ────────────────────────────────────────
// APP START
// ────────────────────────────────────────

document.addEventListener(

  'DOMContentLoaded',

  () => {

    // SETTINGS
    Settings.migrate();

    // START REMINDER ENGINE
    ReminderSys.start();

    // CHECK ALL
    ReminderSys._checkAll();

    // PATCH RENDER
    patchReminderRender();

    // PATCH NOTIFICATION PAGE
    patchNotificationPage();

    // SERVICE WORKER
    registerSW();

    // GLOBAL FUNCTIONS
    exposeGlobals();

    // ONLINE STATUS
    monitorConnection();

    console.log(
      '🚀 LifeSync V2.2 Ready'
    );

  }

);

// ────────────────────────────────────────
// REMINDER RENDER
// ────────────────────────────────────────

function patchReminderRender() {

  const oldRender =
    window.renderReminders;

  window.renderReminders =
    function() {

      if (oldRender)
        oldRender();

      const list =
        document.getElementById(
          'remind-list'
        );

      if (!list) return;

      const reminders =
        window.app?.reminders || [];

      // SORT
      reminders.sort(

        (a,b) =>

        (a.daysLeft || 999) -

        (b.daysLeft || 999)

      );

      // EMPTY
      if (
        reminders.length === 0
      ) {

        list.innerHTML = `

        <div style="
          text-align:center;
          color:#666;
          padding:30px;
          font-size:13px;
        ">

          No reminders yet

        </div>

        `;

        return;

      }

      // BUILD
      list.innerHTML = reminders
        .map(buildReminderCard)
        .join('');

    };

}

// ────────────────────────────────────────
// REMINDER CARD
// ────────────────────────────────────────

function buildReminderCard(r) {

  const isCompleted =
    r.status === 'completed';

  const isMissed =
    r.status === 'missed';

  const urgent =
    (r.daysLeft || 0) <= 3 &&
    !isCompleted &&
    !isMissed;

  return `

  <div

    class="
      card
      ${isCompleted ? 'remind-card-completed' : ''}
      ${isMissed ? 'remind-card-missed' : ''}
    "

    data-reminder-id="${r.id}"

    style="
      margin-bottom:14px;
      border-color:${r.color || '#00d4ff'}33;
      box-shadow:0 0 20px ${r.color || '#00d4ff'}18;
    "

  >

    <div class="remind-card">

      <!-- ICON -->

      <div

        class="remind-icon"

        style="
          background:${r.color || '#00d4ff'}15;
          border:1px solid ${r.color || '#00d4ff'}33;
        "

      >

        ${r.icon || '⏰'}

      </div>

      <!-- CONTENT -->

      <div style="
        flex:1;
        min-width:0;
      ">

        <div style="
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        ">

          <div style="
            font-size:14px;
            font-weight:800;
            color:${
              isCompleted
              ? '#666'
              : '#fff'
            };

            ${
              isCompleted
              ? 'text-decoration:line-through;'
              : ''
            }

          ">

            ${r.title}

          </div>

          ${urgent ? `
          <div class="urgent-pulse"
               style="
                 width:10px;
                 height:10px;
                 border-radius:50%;
                 background:#ff2d78;
               ">
          </div>
          ` : ''}

          ${isCompleted ? `
          <span class="
            remind-status-badge
            remind-status-completed
          ">
            ✓ DONE
          </span>
          ` : ''}

          ${isMissed ? `
          <span class="
            remind-status-badge
            remind-status-missed
          ">
            ❌ MISSED
          </span>
          ` : ''}

        </div>

        <!-- DATE -->

        <div style="
          font-size:11px;
          color:#777;
          margin-top:4px;
        ">

          ${new Date(r.date)
            .toLocaleDateString()}

        </div>

      </div>

      <!-- LABEL -->

      <div style="
        text-align:right;
        margin-left:10px;
      ">

        <div class="remind-days"
             style="
               color:${r.color || '#00d4ff'};
             ">

          ${r.label || 'No date'}

        </div>

      </div>

    </div>

    <!-- ACTIONS -->

    <div style="
      display:flex;
      gap:8px;
      margin-top:12px;
      flex-wrap:wrap;
    ">

      ${!isCompleted ? `

      <button
        class="
          remind-action-btn
          btn-complete
        "
        onclick="
          completeReminder(${r.id})
        "
      >

        ✓ Complete

      </button>

      ` : ''}

      ${!isCompleted ? `

      <button
        class="
          remind-action-btn
          btn-snooze
        "
        onclick="
          snoozeReminder(${r.id},1)
        "
      >

        😴 Snooze

      </button>

      ` : ''}

      <button
        class="
          remind-action-btn
          btn-delete
        "
        onclick="
          deleteReminder(${r.id})
        "
      >

        🗑 Delete

      </button>

      <button
        class="
          remind-action-btn
          btn-edit
        "
        onclick="
          editReminder?.(${r.id})
        "
      >

        ✏️ Edit

      </button>

    </div>

  </div>

  `;

}

// ────────────────────────────────────────
// NOTIFICATION PAGE
// ────────────────────────────────────────

function patchNotificationPage() {

  const oldNotif =
    window.renderNotifications;

  window.renderNotifications =
    function() {

      if (oldNotif)
        oldNotif();

      const stats =
        document.getElementById(
          'notif-stats-row'
        );

      if (!stats) return;

      const reminders =
        window.app?.reminders || [];

      const completed =
        reminders.filter(

          r => r.status === 'completed'

        ).length;

      const missed =
        reminders.filter(

          r => r.status === 'missed'

        ).length;

      const urgent =
        reminders.filter(

          r =>

          (r.daysLeft || 0) <= 3 &&

          r.status !== 'completed'

        ).length;

      stats.innerHTML = `

      <div class="notif-stat-card">
        <div>${completed}</div>
        <span>Completed</span>
      </div>

      <div class="notif-stat-card">
        <div>${missed}</div>
        <span>Missed</span>
      </div>

      <div class="notif-stat-card">
        <div>${urgent}</div>
        <span>Urgent</span>
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

  navigator
    .serviceWorker
    .register('./service-worker.js')

    .then(() => {

      console.log(
        '✅ SW Registered'
      );

    })

    .catch(err => {

      console.warn(
        'SW Error:',
        err.message
      );

    });

}

// ────────────────────────────────────────
// GLOBALS
// ────────────────────────────────────────

function exposeGlobals() {

  window.completeReminder =
    id => {

      window
        .ReminderSystem
        ?.complete(id);

    };

  window.deleteReminder =
    id => {

      window
        .ReminderSystem
        ?.delete(id);

    };

  window.snoozeReminder =
    (id,days=1) => {

      window
        .ReminderSystem
        ?.snooze(id,days);

    };

  window.playNotifSound =
    type => {

      Notifications
        ?.playSound(type);

    };

}

// ────────────────────────────────────────
// ONLINE/OFFLINE
// ────────────────────────────────────────

function monitorConnection() {

  window.addEventListener(
    'offline',
    () => {

      document.body.classList.add(
        'offline-mode'
      );

      window.showToast?.(
        '📴 Offline Mode'
      );

    }
  );

  window.addEventListener(
    'online',
    () => {

      document.body.classList.remove(
        'offline-mode'
      );

      window.showToast?.(
        '🌐 Back Online'
      );

    }
  );

}

// ────────────────────────────────────────
// LIVE REFRESH
// ────────────────────────────────────────

setInterval(() => {

  window
    .ReminderSystem
    ?._checkAll();

}, 60000);

// ────────────────────────────────────────
// DAILY SUMMARY
// ────────────────────────────────────────

setInterval(() => {

  window
    .LifeSyncAdvancedNotify
    ?.dailySummary();

}, 1000 * 60 * 60 * 24);

console.log(
  '🚀 App.js V2.2 Loaded'
);
