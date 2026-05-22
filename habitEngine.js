// ══════════════════════════════════════════════════════════════════════════════
// habitEngine.js — LifeSync Premium
// Full Habit Tracker engine: CRUD, toggle complete, daily reset,
// streak recalculation, rendering
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

/* ── Utility ─────────────────────────────────────────────────────────────── */
function habitTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ── Toggle habit done/undone + live streak recalc ───────────────────────── */
window.toggleHabit = function (id) {
  const h = (window.app?.habits || []).find(x => x.id === id);
  if (!h) return;
  if (!h.history) h.history = {};

  const wasCompleted = h.done >= h.goal;
  const today        = habitTodayStr();

  if (wasCompleted) {
    // Undo: remove today from history
    h.done          = 0;
    h.history[today] = false;
  } else {
    // Complete: save today as done in history
    h.done           = h.goal;
    h.history[today] = true;

    // Recalculate streak live (consecutive days ending today)
    let streak = 0;
    let check  = new Date(today + 'T00:00:00');
    while (true) {
      const k = `${check.getFullYear()}-${String(check.getMonth()+1).padStart(2,'0')}-${String(check.getDate()).padStart(2,'0')}`;
      if (h.history[k] === true) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }
    h.streak = streak;

    if (typeof showToast === 'function') {
      showToast(`🔥 ${h.name} done! ${streak} day streak!`);
    }
  }

  if (typeof saveDataSilent === 'function') saveDataSilent();
  if (typeof renderHabits === 'function')  renderHabits();
};

/* ── Save (add or edit) a habit ──────────────────────────────────────────── */
window.saveHabit = function () {
  const nameEl = document.getElementById('h-name');
  const name   = nameEl ? nameEl.value.trim() : '';
  if (!name) {
    if (typeof showToast === 'function') showToast('Please enter habit name');
    return;
  }

  const editId = document.getElementById('habit-edit-id')?.value || '';
  const obj = {
    name,
    icon:  document.getElementById('h-icon')?.value  || '⭐',
    goal:  parseInt(document.getElementById('h-goal')?.value) || 1,
    color: document.getElementById('h-color')?.value || '#00d4ff',
  };

  if (!window.app.habits) window.app.habits = [];

  if (editId) {
    const idx = window.app.habits.findIndex(x => x.id == editId);
    if (idx >= 0) window.app.habits[idx] = { ...window.app.habits[idx], ...obj };
  } else {
    obj.id            = (typeof nextId === 'function') ? nextId() : Date.now();
    obj.streak        = 0;
    obj.done          = 0;
    obj.history       = {};
    obj.lastResetDate = habitTodayStr();
    window.app.habits.push(obj);
  }

  if (typeof saveDataSilent === 'function') saveDataSilent();
  if (typeof showToast === 'function')      showToast('✅ Habit saved!');
  if (typeof closeModal === 'function')     closeModal('habit-modal');
  if (typeof renderHabits === 'function')   renderHabits();
};

/* ── Edit a habit (pre-fill modal) ──────────────────────────────────────── */
function editHabit(id) {
  const h = (window.app?.habits || []).find(x => x.id === id);
  if (!h) return;

  const titleEl = document.getElementById('habit-modal-title');
  if (titleEl) titleEl.textContent = '✏️ Edit Habit';
  document.getElementById('habit-edit-id').value = id;
  document.getElementById('h-name').value  = h.name;
  document.getElementById('h-icon').value  = h.icon;
  document.getElementById('h-goal').value  = h.goal;
  document.getElementById('h-color').value = h.color;

  if (typeof openModal === 'function') openModal('habit-modal');
}
window.editHabit = editHabit;

/* ── Delete a habit ──────────────────────────────────────────────────────── */
window.deleteHabit = function (id) {
  if (!window.app) return;
  window.app.habits = (window.app.habits || []).filter(x => x.id !== id);
  if (typeof saveDataSilent === 'function') saveDataSilent();
  if (typeof showToast === 'function')      showToast('🗑️ Habit deleted!');
  if (typeof renderHabits === 'function')   renderHabits();
};

/* ── Render the habit tracker page ───────────────────────────────────────── */
window.renderHabits = function () {
  // Summary bar
  const summary = document.getElementById('habit-summary');
  if (summary) {
    const habits    = window.app?.habits || [];
    const done      = habits.filter(h => h.done >= h.goal).length;
    const total     = habits.length;
    const maxStreak = habits.reduce((m, h) => Math.max(m, h.streak || 0), 0);
    const comp      = total ? Math.round((done / total) * 100) : 0;

    summary.innerHTML = [
      [maxStreak,        'Best Streak',    '#00fff7'],
      [`${done}/${total}`,"Today's Habits", '#00d4ff'],
      [comp + '%',       'Completion',     '#b44fff']
    ].map(([v, l, c]) => `
      <div style="text-align:center;">
        <div style="font-size:24px;font-weight:900;color:${c};">${v}</div>
        <div style="font-size:10px;color:#666;margin-top:2px;">${l}</div>
      </div>`).join('');
  }

  // Habit list
  const list = document.getElementById('habits-list');
  if (!list) return;

  const habits = window.app?.habits || [];
  if (habits.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#555;font-size:13px;padding:24px 0;">No habits yet. Add your first habit! 🔥</div>';
    return;
  }

  list.innerHTML = habits.map(h => {
    const pct    = Math.min(100, ((h.done || 0) / h.goal) * 100);
    const isDone = (h.done || 0) >= h.goal;
    const last7  = Object.keys(h.history || {}).sort().slice(-7);
    const dots   = last7.map(k =>
      `<div style="width:8px;height:8px;border-radius:50%;background:${h.history[k] ? h.color : 'rgba(255,255,255,0.1)'};"></div>`
    ).join('');

    return `
      <div class="card" data-habit-id="${h.id}"
           style="box-shadow:0 0 18px ${h.color}22;cursor:pointer;transition:transform 0.2s;"
           onclick="toggleHabit(${h.id})">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:48px;height:48px;border-radius:16px;flex-shrink:0;
                      background:${h.color}18;border:1.5px solid ${isDone ? h.color : h.color+'44'};
                      display:flex;align-items:center;justify-content:center;font-size:22px;
                      transition:border-color 0.3s;">${h.icon}</div>
          <div style="flex:1;">
            <div style="color:${isDone ? h.color : '#fff'};font-weight:700;font-size:14px;transition:color 0.3s;">${h.name}</div>
            <div style="font-size:11px;color:#777;margin-top:2px;">🔥 ${h.streak || 0} day streak</div>
            <div style="margin-top:6px;height:4px;background:rgba(255,255,255,0.07);border-radius:99px;overflow:hidden;">
              <div style="height:100%;border-radius:99px;width:${pct}%;
                          background:linear-gradient(90deg,${h.color}88,${h.color});transition:width 0.4s ease;"></div>
            </div>
            ${last7.length > 0 ? `<div style="display:flex;gap:4px;margin-top:6px;align-items:center;">${dots}<span style="font-size:9px;color:#444;margin-left:4px;">7d</span></div>` : ''}
          </div>
          <div style="width:36px;height:36px;border-radius:12px;display:flex;align-items:center;
                      justify-content:center;font-size:18px;font-weight:900;flex-shrink:0;
                      background:${isDone ? `linear-gradient(135deg,${h.color},#b44fff)` : 'rgba(255,255,255,0.06)'};
                      border:${isDone ? 'none' : '1.5px solid rgba(255,255,255,0.12)'};
                      box-shadow:${isDone ? `0 0 14px ${h.color}88` : 'none'};
                      transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1);">
            ${isDone ? '✓' : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button class="btn-sm" style="padding:4px 8px;font-size:10px;"
                    onclick="event.stopPropagation();editHabit(${h.id})">✏️</button>
            <button class="btn-danger" style="padding:4px 8px;font-size:10px;"
                    onclick="event.stopPropagation();deleteHabit(${h.id})">🗑</button>
          </div>
        </div>
      </div>`;
  }).join('');
};
