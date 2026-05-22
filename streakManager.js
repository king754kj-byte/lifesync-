// ══════════════════════════════════════════════════════════════════════════════
// streakManager.js — LifeSync Premium
// Streak Manager: daily midnight reset, multi-day gap handling,
// streak recalculation from history, home badge + dot updates
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

/* ── Utility ─────────────────────────────────────────────────────────────── */
function streakTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * Calculate the consecutive streak count ending at (and including) today,
 * reading backwards through a history object { "YYYY-MM-DD": boolean }.
 * @param {Object} history  - { "YYYY-MM-DD": true|false }
 * @param {boolean} todayDone - Whether today is already done (live, before reset)
 * @returns {number} streak count
 */
function calcStreakFromHistory(history, todayDone) {
  const today = streakTodayStr();
  let streak  = todayDone ? 1 : 0;
  let check   = new Date(today + 'T00:00:00');
  // Start from yesterday if today already counted
  if (todayDone) check.setDate(check.getDate() - 1);

  while (true) {
    const k = `${check.getFullYear()}-${String(check.getMonth()+1).padStart(2,'0')}-${String(check.getDate()).padStart(2,'0')}`;
    if (history[k] === true) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
window.calcStreakFromHistory = calcStreakFromHistory;

/* ── Daily reset at midnight (or when app opens after midnight) ──────────── */
/**
 * Checks if a reset is needed (i.e. app.habitLastReset !== today),
 * walks through missed days, recalculates streaks, resets today's progress.
 * Safe to call multiple times — idempotent within the same calendar day.
 */
function habitDailyReset() {
  if (!window.app) return;
  const today = streakTodayStr();
  if (window.app.habitLastReset === today) return; // Already reset today

  (window.app.habits || []).forEach(h => {
    if (!h.history) h.history = {};

    const lastReset  = h.lastResetDate || window.app.habitLastReset || today;
    const lastDate   = new Date(lastReset + 'T00:00:00');
    const todayDate  = new Date(today    + 'T00:00:00');

    // Walk through every day from lastReset up to (but not including) today
    let cursor = new Date(lastDate);
    while (cursor < todayDate) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`;
      if (!(key in h.history)) {
        // If this is yesterday: use the done count from before reset
        const isYesterday = (todayDate - cursor) <= 86400000;
        h.history[key]    = isYesterday ? ((h.done || 0) >= h.goal) : false;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Recalculate streak from consecutive history days (yesterday backwards)
    let streak    = 0;
    let checkDate = new Date(todayDate);
    checkDate.setDate(checkDate.getDate() - 1); // start from yesterday
    while (true) {
      const k = `${checkDate.getFullYear()}-${String(checkDate.getMonth()+1).padStart(2,'0')}-${String(checkDate.getDate()).padStart(2,'0')}`;
      if (h.history[k] === true) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    h.streak        = streak;
    h.done          = 0; // Reset today's progress
    h.lastResetDate = today;
  });

  window.app.habitLastReset = today;
  if (typeof saveDataSilent === 'function') saveDataSilent();
}
window.habitDailyReset = habitDailyReset;

/* ── Ensure habit fields exist (run after migrateReminders) ─────────────── */
function initHabitFields() {
  if (!window.app) return;
  let changed = false;
  const today = streakTodayStr();

  (window.app.habits || []).forEach(h => {
    if (!h.history)        { h.history = {};    changed = true; }
    if (!h.lastResetDate)  { h.lastResetDate = today; changed = true; }
    if (h.streak  === undefined) { h.streak  = 0; changed = true; }
    if (h.done    === undefined) { h.done    = 0; changed = true; }
  });

  if (!window.app.habitLastReset) { window.app.habitLastReset = today; changed = true; }
  if (changed && typeof saveDataSilent === 'function') saveDataSilent();
}
window.initHabitFields = initHabitFields;

/* ── Update home screen streak badge + dot row ────────────────────────────── */
function updateHomeStreakUI() {
  if (!window.app) return;
  const habits = window.app.habits || [];

  // Streak badge (best streak)
  const maxStreak = habits.reduce((m, h) => Math.max(m, h.streak || 0), 0);
  const badge = document.getElementById('streak-badge');
  if (badge) badge.textContent = `${maxStreak} days`;

  // Home habit dots (7 most recent days across all habits)
  const dotsEl = document.getElementById('home-habit-dots');
  if (!dotsEl) return;

  const today     = new Date();
  const days7     = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days7.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }

  const dayLabels = ['S','M','T','W','T','F','S'];

  dotsEl.innerHTML = days7.map((dateStr, i) => {
    const dayDate = new Date(dateStr + 'T00:00:00');
    const label   = dayLabels[dayDate.getDay()];

    // Count how many habits were completed on this day
    const total = habits.length;
    const done  = habits.filter(h => {
      if (!h.history) return false;
      const isToday = dateStr === streakTodayStr();
      return isToday ? (h.done || 0) >= h.goal : h.history[dateStr] === true;
    }).length;

    const isToday = i === 6;
    const allDone = total > 0 && done === total;
    const someDone = done > 0 && done < total;
    const noneDone = done === 0;

    const dotColor = allDone ? '#00e676' : someDone ? '#ffb300' : 'rgba(255,255,255,0.08)';
    const dotBorder = isToday ? '1.5px solid rgba(0,212,255,0.5)' : '1px solid rgba(255,255,255,0.08)';

    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">
        <div style="width:28px;height:28px;border-radius:8px;background:${dotColor};
                    border:${dotBorder};display:flex;align-items:center;justify-content:center;
                    font-size:${allDone ? '14' : '10'}px;color:${allDone ? '#000' : '#444'};">
          ${allDone ? '✓' : (total > 0 ? done : '')}
        </div>
        <span style="font-size:8px;color:${isToday ? '#00d4ff' : '#444'};font-weight:${isToday ? '800' : '600'};">${label}</span>
      </div>`;
  }).join('');
}
window.updateHomeStreakUI = updateHomeStreakUI;

/* ── Get overall streak stats for home/stats page ─────────────────────────── */
function getStreakStats() {
  const habits = window.app?.habits || [];
  return {
    bestStreak:   habits.reduce((m, h) => Math.max(m, h.streak || 0), 0),
    totalHabits:  habits.length,
    completedToday: habits.filter(h => (h.done || 0) >= h.goal).length,
    completionPct:  habits.length
      ? Math.round((habits.filter(h => (h.done || 0) >= h.goal).length / habits.length) * 100)
      : 0
  };
}
window.getStreakStats = getStreakStats;

/* ── Auto-run: reset on app boot if day has changed ─────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initHabitFields();
  habitDailyReset();
  updateHomeStreakUI();

  // Check every 5 minutes if midnight has passed
  setInterval(() => {
    habitDailyReset();
    updateHomeStreakUI();
  }, 5 * 60 * 1000);
});
