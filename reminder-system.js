// ═══════════════════════════════════════════════════════
// LifeSync V2.2 — REAL Reminder System
// Real countdown • Real calendar • Editable • Dynamic
// Replace FULL old reminder-system.js with this
// ═══════════════════════════════════════════════════════

function getTodayDate() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}

function calculateDaysLeft(targetDate) {
  const today = getTodayDate();

  const target = new Date(targetDate);
  target.setHours(0,0,0,0);

  const diffDays = Math.floor(
    (target - today) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return 'Missed';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';

  return `${diffDays} days left`;
}

class ReminderSystem {

  constructor() {
    this.CHECK_INTERVAL_MS = 30000;
    this._timer = null;
  }

  // ═══════════════════════════════
  // START ENGINE
  // ═══════════════════════════════
  start() {
    this._checkAll();

    this._timer = setInterval(() => {
      this._checkAll();
    }, this.CHECK_INTERVAL_MS);

    console.log('✅ LifeSync Reminder Engine Started');
  }

  stop() {
    clearInterval(this._timer);
  }

  // ═══════════════════════════════
  // MAIN REAL-TIME CHECK
  // ═══════════════════════════════
  _checkAll() {

    if (!window.app) return;

    const reminders = window.app.reminders || [];

    reminders.forEach(r => {

      if (!r.date) return;

      const today = getTodayDate();

      const target = new Date(r.date);
      target.setHours(0,0,0,0);

      const diffDays = Math.floor(
        (target - today) / (1000 * 60 * 60 * 24)
      );

      // REAL dynamic values
      r.daysLeft = diffDays;
      r.label = calculateDaysLeft(r.date);

      // AUTO STATUS
      if (diffDays < 0) {
        r.status = 'missed';
      }

      else if (r.status !== 'completed') {
        r.status = 'active';
      }

      // TODAY ALERT
      if (
        diffDays === 0 &&
        !r._todayAlert
      ) {

        r._todayAlert = true;

        window.LifeSyncNotifications?.send(
          r.title,
          '⚡ Reminder is TODAY',
          {
            urgency: 'urgent'
          }
        );
      }

      // TOMORROW ALERT
      if (
        diffDays === 1 &&
        !r._tomorrowAlert
      ) {

        r._tomorrowAlert = true;

        window.LifeSyncNotifications?.send(
          r.title,
          '⏰ Reminder is TOMORROW',
          {
            urgency: 'normal'
          }
        );
      }

      // MISSED ALERT
      if (
        diffDays < 0 &&
        !r._missedAlert
      ) {

        r._missedAlert = true;

        window.LifeSyncNotifications?.send(
          r.title,
          '❌ Reminder MISSED',
          {
            urgency: 'urgent'
          }
        );
      }

    });

    window.saveData?.();

    if (window.renderReminders)
      window.renderReminders();

    if (window.renderCalendar)
      window.renderCalendar();
  }

  // ═══════════════════════════════
  // COMPLETE
  // ═══════════════════════════════
  complete(id) {

    const r = this._find(id);

    if (!r) return;

    r.status = 'completed';

    r.completedAt = new Date().toISOString();

    window.LifeSyncNotifications?.send(
      '✅ Completed',
      r.title,
      {
        urgency: 'low'
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
  }

  // ═══════════════════════════════
  // EDIT REMINDER
  // ═══════════════════════════════
  edit(id, updates) {

    const r = this._find(id);

    if (!r) return;

    Object.assign(r, updates);

    r._todayAlert = false;
    r._tomorrowAlert = false;
    r._missedAlert = false;

    window.saveData?.();

    this._checkAll();

    window.showToast?.('✏️ Reminder updated');
  }

  // ═══════════════════════════════
  // ADD REMINDER
  // ═══════════════════════════════
  add(data) {

    if (!window.app.reminders)
      window.app.reminders = [];

    const reminder = {

      id: Date.now(),

      title: data.title || 'Reminder',

      date: data.date,

      category: data.category || 'General',

      status: 'active',

      createdAt: new Date().toISOString()

    };

    window.app.reminders.unshift(reminder);

    window.saveData?.();

    this._checkAll();

    window.showToast?.('✅ Reminder added');
  }

  // ═══════════════════════════════
  // REAL RECURRING SYSTEM
  // ═══════════════════════════════
  repeatReminder(reminder) {

    if (!reminder.repeatType) return;

    const next = new Date(reminder.date);

    if (reminder.repeatType === 'daily')
      next.setDate(next.getDate() + 1);

    if (reminder.repeatType === 'weekly')
      next.setDate(next.getDate() + 7);

    if (reminder.repeatType === 'monthly')
      next.setMonth(next.getMonth() + 1);

    if (reminder.repeatType === 'yearly')
      next.setFullYear(next.getFullYear() + 1);

    reminder.date = next.toISOString();

    reminder.status = 'active';

    reminder._todayAlert = false;
    reminder._tomorrowAlert = false;
    reminder._missedAlert = false;
  }

  // ═══════════════════════════════
  // GOOGLE CALENDAR EXPORT
  // ═══════════════════════════════
  exportToGoogleCalendar(id) {

    const r = this._find(id);

    if (!r) return;

    const start = new Date(r.date)
      .toISOString()
      .replace(/-|:|\.\d+/g,'');

    const end = start;

    const url =
      `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(r.title)}&dates=${start}/${end}`;

    window.open(url, '_blank');
  }

  // ═══════════════════════════════
  // HELPERS
  // ═══════════════════════════════
  _find(id) {
    return window.app.reminders.find(
      r => r.id === id
    );
  }

  _refresh() {

    if (window.renderReminders)
      window.renderReminders();

    if (window.renderCalendar)
      window.renderCalendar();

    if (window.renderHome)
      window.renderHome();
  }

}

// ═══════════════════════════════
// NEW FEATURES
// ═══════════════════════════════

// 1️⃣ AUTO MIDNIGHT REFRESH
setInterval(() => {

  const now = new Date();

  if (
    now.getHours() === 0 &&
    now.getMinutes() === 0
  ) {

    window.ReminderSystem?._checkAll();

  }

}, 60000);

// 2️⃣ SMART UPCOMING FILTER
window.getUpcomingReminders = function() {

  return (window.app?.reminders || [])
    .filter(r => r.daysLeft >= 0)
    .sort((a,b) => a.daysLeft - b.daysLeft);

};

// 3️⃣ TODAY REMINDER COUNT
window.getTodayReminderCount = function() {

  return (window.app?.reminders || [])
    .filter(r => r.daysLeft === 0)
    .length;

};

// ═══════════════════════════════
// EXPORT
// ═══════════════════════════════

window.ReminderSystem = new ReminderSystem();

export default window.ReminderSystem;

// ═══════════════════════════════
// START ENGINE
// ═══════════════════════════════

window.addEventListener('DOMContentLoaded', () => {

  window.ReminderSystem.start();

});
