// ══════════════════════════════════════════
//  LifeSync V2.1 — app.js
//  Core App Bootstrap — glues all modules
// ══════════════════════════════════════════

// ── Module Imports ───────────────────────────────────────────────────────────
import Notifications from './notifications.js';
import ReminderSys   from './reminder-system.js';
import Settings      from './settings-manager.js';

// ── Boot sequence (runs after DOM is ready) ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // 1. Migrate data to V2.1 schema
  Settings.migrate();

  // 2. Sync notification sound/vibrate settings
  if (window.app?.settings) {
    Notifications.soundEnabled = window.app.settings.sound  !== false;
    Notifications.vibEnabled   = window.app.settings.vibrate !== false;
  }

  // 3. Start reminder engine (auto-detects missed, fires alerts)
  ReminderSys.start();

  // 4. Check for reminders due today/tomorrow on load
  _checkUrgentOnLoad();

  // 5. Patch reminder render to include V2.1 complete/missed/snooze UI
  _patchReminderRender();

  // 6. Patch notification page to show completed/missed tabs
  _patchNotificationPage();

  // 7. Register service worker v2.1
  _registerSW();

  // 8. Expose globals for inline onclick compatibility
  _exposeGlobals();

  console.log('✓ LifeSync V2.1 boot complete');
});

// ── On-load urgent check ──────────────────────────────────────────────────────
function _checkUrgentOnLoad() {
  try {
    const reminders = window.app?.reminders || [];
    reminders.forEach(r => {
      if (r.days <= 0 && r.status !== 'completed' && r.status !== 'missed') {
        Notifications.send(r.title, '⚡ Due today! Don\'t forget!', {
          urgency: 'urgent', tag: 'urgent-' + r.id
        });
      }
    });
    window.updateNotifBadge?.();
  } catch(e) { console.warn('Urgent check:', e.message); }
}

// ── Patch renderReminders to add V2.1 action buttons ─────────────────────────
function _patchReminderRender() {
  const _origRender = window.renderReminders;

  window.renderReminders = function() {
    // Call original first to build DOM structure
    if (_origRender) _origRender();

    // Then upgrade each reminder card with V2.1 features
    const list = document.getElementById('remind-list');
    if (!list) return;

    // Re-build with enhanced cards
    const app = window.app;
    if (!app) return;

    const filtered = app.reminderFilter === 'all'
      ? app.reminders
      : app.reminders.filter(r => r.cat === app.reminderFilter);

    if (filtered.length === 0) {
      list.innerHTML = `<div style="color:#666;text-align:center;padding:24px;font-size:13px;">No reminders in this category</div>`;
    } else {
      list.innerHTML = filtered.map(r => _buildReminderCard(r)).join('');
    }

    // Append completed & missed sections at bottom
    _appendCompletedSection(list);
    _appendMissedSection(list);
  };
}

function _buildReminderCard(r) {
  const REMINDER_CATS = window.REMINDER_CATS || [];
  const catObj  = REMINDER_CATS.find(c => c.key === r.cat) || { emoji:'📦', label:'Other', color:'#888' };
  const isComp  = r.status === 'completed';
  const isMissed= r.status === 'missed';
  const urgent  = r.days <= 3 && !isComp && !isMissed;

  const statusBadge = isComp
    ? `<span class="remind-status-badge remind-status-completed">✓ DONE</span>`
    : isMissed
    ? `<span class="remind-status-badge remind-status-missed">❌ MISSED</span>`
    : urgent
    ? `<div class="pulse" style="background:#ff2d78;"></div>`
    : '';

  const actions = isComp
    ? `<button class="remind-action-btn btn-restore" onclick="window.ReminderSystem.restore(${r.id})">↩️</button>
       <button class="btn-danger" style="padding:4px 8px;font-size:10px;" onclick="window.ReminderSystem.delete(${r.id})">🗑</button>`
    : isMissed
    ? `<button class="remind-action-btn btn-snooze" onclick="openSnooze(${r.id})">📅</button>
       <button class="btn-danger" style="padding:4px 8px;font-size:10px;" onclick="window.ReminderSystem.delete(${r.id})">🗑</button>`
    : `<button class="remind-action-btn btn-complete" onclick="window.ReminderSystem.complete(${r.id})">✓</button>
       <button class="remind-action-btn btn-snooze" onclick="openSnooze(${r.id})">😴</button>
       <button class="btn-sm" style="padding:4px 8px;font-size:10px;" onclick="editReminder(${r.id})">✏️</button>
       <button class="btn-danger" style="padding:4px 8px;font-size:10px;" onclick="window.ReminderSystem.delete(${r.id})">🗑</button>`;

  const cardClass = isComp ? 'remind-card-completed' : isMissed ? 'remind-card-missed' : '';

  return `
    <div class="card ${cardClass}" data-reminder-id="${r.id}" style="box-shadow:0 0 18px ${r.color}22;">
      <div class="remind-card">
        <div class="remind-icon" style="background:${r.color}18;border:1.5px solid ${r.color}44;">${r.icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:14px;font-weight:700;color:${isComp ? '#666' : '#fff'};${isComp ? 'text-decoration:line-through;' : ''}">${r.title}</span>
            ${statusBadge}
          </div>
          <div style="font-size:11px;color:#777;margin-top:2px;">${r.sub || ''}</div>
          <span style="font-size:10px;background:${r.color}18;color:${r.color};border-radius:6px;padding:2px 7px;margin-top:4px;display:inline-block;">${catObj.emoji} ${catObj.label}</span>
          ${r.interval ? `<span style="font-size:10px;background:rgba(180,79,255,0.12);color:#b44fff;border-radius:6px;padding:2px 7px;margin-top:4px;margin-left:4px;display:inline-block;">🔁 Every ${r.interval}d</span>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0;">
          ${!isComp && !isMissed ? `<div class="remind-days" style="color:${r.color};">${r.days}</div><div class="remind-dayslabel">days left</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;margin-left:4px;">
          ${actions}
        </div>
      </div>
    </div>`;
}

function _appendCompletedSection(list) {
  const completed = window.app?.completedReminders || [];
  if (completed.length === 0) return;

  const recentCompleted = completed.slice(0, 10);
  const section = document.createElement('div');
  section.style.marginTop = '16px';
  section.innerHTML = `
    <div style="font-size:12px;color:#00e676;font-weight:700;letter-spacing:1px;margin-bottom:10px;padding-left:4px;">
      ✅ COMPLETED (${completed.length})
    </div>
    ${recentCompleted.map(r => `
      <div class="card" style="margin-bottom:10px;opacity:0.65;border-color:rgba(0,230,118,0.2);">
        <div class="remind-card">
          <div class="remind-icon" style="background:#00e67618;border:1.5px solid #00e67644;">${r.icon}</div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:#666;text-decoration:line-through;">${r.title}</div>
            <div style="font-size:10px;color:#00e676;margin-top:2px;">✓ Completed ${r.completedAt ? new Date(r.completedAt).toLocaleDateString() : ''}</div>
          </div>
          <span class="remind-status-badge remind-status-completed">DONE</span>
        </div>
      </div>`).join('')}
    ${completed.length > 10 ? `<div style="color:#555;font-size:11px;text-align:center;">+${completed.length - 10} more completed</div>` : ''}
  `;
  list.appendChild(section);
}

function _appendMissedSection(list) {
  const missed = window.app?.missedReminders || [];
  if (missed.length === 0) return;

  const section = document.createElement('div');
  section.style.marginTop = '16px';
  section.innerHTML = `
    <div style="font-size:12px;color:#ff2d78;font-weight:700;letter-spacing:1px;margin-bottom:10px;padding-left:4px;">
      ❌ MISSED (${missed.length})
    </div>
    ${missed.slice(0, 10).map(r => `
      <div class="card" style="margin-bottom:10px;border-color:rgba(255,45,120,0.3);box-shadow:0 0 12px rgba(255,45,120,0.15);">
        <div class="remind-card">
          <div class="remind-icon" style="background:#ff2d7818;border:1.5px solid #ff2d7844;">${r.icon}</div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:#ccc;">${r.title}</div>
            <div style="font-size:10px;color:#ff2d78;margin-top:2px;">Missed ${r.missedAt ? new Date(r.missedAt).toLocaleDateString() : ''}</div>
          </div>
          <button class="remind-action-btn btn-snooze" onclick="openSnooze(${r.id})" style="margin-top:2px;">📅 Reschedule</button>
        </div>
      </div>`).join('')}
  `;
  list.appendChild(section);
}

// ── Patch notification page with tabs ────────────────────────────────────────
function _patchNotificationPage() {
  const _orig = window.renderNotifications;
  window.renderNotifications = function() {
    if (_orig) _orig();

    const counts = window.ReminderSystem?.getCounts() || {};

    // Update section labels with counts
    const ul = document.getElementById('upcoming-alerts-list');
    if (ul) {
      // Inject completed/missed mini-stats above log
      const statsRow = document.getElementById('notif-stats-row');
      if (!statsRow) {
        const row = document.createElement('div');
        row.id    = 'notif-stats-row';
        row.style.cssText = 'display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;';
        row.innerHTML = `
          <div style="flex:1;min-width:90px;background:rgba(0,230,118,0.08);border:1px solid rgba(0,230,118,0.25);border-radius:14px;padding:10px 12px;text-align:center;">
            <div style="font-size:22px;font-weight:900;color:#00e676;">${counts.completed || 0}</div>
            <div style="font-size:10px;color:#666;">Completed</div>
          </div>
          <div style="flex:1;min-width:90px;background:rgba(255,45,120,0.08);border:1px solid rgba(255,45,120,0.25);border-radius:14px;padding:10px 12px;text-align:center;">
            <div style="font-size:22px;font-weight:900;color:#ff2d78;">${counts.missed || 0}</div>
            <div style="font-size:10px;color:#666;">Missed</div>
          </div>
          <div style="flex:1;min-width:90px;background:rgba(255,184,0,0.08);border:1px solid rgba(255,184,0,0.25);border-radius:14px;padding:10px 12px;text-align:center;">
            <div style="font-size:22px;font-weight:900;color:#ffb300;">${counts.urgent || 0}</div>
            <div style="font-size:10px;color:#666;">Urgent</div>
          </div>`;
        ul.parentNode.insertBefore(row, ul);
      } else {
        statsRow.querySelector('div:nth-child(1) div').textContent = counts.completed || 0;
        statsRow.querySelector('div:nth-child(2) div').textContent = counts.missed    || 0;
        statsRow.querySelector('div:nth-child(3) div').textContent = counts.urgent    || 0;
      }
    }
  };
}

// ── Service Worker registration ───────────────────────────────────────────────
function _registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./service-worker.js', { scope: './' })
    .then(reg => {
      console.log('✓ SW v2.1 registered');
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            const popup = document.getElementById('pwa-update-popup');
            if (popup) popup.classList.add('show');
          }
        });
      });
    })
    .catch(e => console.warn('SW register:', e.message));
}

// ── Globals for inline HTML onclick compatibility ─────────────────────────────
function _exposeGlobals() {
  // Reminder actions
  window.completeReminder   = (id) => window.ReminderSystem?.complete(id);
  window.snoozeReminder     = (id, days) => window.ReminderSystem?.snooze(id, days);
  window.restoreReminder    = (id) => window.ReminderSystem?.restore(id);
  window.deleteReminder     = (id) => window.ReminderSystem?.delete(id);

  // Notification shortcuts
  window.playNotifSound     = (type) => Notifications.playSound(type);
  window.testVibrate        = () => Notifications.vibrateUrgent();

  // Settings shortcuts  
  window.exportBackup       = () => Settings.exportData();

  // Override doSnooze to use new system
  const _origDoSnooze = window.doSnooze;
  window.doSnooze = function(days) {
    const id = parseInt(document.getElementById('snooze-reminder-id')?.value);
    if (id) {
      window.ReminderSystem?.snooze(id, days);
      window.closeModal?.('snooze-modal');
    } else if (_origDoSnooze) {
      _origDoSnooze(days);
    }
  };
}

export { Notifications, ReminderSys, Settings };
