/**
 * syncService.js
 * LifeSync Premium — Real Sync & Reminder System v3.0
 * Contains:
 *   - Real Notification System (browser + in-app)
 *   - Real Reminder System (date-based, auto-miss, complete, restore, snooze)
 *   - Habit Daily Reset & Streak Calculation
 *   - Midnight Reset Scheduler
 *   - Periodic background checks
 *   - Reminder data migration (demo → date-based)
 */

// ════════════════════════════════════════════════════════════════════════════
// 1. REAL NOTIFICATION SYSTEM
// ════════════════════════════════════════════════════════════════════════════
window.LSNotif = {
  permission: (typeof Notification !== 'undefined') ? Notification.permission : 'denied',

  async request() {
    if (typeof Notification === 'undefined') return false;
    if (this.permission === 'granted') return true;
    try {
      this.permission = await Notification.requestPermission();
    } catch (e) {
      this.permission = 'denied';
    }
    return this.permission === 'granted';
  },

  send(title, body, tag, icon) {
    // Always log to in-app notifications
    if (!app.notifications) app.notifications = [];
    const entry = {
      id:    nextId(),
      title,
      body,
      time:  fmtTime(nowMs()),
      date:  todayStr(),
      read:  false,
    };
    app.notifications.unshift(entry);
    if (app.notifications.length > 100) {
      app.notifications = app.notifications.slice(0, 100);
    }
    saveDataSilent();
    updateNotifBadge();

    // Browser push notification
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const n = new Notification('LifeSync: ' + title, {
          body,
          icon:      './icon-192.png',
          badge:     './icon-192.png',
          tag:       tag || ('ls-' + Date.now()),
          renotify:  true,
          vibrate:   [200, 100, 200],
        });
        n.onclick = function () { window.focus(); n.close(); };
      } catch (e) {}
    }

    // Device vibration
    if (navigator.vibrate) {
      try { navigator.vibrate([200, 100, 200]); } catch (e) {}
    }
  },
};

// Backward-compat wrapper
window.sendBrowserNotif = function (title, body) {
  window.LSNotif.send(title, body);
};

// Notification permission banner integration
window.requestNotifPermission = async function () {
  const granted = await window.LSNotif.request();
  const banner = document.getElementById('notif-permission-banner');
  if (banner) banner.style.display = 'none';
  if (granted) {
    showToast('🔔 Notifications enabled!');
    app.settings.notifs = true;
    saveDataSilent();
    checkReminderNotifications();
  } else {
    showToast('In-app alerts active ✓');
  }
  renderNotifications();
};

// ════════════════════════════════════════════════════════════════════════════
// 2. DATA MIGRATION (demo reminders → real date-based format)
// ════════════════════════════════════════════════════════════════════════════
function migrateReminders() {
  let changed = false;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  app.reminders.forEach(r => {
    // Assign real dueTs if missing
    if (!r.dueTs) {
      const daysLeft = typeof r.days === 'number' ? r.days : 0;
      const due = new Date(today);
      due.setDate(due.getDate() + daysLeft);
      r.dueTs = due.getTime();
      changed = true;
    }
    if (!r.status)                   { r.status            = 'active'; changed = true; }
    if (r._notifiedToday    === undefined) { r._notifiedToday    = false;  changed = true; }
    if (r._notifiedTomorrow === undefined) { r._notifiedTomorrow = false;  changed = true; }
  });

  // Ensure habit fields
  app.habits.forEach(h => {
    if (!h.history)       { h.history       = {};         changed = true; }
    if (!h.lastResetDate) { h.lastResetDate = todayStr(); changed = true; }
    if (h.streak === undefined) { h.streak = 0; changed = true; }
    if (h.done   === undefined) { h.done   = 0; changed = true; }
  });

  if (!app.habitLastReset) { app.habitLastReset = todayStr(); changed = true; }
  if (changed) saveDataSilent();
}

// ════════════════════════════════════════════════════════════════════════════
// 3. REMINDER DATE UTILITIES
// ════════════════════════════════════════════════════════════════════════════

/** Recalculate r.days for every active reminder from its real dueTs */
function recalcReminderDays() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  app.reminders.forEach(r => {
    if (!r.dueTs)               return;
    if (r.status === 'completed') return;
    const due = new Date(r.dueTs); due.setHours(0, 0, 0, 0);
    r.days   = Math.round((due - today) / 86400000);
    r.urgent = r.days <= 3 && r.days >= 0;
  });
}

/** Sort: active (nearest first) → missed (newest first) → completed (newest first) */
function sortReminders() {
  app.reminders.sort((a, b) => {
    const order = { active: 0, missed: 1, completed: 2 };
    const ao = order[a.status] ?? 0;
    const bo = order[b.status] ?? 0;
    if (ao !== bo) return ao - bo;
    if (a.status === 'active') return (a.days ?? 999) - (b.days ?? 999);
    return (b.dueTs || 0) - (a.dueTs || 0);
  });
}

/**
 * Auto-advance recurring reminders or move expired non-recurring ones to 'missed'
 */
function autoMoveExpired() {
  let changed = false;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today  = new Date(); today.setHours(0, 0, 0, 0);

  app.reminders.forEach(r => {
    if (r.status !== 'active')          return;
    if (typeof r.days !== 'number' || r.days >= 0) return;

    if (r.interval && r.interval > 0) {
      // Recurring — advance to next occurrence
      let next = new Date(r.dueTs || today.getTime()); next.setHours(0, 0, 0, 0);
      while (next <= today) next.setDate(next.getDate() + r.interval);
      r.dueTs              = next.getTime();
      r.days               = Math.round((next - today) / 86400000);
      r.urgent             = r.days <= 3;
      r._notifiedToday     = false;
      r._notifiedTomorrow  = false;
      r._notified3d        = false;
      const nextLabel = `${months[next.getMonth()]} ${next.getDate()}`;
      r.sub = r.sub
        ? r.sub.replace(/Next: \w+ \d+/, `Next: ${nextLabel}`)
        : `Every ${r.interval} day${r.interval > 1 ? 's' : ''} • Next: ${nextLabel}`;
      changed = true;
    } else {
      // Non-recurring — mark as missed
      r.status = 'missed';
      changed  = true;
      window.LSNotif.send('⚠️ Missed: ' + r.title, 'This reminder was not completed in time.');
    }
  });

  if (changed) saveDataSilent();
}

/** Send upcoming reminders notifications (today / tomorrow / 3-day) */
function checkReminderNotifications() {
  app.reminders.forEach(r => {
    if (r.status !== 'active') return;
    const d = r.days;
    if (d === 0 && !r._notifiedToday) {
      r._notifiedToday = true;
      window.LSNotif.send('⚡ Due TODAY: ' + r.icon + ' ' + r.title,
        r.sub || "Don't forget to complete this today!");
      saveDataSilent();
    }
    if (d === 1 && !r._notifiedTomorrow) {
      r._notifiedTomorrow = true;
      window.LSNotif.send('📅 Due Tomorrow: ' + r.icon + ' ' + r.title,
        r.sub || 'Prepare for tomorrow!');
      saveDataSilent();
    }
    if (d === 3 && !r._notified3d) {
      r._notified3d = true;
      window.LSNotif.send('🔔 3 Days Left: ' + r.icon + ' ' + r.title,
        'Coming up in 3 days — plan ahead!');
      saveDataSilent();
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 4. REAL REMINDER SYSTEM (window.ReminderSystem)
// ════════════════════════════════════════════════════════════════════════════
window.ReminderSystem = {
  complete(id) {
    const r = app.reminders.find(x => x.id === id);
    if (!r || r.status === 'completed') return;

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const today  = new Date(); today.setHours(0, 0, 0, 0);

    // Animate the card
    const card = document.querySelector(`[data-reminder-id="${id}"]`);
    if (card) {
      const btn = card.querySelector('.btn-complete');
      if (btn) {
        btn.textContent         = '✅';
        btn.style.background    = 'linear-gradient(135deg,rgba(0,230,118,0.3),rgba(0,212,255,0.2))';
        btn.style.borderColor   = '#00e676';
        btn.style.color         = '#00e676';
        btn.style.transform     = 'scale(1.2)';
      }
      card.style.transition  = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s';
      card.style.transform   = 'scale(0.98)';
      card.style.boxShadow   = '0 0 24px rgba(0,230,118,0.4)';
    }

    if (r.interval && r.interval > 0) {
      // Recurring — advance to next occurrence, stay active
      const anchor = today.getTime() >= (r.dueTs || 0) ? today : new Date(r.dueTs);
      const next   = new Date(anchor);
      next.setDate(next.getDate() + r.interval);
      r.dueTs             = next.getTime();
      r.days              = Math.round((next - today) / 86400000);
      r.urgent            = r.days <= 3;
      r._notifiedToday    = false;
      r._notifiedTomorrow = false;
      r._notified3d       = false;
      const nextLabel = `${months[next.getMonth()]} ${next.getDate()}`;
      r.sub = r.sub
        ? r.sub.replace(/Next: \w+ \d+/, `Next: ${nextLabel}`)
        : `Every ${r.interval} day${r.interval > 1 ? 's' : ''} • Next: ${nextLabel}`;
      saveDataSilent();
      showToast(`✅ Done! Next: ${nextLabel} 🔁`);
    } else {
      // Non-recurring — mark completed
      r.status      = 'completed';
      r.completedAt = nowMs();
      saveDataSilent();
      showToast('✅ Marked as completed!');
    }

    setTimeout(() => {
      if (card) { card.style.transform = ''; card.style.boxShadow = ''; }
      recalcReminderDays();
      sortReminders();
      renderReminders();
      updateCalendarReminderDots();
      renderHome();
    }, 600);
  },

  restore(id) {
    const r = app.reminders.find(x => x.id === id);
    if (!r) return;
    r.status         = 'active';
    r.completedAt    = null;
    const today      = new Date(); today.setHours(0, 0, 0, 0);
    const due        = new Date(r.dueTs || nowMs());
    r.days           = Math.round((due - today) / 86400000);
    r._notifiedToday    = false;
    r._notifiedTomorrow = false;
    saveDataSilent();
    showToast('↩️ Reminder restored!');
    sortReminders();
    renderReminders();
    updateCalendarReminderDots();
  },

  delete(id) {
    app.reminders = app.reminders.filter(x => x.id !== id);
    saveDataSilent();
    showToast('🗑️ Deleted!');
    renderReminders();
    updateCalendarReminderDots();
    renderHome();
  },
};

// ─── SAVE REMINDER (patched to store real dueTs) ──────────────────────────────
window.saveReminder = function () {
  if (typeof currentDateMode !== 'undefined') {
    if      (currentDateMode === 'lastdate') calcSmartDate();
    else if (currentDateMode === 'days')     calcFromDays();
    else                                     calcFromTarget();
  }

  const title = document.getElementById('r-title').value.trim();
  if (!title) { showToast('Please enter a title'); return; }

  const editId  = document.getElementById('reminder-edit-id').value;
  const daysVal = parseInt(document.getElementById('r-days').value) || 0;

  const due = new Date(); due.setHours(0, 0, 0, 0);
  due.setDate(due.getDate() + daysVal);

  const obj = {
    icon:              document.getElementById('r-icon').value      || '🔔',
    title,
    sub:               document.getElementById('r-sub').value       || '',
    days:              daysVal,
    dueTs:             due.getTime(),
    cat:               document.getElementById('r-cat').value       || 'other',
    color:             document.getElementById('r-color').value     || '#00d4ff',
    urgent:            daysVal <= 3,
    lastDate:          document.getElementById('r-lastdate')?.value || '',
    interval:          parseInt(document.getElementById('r-interval')?.value) || 0,
    status:            'active',
    _notifiedToday:    false,
    _notifiedTomorrow: false,
    _notified3d:       false,
  };

  if (editId) {
    const idx = app.reminders.findIndex(x => x.id == editId);
    if (idx >= 0) {
      obj.status       = app.reminders[idx].status === 'completed' ? 'active' : (app.reminders[idx].status || 'active');
      app.reminders[idx] = { ...app.reminders[idx], ...obj };
    }
  } else {
    obj.id = nextId();
    app.reminders.push(obj);
  }

  sortReminders();
  saveDataSilent();
  showToast('✅ Reminder saved!');
  closeModal('reminder-modal');
  renderReminders();
  updateCalendarReminderDots();
  renderHome();
};

// ─── SNOOZE ───────────────────────────────────────────────────────────────────
function openSnooze(id) {
  const r = app.reminders.find(x => x.id === id);
  if (!r) return;
  document.getElementById('snooze-reminder-id').value   = id;
  document.getElementById('snooze-reminder-title').textContent = r.title;
  openModal('snooze-modal');
}

window.doSnooze = function (days) {
  const id = parseInt(document.getElementById('snooze-reminder-id').value);
  const r  = app.reminders.find(x => x.id === id);
  if (!r) return;
  const newDue = new Date(r.dueTs || nowMs());
  newDue.setDate(newDue.getDate() + days);
  r.dueTs              = newDue.getTime();
  r.days               = days;
  r.status             = 'active';
  r.urgent             = days <= 3;
  r._notifiedToday     = false;
  r._notifiedTomorrow  = false;
  r._notified3d        = false;
  saveDataSilent();
  closeModal('snooze-modal');
  showToast(`😴 Snoozed ${days} day${days > 1 ? 's' : ''}!`);
  sortReminders();
  renderReminders();
  updateCalendarReminderDots();
};

// Quick repeat preset (called from modal buttons)
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
      lastDate.value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    }
  }
  if (typeof calcSmartDate === 'function') calcSmartDate();
}

// ════════════════════════════════════════════════════════════════════════════
// 5. HABIT DAILY RESET & STREAK CALCULATION
// ════════════════════════════════════════════════════════════════════════════
function habitDailyReset() {
  const today = todayStr();
  if (app.habitLastReset === today) return; // Already reset today

  app.habits.forEach(h => {
    if (!h.history) h.history = {};

    const lastReset  = h.lastResetDate || app.habitLastReset || today;
    const lastDate   = new Date(lastReset + 'T00:00:00');
    const todayDate  = new Date(today    + 'T00:00:00');

    // Mark each day between lastReset and today in history
    let cursor = new Date(lastDate);
    while (cursor < todayDate) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (!(key in h.history)) {
        const isYesterday = (todayDate - cursor) <= 86400000;
        h.history[key]    = isYesterday ? (h.done >= h.goal) : false;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Recalculate streak from consecutive completed days ending yesterday
    let streak = 0;
    let check  = new Date(todayDate);
    check.setDate(check.getDate() - 1);
    while (true) {
      const k = `${check.getFullYear()}-${String(check.getMonth() + 1).padStart(2, '0')}-${String(check.getDate()).padStart(2, '0')}`;
      if (h.history[k] === true) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }
    h.streak        = streak;
    h.done          = 0;
    h.lastResetDate = today;
  });

  app.habitLastReset = today;
  saveDataSilent();
}

// ════════════════════════════════════════════════════════════════════════════
// 6. SCHEDULED JOBS
// ════════════════════════════════════════════════════════════════════════════

/** Midnight reset — habits + reminder day advance */
function scheduleMidnightReset() {
  const now      = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);

  setTimeout(() => {
    habitDailyReset();
    recalcReminderDays();
    autoMoveExpired();

    app.reminders.forEach(r => {
      r._notifiedToday    = false;
      r._notifiedTomorrow = false;
      r._notified3d       = false;
    });

    const todayDue = app.reminders.filter(r => r.status === 'active' && r.days === 0);
    if (todayDue.length > 0) {
      window.LSNotif.send(
        `📅 ${todayDue.length} reminder${todayDue.length > 1 ? 's' : ''} due TODAY`,
        todayDue.map(r => r.icon + ' ' + r.title).join(', ')
      );
    }

    sortReminders();
    saveDataSilent();

    if (currentPage === 'reminders') renderReminders();
    if (currentPage === 'habits')    renderHabits();
    if (currentPage === 'home')      renderHome();

    scheduleMidnightReset(); // Reschedule for next midnight
  }, midnight - now);
}

/** 8 AM daily summary notification */
function schedule8AMNotification() {
  const now    = new Date();
  const next8  = new Date(now);
  next8.setHours(8, 0, 0, 0);
  if (next8 <= now) next8.setDate(next8.getDate() + 1);

  setTimeout(() => {
    recalcReminderDays();
    const todayDue = app.reminders.filter(r => r.status === 'active' && r.days === 0);
    const urgent   = app.reminders.filter(r => r.status === 'active' && r.days <= 3 && r.days >= 0);
    if (todayDue.length > 0) {
      window.LSNotif.send(
        `⚡ Good morning! ${todayDue.length} reminder${todayDue.length > 1 ? 's' : ''} due today`,
        todayDue.map(r => r.icon + ' ' + r.title).join(', ')
      );
    } else if (urgent.length > 0) {
      window.LSNotif.send(
        `🔔 Good morning! ${urgent.length} upcoming reminder${urgent.length > 1 ? 's' : ''}`,
        urgent.map(r => `${r.icon} ${r.title} (${r.days}d)`).join(', ')
      );
    }
    schedule8AMNotification();
  }, next8 - now);
}

/** Every-minute periodic check */
function periodicCheck() {
  recalcReminderDays();
  autoMoveExpired();
  checkReminderNotifications();
  updateNotifBadge();
  if (currentPage === 'reminders') renderReminders();
  if (currentPage === 'home')      renderHome();
}
setInterval(periodicCheck, 60000);

// ════════════════════════════════════════════════════════════════════════════
// 7. BOOT — run once on page load
// ════════════════════════════════════════════════════════════════════════════
(function bootSyncService() {
  migrateReminders();
  habitDailyReset();
  recalcReminderDays();
  autoMoveExpired();
  sortReminders();
  checkReminderNotifications();
  updateCalendarReminderDots();
  updateNotifBadge();
  scheduleMidnightReset();
  schedule8AMNotification();
})();
