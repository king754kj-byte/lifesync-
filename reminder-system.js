// ══════════════════════════════════════════
// LifeSync V2.2 — reminder-system.js
// FULL REAL REMINDER ENGINE
// Replace FULL old reminder-system.js
// ══════════════════════════════════════════

// ═══════════════════════════════
// DATE HELPERS
// ═══════════════════════════════

function getTodayDate() {

  const d = new Date();

  d.setHours(0,0,0,0);

  return d;

}

function calculateDaysLeft(targetDate) {

  const today =
    getTodayDate();

  const target =
    new Date(targetDate);

  target.setHours(0,0,0,0);

  const diffDays =
    Math.floor(

      (target - today) /

      (1000 * 60 * 60 * 24)

    );

  if (diffDays < 0)
    return 'Missed';

  if (diffDays === 0)
    return 'Today';

  if (diffDays === 1)
    return 'Tomorrow';

  return `${diffDays} days left`;

}

// ═══════════════════════════════
// REMINDER SYSTEM
// ═══════════════════════════════

class ReminderSystem {

  constructor() {

    this.CHECK_INTERVAL_MS =
      60000;

    this._timer = null;

  }

  // ═══════════════════════════════
  // START
  // ═══════════════════════════════

  start() {

    this._checkAll();

    this._timer =
      setInterval(() => {

        this._checkAll();

      }, this.CHECK_INTERVAL_MS);

    console.log(
      '⏰ Reminder Engine Started'
    );

  }

  stop() {

    clearInterval(
      this._timer
    );

  }

  // ═══════════════════════════════
  // MAIN CHECK
  // ═══════════════════════════════

  _checkAll() {

    if (!window.app) return;

    const reminders =
      window.app.reminders || [];

    reminders.forEach(r => {

      if (!r.date) return;

      const today =
        getTodayDate();

      const target =
        new Date(r.date);

      target.setHours(0,0,0,0);

      const diffDays =
        Math.floor(

          (target - today) /

          (1000 * 60 * 60 * 24)

        );

      // REAL VALUES
      r.daysLeft =
        diffDays;

      r.label =
        calculateDaysLeft(
          r.date
        );

      // STATUS
      if (diffDays < 0) {

        r.status =
          'missed';

      }

      else if (
        r.status !== 'completed'
      ) {

        r.status =
          'active';

      }

      // TODAY ALERT
      if (

        diffDays === 0 &&

        !r._todayAlert

      ) {

        r._todayAlert = true;

        window
          .LifeSyncNotifications
          ?.send(

            r.title,

            '⚡ Reminder is TODAY',

            {
              urgency:'urgent'
            }

          );

      }

      // TOMORROW ALERT
      if (

        diffDays === 1 &&

        !r._tomorrowAlert

      ) {

        r._tomorrowAlert = true;

        window
          .LifeSyncNotifications
          ?.send(

            r.title,

            '⏰ Reminder is TOMORROW',

            {
              urgency:'normal'
            }

          );

      }

      // MISSED ALERT
      if (

        diffDays < 0 &&

        !r._missedAlert

      ) {

        r._missedAlert = true;

        window
          .LifeSyncNotifications
          ?.send(

            r.title,

            '❌ Reminder MISSED',

            {
              urgency:'urgent'
            }

          );

      }

    });

    window.saveData?.();

    this._refresh();

  }

  // ═══════════════════════════════
  // ADD
  // ═══════════════════════════════

  add(data) {

    if (!window.app.reminders)
      window.app.reminders = [];

    const reminder = {

      id:
        Date.now(),

      title:
        data.title || 'Reminder',

      date:
        new Date(
          data.date
        ).toISOString(),

      category:
        data.category || 'General',

      color:
        data.color || '#00d4ff',

      icon:
        data.icon || '⏰',

      status:
        'active',

      createdAt:
        new Date().toISOString()

    };

    window.app.reminders.unshift(
      reminder
    );

    this._checkAll();

    this._refresh();

    window.saveData?.();

    window.showToast?.(
      '✅ Reminder Added'
    );

  }

  // ═══════════════════════════════
  // COMPLETE
  // ═══════════════════════════════

  complete(id) {

    const r =
      this._find(id);

    if (!r) return;

    r.status =
      'completed';

    r.completedAt =
      new Date().toISOString();

    if (
      !window.app.completedReminders
    ) {

      window.app.completedReminders = [];

    }

    window
      .app
      .completedReminders
      .unshift({ ...r });

    window
      .LifeSyncNotifications
      ?.send(

        '✅ Completed',

        r.title,

        {
          urgency:'low'
        }

      );

    window.saveData?.();

    this._refresh();

  }

  // ═══════════════════════════════
  // DELETE
  // ═══════════════════════════════

  delete(id) {

    window.app.reminders =

      window.app.reminders.filter(

        r => r.id !== id

      );

    window.saveData?.();

    this._refresh();

    window.showToast?.(
      '🗑 Reminder Deleted'
    );

  }

  // ═══════════════════════════════
  // EDIT
  // ═══════════════════════════════

  edit(id, updates) {

    const r =
      this._find(id);

    if (!r) return;

    Object.assign(
      r,
      updates
    );

    r._todayAlert = false;
    r._tomorrowAlert = false;
    r._missedAlert = false;

    window.saveData?.();

    this._checkAll();

    window.showToast?.(
      '✏️ Reminder Updated'
    );

  }

  // ═══════════════════════════════
  // SNOOZE
  // ═══════════════════════════════

  snooze(id, days = 1) {

    const r =
      this._find(id);

    if (!r) return;

    const next =
      new Date(r.date);

    next.setDate(
      next.getDate() + days
    );

    r.date =
      next.toISOString();

    r.status =
      'active';

    r._todayAlert = false;
    r._tomorrowAlert = false;
    r._missedAlert = false;

    window.saveData?.();

    this._checkAll();

    window.showToast?.(
      `😴 Snoozed ${days} day`
    );

  }

  // ═══════════════════════════════
  // REPEAT SYSTEM
  // ═══════════════════════════════

  repeatReminder(reminder) {

    if (!reminder.repeatType)
      return;

    const next =
      new Date(reminder.date);

    if (
      reminder.repeatType === 'daily'
    ) {

      next.setDate(
        next.getDate() + 1
      );

    }

    if (
      reminder.repeatType === 'weekly'
    ) {

      next.setDate(
        next.getDate() + 7
      );

    }

    if (
      reminder.repeatType === 'monthly'
    ) {

      next.setMonth(
        next.getMonth() + 1
      );

    }

    if (
      reminder.repeatType === 'yearly'
    ) {

      next.setFullYear(
        next.getFullYear() + 1
      );

    }

    reminder.date =
      next.toISOString();

    reminder.status =
      'active';

  }

  // ═══════════════════════════════
  // EXPORT GOOGLE CALENDAR
  // ═══════════════════════════════

  exportToGoogleCalendar(id) {

    const r =
      this._find(id);

    if (!r) return;

    const start =
      new Date(r.date)

      .toISOString()

      .replace(
        /-|:|\.\d+/g,
        ''
      );

    const url =

      `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(r.title)}&dates=${start}/${start}`;

    window.open(
      url,
      '_blank'
    );

  }

  // ═══════════════════════════════
  // FIND
  // ═══════════════════════════════

  _find(id) {

    return (
      window.app.reminders || []
    ).find(

      r => r.id == id

    );

  }

  // ═══════════════════════════════
  // REFRESH
  // ═══════════════════════════════

  _refresh() {

    window.renderReminders?.();

    window.renderHome?.();

    window.renderCalendar?.();

    window.renderNotifications?.();

  }

}

// ═══════════════════════════════
// GLOBAL HELPERS
// ═══════════════════════════════

window.getUpcomingReminders =
  function() {

    return (

      window.app?.reminders || []

    )

    .filter(

      r => r.daysLeft >= 0

    )

    .sort(

      (a,b) =>

      a.daysLeft - b.daysLeft

    );

  };

window.getTodayReminderCount =
  function() {

    return (

      window.app?.reminders || []

    ).filter(

      r => r.daysLeft === 0

    ).length;

  };

// ═══════════════════════════════
// EXPORT
// ═══════════════════════════════

window.ReminderSystem =
  new ReminderSystem();

export default
  window.ReminderSystem;

// ═══════════════════════════════
// AUTO START
// ═══════════════════════════════

window.addEventListener(

  'DOMContentLoaded',

  () => {

    window
      .ReminderSystem
      .start();

  }

);

console.log(
  '⏰ Reminder System V2.2 Ready'
);
