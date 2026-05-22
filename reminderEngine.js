// ══════════════════════════════════════════════════════════════════════════════
// reminderEngine.js — LifeSync Premium
// Full Reminder CRUD engine: save, complete, restore, delete, snooze,
// rendering, migration from legacy format
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

/* ── Migrate old demo reminders → real date-based format ─────────────────── */
function migrateReminders() {
  if (!window.app) return;
  let changed = false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  (window.app.reminders || []).forEach(r => {
    // Assign real dueTs if missing
    if (!r.dueTs) {
      const daysLeft = typeof r.days === 'number' ? r.days : 0;
      const due = new Date(today);
      due.setDate(due.getDate() + daysLeft);
      r.dueTs  = due.getTime();
      changed  = true;
    }
    if (!r.status)                    { r.status = 'active';    changed = true; }
    if (r._notifiedToday  === undefined) { r._notifiedToday    = false; changed = true; }
    if (r._notifiedTomorrow=== undefined) { r._notifiedTomorrow = false; changed = true; }
  });

  if (changed && typeof saveDataSilent === 'function') saveDataSilent();
}

/* ── ReminderSystem — complete / restore / delete (exposed on window) ─────── */
window.ReminderSystem = {

  /**
   * Mark a reminder as completed (or advance recurring to next occurrence).
   * @param {number|string} id
   */
  complete(id) {
    const r = (window.app?.reminders || []).find(x => x.id === id);
    if (!r || r.status === 'completed') return;

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const today  = new Date();
    today.setHours(0, 0, 0, 0);

    // Visual feedback on card
    const card = document.querySelector(`[data-reminder-id="${id}"]`);
    if (card) {
      const btn = card.querySelector('.btn-complete');
      if (btn) {
        btn.textContent       = '✅';
        btn.style.background  = 'linear-gradient(135deg,rgba(0,230,118,0.3),rgba(0,212,255,0.2))';
        btn.style.borderColor = '#00e676';
        btn.style.color       = '#00e676';
        btn.style.transform   = 'scale(1.2)';
      }
      card.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s';
      card.style.transform  = 'scale(0.98)';
      card.style.boxShadow  = '0 0 24px rgba(0,230,118,0.4)';
    }

    if (r.interval && r.interval > 0) {
      // RECURRING → advance to next occurrence, stay active
      const base   = new Date(r.dueTs || today.getTime());
      base.setHours(0, 0, 0, 0);
      const anchor = today.getTime() >= base.getTime() ? today : base;
      const next   = new Date(anchor);
      next.setDate(next.getDate() + r.interval);

      r.dueTs              = next.getTime();
      r.days               = Math.round((next - today) / 86400000);
      r.urgent             = r.days <= 3;
      r._notifiedToday     = false;
      r._notifiedTomorrow  = false;
      r._notified3d        = false;

      const nextLabel = `${months[next.getMonth()]} ${next.getDate()}`;
      if (r.sub) {
        r.sub = r.sub.replace(/Next: \w+ \d+/, `Next: ${nextLabel}`);
      } else {
        r.sub = `Every ${r.interval} day${r.interval > 1 ? 's' : ''} • Next: ${nextLabel}`;
      }

      if (typeof saveDataSilent === 'function') saveDataSilent();
      if (typeof showToast === 'function') showToast(`✅ Done! Next: ${nextLabel} 🔁`);

      setTimeout(() => {
        if (card) { card.style.transform = ''; card.style.boxShadow = ''; }
        if (typeof recalcReminderDays === 'function')        recalcReminderDays();
        if (typeof sortReminders === 'function')             sortReminders();
        if (typeof renderReminders === 'function')           renderReminders();
        if (typeof updateCalendarReminderDots === 'function') updateCalendarReminderDots();
        if (typeof renderHome === 'function')                renderHome();
      }, 600);

    } else {
      // NON-RECURRING → mark completed
      r.status      = 'completed';
      r.completedAt = Date.now();
      if (typeof saveDataSilent === 'function') saveDataSilent();
      if (typeof showToast === 'function') showToast('✅ Marked as completed!');

      setTimeout(() => {
        if (card) { card.style.transform = ''; card.style.boxShadow = ''; }
        if (typeof sortReminders === 'function')             sortReminders();
        if (typeof renderReminders === 'function')           renderReminders();
        if (typeof updateCalendarReminderDots === 'function') updateCalendarReminderDots();
        if (typeof renderHome === 'function')                renderHome();
      }, 600);
    }
  },

  /**
   * Restore a completed/missed reminder back to active.
   * @param {number|string} id
   */
  restore(id) {
    const r = (window.app?.reminders || []).find(x => x.id === id);
    if (!r) return;

    r.status      = 'active';
    r.completedAt = null;
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    const due     = new Date(r.dueTs || Date.now());
    r.days        = Math.round((due - today) / 86400000);
    r._notifiedToday    = false;
    r._notifiedTomorrow = false;

    if (typeof saveDataSilent === 'function') saveDataSilent();
    if (typeof showToast === 'function') showToast('↩️ Reminder restored!');
    if (typeof sortReminders === 'function')             sortReminders();
    if (typeof renderReminders === 'function')           renderReminders();
    if (typeof updateCalendarReminderDots === 'function') updateCalendarReminderDots();
  },

  /**
   * Permanently delete a reminder.
   * @param {number|string} id
   */
  delete(id) {
    if (!window.app) return;
    window.app.reminders = (window.app.reminders || []).filter(x => x.id !== id);
    if (typeof saveDataSilent === 'function') saveDataSilent();
    if (typeof showToast === 'function') showToast('🗑️ Deleted!');
    if (typeof renderReminders === 'function')           renderReminders();
    if (typeof updateCalendarReminderDots === 'function') updateCalendarReminderDots();
    if (typeof renderHome === 'function')                renderHome();
  }
};

/* ── Patch saveReminder to persist real dueTs ────────────────────────────── */
// Wrap the original saveReminder (defined in HTML) with real timestamp logic
(function patchSaveReminder() {
  const _orig = window.saveReminder;
  window.saveReminder = function () {
    // Sync date calculation fields first
    if (window.currentDateMode === 'lastdate' && typeof calcSmartDate === 'function')     calcSmartDate();
    else if (window.currentDateMode === 'days' && typeof calcFromDays === 'function')     calcFromDays();
    else if (typeof calcFromTarget === 'function')                                        calcFromTarget();

    const titleEl = document.getElementById('r-title');
    const title   = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      if (typeof showToast === 'function') showToast('Please enter a title');
      return;
    }

    const editId  = document.getElementById('reminder-edit-id')?.value || '';
    const daysVal = parseInt(document.getElementById('r-days')?.value) || 0;

    const due = new Date();
    due.setHours(0, 0, 0, 0);
    due.setDate(due.getDate() + daysVal);

    const obj = {
      icon:              document.getElementById('r-icon')?.value     || '🔔',
      title,
      sub:               document.getElementById('r-sub')?.value      || '',
      days:              daysVal,
      dueTs:             due.getTime(),
      cat:               document.getElementById('r-cat')?.value      || 'other',
      color:             document.getElementById('r-color')?.value    || '#00d4ff',
      urgent:            daysVal <= 3,
      lastDate:          document.getElementById('r-lastdate')?.value || '',
      interval:          parseInt(document.getElementById('r-interval')?.value) || 0,
      status:            'active',
      _notifiedToday:    false,
      _notifiedTomorrow: false,
      _notified3d:       false,
    };

    if (!window.app.reminders) window.app.reminders = [];

    if (editId) {
      const idx = window.app.reminders.findIndex(x => x.id == editId);
      if (idx >= 0) {
        obj.status = window.app.reminders[idx].status === 'completed'
          ? 'active'
          : (window.app.reminders[idx].status || 'active');
        window.app.reminders[idx] = { ...window.app.reminders[idx], ...obj };
      }
    } else {
      obj.id = (typeof nextId === 'function') ? nextId() : Date.now();
      window.app.reminders.push(obj);
    }

    if (typeof sortReminders === 'function')             sortReminders();
    if (typeof saveDataSilent === 'function')            saveDataSilent();
    if (typeof showToast === 'function')                 showToast('✅ Reminder saved!');

    // Optional Firebase sync
    if (window.firebaseUser && typeof fbSaveReminder === 'function') {
      try { fbSaveReminder(obj); } catch (e) {}
    }

    if (typeof closeModal === 'function')                closeModal('reminder-modal');
    if (typeof renderReminders === 'function')           renderReminders();
    if (typeof updateCalendarReminderDots === 'function') updateCalendarReminderDots();
    if (typeof renderHome === 'function')                renderHome();
  };
})();

/* ── Snooze dialog helper ────────────────────────────────────────────────── */
function openSnooze(id) {
  const r = (window.app?.reminders || []).find(x => x.id === id);
  if (!r) return;

  const days  = parseInt(prompt('Snooze by how many days?', '3') || '0', 10);
  if (!days || days < 1) { if (typeof showToast === 'function') showToast('Snooze cancelled'); return; }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next  = new Date(today);
  next.setDate(next.getDate() + days);

  r.status             = 'active';
  r.dueTs              = next.getTime();
  r.days               = days;
  r.urgent             = days <= 3;
  r._notifiedToday     = false;
  r._notifiedTomorrow  = false;
  r._notified3d        = false;

  if (typeof saveDataSilent === 'function') saveDataSilent();
  if (typeof showToast === 'function') showToast(`😴 Snoozed ${days} day${days > 1 ? 's' : ''}!`);
  if (typeof sortReminders === 'function') sortReminders();
  if (typeof renderReminders === 'function') renderReminders();
  if (typeof updateCalendarReminderDots === 'function') updateCalendarReminderDots();
}

/* ── Expose openSnooze globally ─────────────────────────────────────────── */
window.openSnooze = openSnooze;
