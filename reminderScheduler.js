// ══════════════════════════════════════════════════════════════════════════════
// reminderScheduler.js — LifeSync Premium
// Reminder Scheduler: auto-advance recurring, auto-miss expired,
// notification checks, calendar sync dots
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

/* ── Helper: format date as "Jan 5, 2025" ────────────────────────────────── */
function fmtDate(ms) {
  const d = new Date(ms);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/* ── Recalculate days-left from real dueTs timestamps ────────────────────── */
function recalcReminderDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  (window.app?.reminders || []).forEach(r => {
    if (!r.dueTs) return;
    if (r.status === 'completed') return; // Completed reminders stay as-is
    const due = new Date(r.dueTs);
    due.setHours(0, 0, 0, 0);
    r.days   = Math.round((due - today) / 86400000);
    r.urgent = r.days <= 3 && r.days >= 0;
  });
}

/* ── Sort reminders: active (nearest first) → missed → completed ─────────── */
function sortReminders() {
  const order = { active: 0, missed: 1, completed: 2 };
  (window.app?.reminders || []).sort((a, b) => {
    const ao = order[a.status] ?? 0;
    const bo = order[b.status] ?? 0;
    if (ao !== bo) return ao - bo;
    if (a.status === 'active') return (a.days ?? 999) - (b.days ?? 999);
    return (b.dueTs || 0) - (a.dueTs || 0);
  });
}

/* ── Auto-move expired active reminders → missed (or advance recurring) ──── */
function autoMoveExpired() {
  if (!window.app?.reminders) return;
  let changed = false;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today  = new Date();
  today.setHours(0, 0, 0, 0);

  window.app.reminders.forEach(r => {
    if (r.status !== 'active') return;
    if (typeof r.days !== 'number' || r.days >= 0) return;

    if (r.interval && r.interval > 0) {
      // RECURRING → auto-advance to next due date
      const base = new Date(r.dueTs || today.getTime());
      base.setHours(0, 0, 0, 0);
      let next = new Date(base);
      while (next <= today) next.setDate(next.getDate() + r.interval);

      r.dueTs              = next.getTime();
      r.days               = Math.round((next - today) / 86400000);
      r.urgent             = r.days <= 3;
      r._notifiedToday     = false;
      r._notifiedTomorrow  = false;
      r._notified3d        = false;

      const label = `${months[next.getMonth()]} ${next.getDate()}`;
      if (r.sub) {
        r.sub = r.sub.replace(/Next: \w+ \d+/, `Next: ${label}`);
      } else {
        r.sub = `Every ${r.interval} day${r.interval > 1 ? 's' : ''} • Next: ${label}`;
      }
      changed = true;
    } else {
      // NON-RECURRING → mark missed
      r.status = 'missed';
      changed  = true;
      if (window.LSNotif) {
        window.LSNotif.send('⚠️ Missed: ' + r.icon + ' ' + r.title,
                            'This reminder was not completed in time.');
      }
    }
  });

  if (changed && typeof saveDataSilent === 'function') saveDataSilent();
}

/* ── Check and fire upcoming reminder notifications ─────────────────────── */
function checkReminderNotifications() {
  if (!window.app?.reminders || !window.LSNotif) return;

  window.app.reminders.forEach(r => {
    if (r.status !== 'active') return;
    const d = r.days;

    if (d === 0 && !r._notifiedToday) {
      r._notifiedToday = true;
      window.LSNotif.send(
        '⚡ Due TODAY: ' + r.icon + ' ' + r.title,
        r.sub || "Don't forget to complete this today!"
      );
      if (typeof saveDataSilent === 'function') saveDataSilent();
    }

    if (d === 1 && !r._notifiedTomorrow) {
      r._notifiedTomorrow = true;
      window.LSNotif.send(
        '📅 Due Tomorrow: ' + r.icon + ' ' + r.title,
        r.sub || 'Prepare for tomorrow!'
      );
      if (typeof saveDataSilent === 'function') saveDataSilent();
    }

    if (d === 3 && !r._notified3d) {
      r._notified3d = true;
      window.LSNotif.send(
        '🔔 3 Days Left: ' + r.icon + ' ' + r.title,
        'Coming up in 3 days — plan ahead!'
      );
      if (typeof saveDataSilent === 'function') saveDataSilent();
    }
  });
}

/* ── Sync active reminders onto the calendar as event dots ───────────────── */
function updateCalendarReminderDots() {
  if (!window.app) return;

  const now      = new Date();
  const curMonth = now.getMonth();
  const curYear  = now.getFullYear();

  // Remove previously injected reminder events
  window.app.events = (window.app.events || []).filter(e => !e._fromReminder);

  window.app.reminders.forEach(r => {
    if (r.status === 'completed') return;
    if (!r.dueTs) return;
    const d = new Date(r.dueTs);
    if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
      window.app.events.push({
        id:            'r_' + r.id,
        day:           d.getDate(),
        icon:          r.icon || '🔔',
        title:         r.title,
        time:          r.status === 'missed'
                         ? '⚠️ Missed'
                         : r.days === 0
                           ? '⚡ Today'
                           : `${r.days}d left`,
        color:         r.color || '#00d4ff',
        _fromReminder: true
      });
    }
  });

  if (typeof saveDataSilent === 'function') saveDataSilent();
  if (window.currentPage === 'calendar' && typeof renderCalendar === 'function') {
    renderCalendar();
  }
}

/* ── Quick repeat preset (called from reminder modal buttons) ────────────── */
function setRepeatPreset(days) {
  const inp = document.getElementById('r-interval');
  if (!inp) return;
  if (days === 0) {
    inp.value = '';
  } else {
    inp.value = days;
    const lastDate = document.getElementById('r-lastdate');
    if (lastDate && !lastDate.value) {
      const t = new Date();
      lastDate.value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    }
  }
  if (typeof calcSmartDate === 'function') calcSmartDate();
}

/* ── Main scheduler tick (call on app init + setInterval) ────────────────── */
function schedulerTick() {
  recalcReminderDays();
  autoMoveExpired();
  checkReminderNotifications();
}

/* ── Auto-run scheduler every minute ─────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  schedulerTick();
  setInterval(schedulerTick, 60 * 1000);
});
