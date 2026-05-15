// ══════════════════════════════════════════
//  LifeSync V2.1 — reminder-system.js
//  Reminder Engine: Complete, Missed, Snooze, Repeat, Tick
// ══════════════════════════════════════════

class ReminderSystem {
  constructor() {
    this.CHECK_INTERVAL_MS = 60 * 1000; // check every minute
    this._timer            = null;
    this._missedThreshold  = 0; // days <= 0 = missed
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  start() {
    this._checkAll();
    this._timer = setInterval(() => this._checkAll(), this.CHECK_INTERVAL_MS);
    console.log('✓ ReminderSystem started');
  }

  stop() {
    clearInterval(this._timer);
  }

  // ── Core check loop ───────────────────────────────────────────────────────
  _checkAll() {
    if (!window.app) return;
    const reminders = window.app.reminders || [];
    const now = new Date();

    reminders.forEach(r => {
      if (r.status === 'completed') return;

      // Auto-detect missed: days <= 0 and not already marked
      if (r.days <= this._missedThreshold && r.status !== 'missed' && r.status !== 'completed') {
        this._markMissed(r);
      }

      // Upcoming alerts: 1 day or less
      if (r.days === 1 && !r._notifiedTomorrow) {
        r._notifiedTomorrow = true;
        window.LifeSyncNotifications?.send(r.title, '⏰ Due TOMORROW!', { urgency: 'normal', tag: 'remind-' + r.id });
      }
      if (r.days === 0 && !r._notifiedToday) {
        r._notifiedToday = true;
        window.LifeSyncNotifications?.send(r.title, '⚡ Due TODAY!', { urgency: 'urgent', tag: 'remind-today-' + r.id });
        window.LifeSyncNotifications?.vibrateUrgent();
      }
    });

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.updateNotifBadge === 'function') window.updateNotifBadge();
  }

  // ── Mark completed ─────────────────────────────────────────────────────────
  complete(id) {
    const r = this._find(id);
    if (!r) return;

    if (r.status === 'completed') {
      window.showToast?.('Already completed ✓');
      return;
    }

    r.status       = 'completed';
    r.completedAt  = new Date().toISOString();
    r.completedDay = new Date().toDateString();
    r.urgent       = false;

    // Move to completed log
    if (!window.app.completedReminders) window.app.completedReminders = [];
    window.app.completedReminders.unshift({ ...r });
    if (window.app.completedReminders.length > 100) window.app.completedReminders.pop();

    // Play success sound & vibrate
    window.LifeSyncNotifications?.playSound('complete');
    window.LifeSyncNotifications?.vibrateSuccess();

    window.saveData?.();
    window.showToast?.(`✅ "${r.title}" marked complete!`);

    // Fire UI tick animation
    this._tickAnimation(id);

    // Handle repeat: if reminder has an interval, schedule next occurrence
    if (r.interval && r.interval > 0) {
      this._scheduleRepeat(r);
    }

    this._renderAll();
  }

  // ── Mark missed ────────────────────────────────────────────────────────────
  _markMissed(r) {
    r.status    = 'missed';
    r.missedAt  = new Date().toISOString();

    if (!window.app.missedReminders) window.app.missedReminders = [];
    window.app.missedReminders.unshift({ ...r });
    if (window.app.missedReminders.length > 50) window.app.missedReminders.pop();

    window.LifeSyncNotifications?.send(
      r.title, '❌ Missed reminder — tap to reschedule',
      { urgency: 'urgent', sound: true, vibrate: true, tag: 'missed-' + r.id }
    );
    window.LifeSyncNotifications?.vibrateMissed();
  }

  // ── Snooze ─────────────────────────────────────────────────────────────────
  snooze(id, days = 1) {
    const r = this._find(id);
    if (!r) return;

    r.days       += days;
    r.status      = 'active';
    r.urgent      = r.days <= 3;
    r._notifiedTomorrow = false;
    r._notifiedToday    = false;

    if (!window.app.snoozeLog) window.app.snoozeLog = [];
    window.app.snoozeLog.push({
      id:      r.id,
      title:   r.title,
      snoozed: new Date().toISOString(),
      days,
    });

    window.LifeSyncNotifications?.playSound('snooze');
    window.LifeSyncNotifications?.vibrate([60, 40, 60]);

    window.saveData?.();
    window.showToast?.(`😴 Snoozed ${days} day${days > 1 ? 's' : ''}!`);
    this._renderAll();
  }

  // ── Repeat scheduling ───────────────────────────────────────────────────────
  _scheduleRepeat(r) {
    const newReminder = {
      ...r,
      id:      (window.nextId || (() => Date.now()))(),
      days:    r.interval,
      status:  'active',
      urgent:  r.interval <= 3,
      completedAt: undefined,
      completedDay: undefined,
      missedAt: undefined,
      _notifiedToday:    false,
      _notifiedTomorrow: false,
    };
    delete newReminder.completedAt;
    delete newReminder.completedDay;

    if (!window.app.reminders) window.app.reminders = [];
    window.app.reminders.push(newReminder);

    window.LifeSyncNotifications?.send(
      r.title, `🔁 Repeated in ${r.interval} day${r.interval > 1 ? 's' : ''}`,
      { urgency: 'low', sound: false }
    );
  }

  // ── Reschedule a missed reminder ───────────────────────────────────────────
  reschedule(id, newDays) {
    const r = this._find(id);
    if (!r) return;
    r.days   = parseInt(newDays) || 1;
    r.status = 'active';
    r.urgent = r.days <= 3;
    r.missedAt = undefined;
    r._notifiedToday    = false;
    r._notifiedTomorrow = false;

    window.saveData?.();
    window.showToast?.(`📅 Rescheduled for ${newDays} day${newDays > 1 ? 's' : ''}!`);
    this._renderAll();
  }

  // ── Restore (un-complete) ──────────────────────────────────────────────────
  restore(id) {
    const r = this._find(id);
    if (!r) return;
    r.status = 'active';
    r.completedAt  = undefined;
    r.completedDay = undefined;
    r.urgent = r.days <= 3;
    window.saveData?.();
    window.showToast?.('↩️ Reminder restored');
    this._renderAll();
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  delete(id) {
    if (!window.app) return;
    window.app.reminders = (window.app.reminders || []).filter(r => r.id !== id);
    window.saveData?.();
    this._renderAll();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  _find(id) {
    return (window.app?.reminders || []).find(r => r.id === id);
  }

  _renderAll() {
    if (typeof window.renderReminders  === 'function') window.renderReminders();
    if (typeof window.renderHome       === 'function') window.renderHome();
    if (typeof window.renderNotifications === 'function') window.renderNotifications();
  }

  _tickAnimation(id) {
    // Find card by data-id and play tick
    const card = document.querySelector(`[data-reminder-id="${id}"]`);
    if (!card) return;

    const tick = document.createElement('div');
    tick.className = 'ls-tick-anim';
    tick.textContent = '✓';
    tick.style.cssText = `
      position:absolute; top:50%; left:50%;
      transform:translate(-50%,-50%) scale(0);
      font-size:48px; color:#00e676; font-weight:900;
      pointer-events:none; z-index:99;
      animation: lsTickPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;
    `;
    card.style.position = 'relative';
    card.appendChild(tick);

    // Flash card green
    card.style.transition = 'box-shadow 0.2s, border-color 0.2s';
    card.style.boxShadow  = '0 0 30px rgba(0,230,118,0.6)';
    card.style.borderColor = 'rgba(0,230,118,0.8)';

    setTimeout(() => {
      card.style.boxShadow   = '';
      card.style.borderColor = '';
      tick.remove();
    }, 700);
  }

  // ── Status counts for badge/briefing ──────────────────────────────────────
  getCounts() {
    const reminders  = window.app?.reminders || [];
    const active     = reminders.filter(r => !r.status || r.status === 'active').length;
    const completed  = (window.app?.completedReminders || []).length;
    const missed     = (window.app?.missedReminders     || []).length;
    const urgent     = reminders.filter(r => r.days <= 3 && r.status !== 'completed' && r.status !== 'missed').length;
    return { active, completed, missed, urgent };
  }
}

// ── CSS for tick animation (injected once) ──────────────────────────────────
function injectTickCSS() {
  if (document.getElementById('ls-tick-style')) return;
  const style = document.createElement('style');
  style.id    = 'ls-tick-style';
  style.textContent = `
    @keyframes lsTickPop {
      0%   { transform: translate(-50%,-50%) scale(0); opacity:0; }
      60%  { transform: translate(-50%,-50%) scale(1.3); opacity:1; }
      100% { transform: translate(-50%,-50%) scale(1);   opacity:0; }
    }
    .remind-card-completed {
      opacity: 0.55;
      text-decoration: line-through;
    }
    .remind-card-missed {
      border-color: rgba(255,45,120,0.5) !important;
      box-shadow: 0 0 18px rgba(255,45,120,0.25) !important;
    }
    .remind-status-badge {
      display: inline-flex; align-items: center;
      padding: 2px 8px; border-radius: 99px;
      font-size: 9px; font-weight: 800; letter-spacing: 0.5px;
    }
    .remind-status-completed {
      background: rgba(0,230,118,0.15); border: 1px solid rgba(0,230,118,0.4);
      color: #00e676;
    }
    .remind-status-missed {
      background: rgba(255,45,120,0.15); border: 1px solid rgba(255,45,120,0.4);
      color: #ff2d78;
    }
    .remind-action-btn {
      padding: 4px 8px; border-radius: 9px; border: none;
      font-size: 10px; font-weight: 700; cursor: pointer;
      font-family: inherit; transition: transform 0.15s;
    }
    .remind-action-btn:active { transform: scale(0.88); }
    .btn-complete {
      background: rgba(0,230,118,0.15); border: 1px solid rgba(0,230,118,0.4); color: #00e676;
    }
    .btn-snooze {
      background: rgba(0,212,255,0.15); border: 1px solid rgba(0,212,255,0.4); color: #00d4ff;
    }
    .btn-restore {
      background: rgba(180,79,255,0.15); border: 1px solid rgba(180,79,255,0.4); color: #b44fff;
    }
  `;
  document.head.appendChild(style);
}

// ── Export singleton ─────────────────────────────────────────────────────────
injectTickCSS();
window.ReminderSystem = new ReminderSystem();
export default window.ReminderSystem;
