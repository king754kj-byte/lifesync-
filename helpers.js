/**
 * helpers.js
 * LifeSync Premium — Utility & Helper Functions
 * Contains: date utils, toast, modal controls, navigation, data persistence
 */

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────

/** Returns today's date string in YYYY-MM-DD format */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns current timestamp in ms */
function nowMs() { return Date.now(); }

/** Formats a timestamp (ms) to "Mon D, YYYY" string */
function fmtDate(ms) {
  const d = new Date(ms);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Formats a timestamp (ms) to "HH:MM AM/PM" string */
function fmtTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── DATA PERSISTENCE ─────────────────────────────────────────────────────────

/** Load app data from localStorage, merging with defaults */
function loadData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return Object.assign({}, defaultData, saved);
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(defaultData));
}

/** Save app data and show a toast (unless silent=true) */
function saveData(silent) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(app)); } catch (e) {}
  if (!silent) showToast('Saved! ✓');
}

/** Save app data without showing a toast */
function saveDataSilent() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(app)); } catch (e) {}
}

/** Increment and return the next unique ID */
function nextId() { return ++app.nextId; }

// ─── TOAST NOTIFICATION ───────────────────────────────────────────────────────
let toastTimer;

function showToast(msg = 'Saved!') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// ─── MODAL CONTROLS ───────────────────────────────────────────────────────────

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  // Clear edit IDs on close
  ['reminder-edit-id', 'note-edit-id', 'event-edit-id', 'habit-edit-id'].forEach(i => {
    const field = document.getElementById(i);
    if (field) field.value = '';
  });
}

// Close modal when clicking the overlay background
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', function (e) {
      if (e.target === this) closeModal(this.id);
    });
  });
});

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
let currentPage = 'home';

function goPage(name) {
  // Hide all pages and deactivate all nav buttons
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = '';
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.more-btn').forEach(b => b.classList.remove('active'));

  // Show target page
  const pg = document.getElementById('page-' + name);
  if (pg) {
    if (name === 'ai') {
      pg.style.display = 'flex';
      pg.classList.add('active');
    } else {
      pg.classList.add('active');
    }
  }

  // Activate the matching nav button
  const nb = document.getElementById('nav-' + name);
  if (nb) nb.classList.add('active');

  // If it's a secondary page, highlight the "More" tab
  if (MORE_PAGE_IDS.includes(name)) {
    const moreBtn = document.getElementById('nav-more');
    if (moreBtn) moreBtn.classList.add('active');
    const moreItem = document.getElementById('more-' + name);
    if (moreItem) moreItem.classList.add('active');
  }

  currentPage = name;
  renderPage(name);
}

function renderPage(name) {
  if      (name === 'home')          renderHome();
  else if (name === 'reminders')     renderReminders();
  else if (name === 'calendar')      renderCalendar();
  else if (name === 'habits')        renderHabits();
  else if (name === 'calculator')    renderCalculator();
  else if (name === 'expense')       renderExpense();
  else if (name === 'checklist')     renderChecklist();
  else if (name === 'stats')         renderStats();
  else if (name === 'notes')         renderNotes();
  else if (name === 'settings')      renderSettings();
  else if (name === 'ai')            renderAI();
  else if (name === 'notifications') renderNotifications();
  else if (name === 'weather')       renderWeatherPage();
  else if (name === 'fuel')          renderFuel();
  else if (name === 'period')        renderPeriod();
  else if (name === 'pregnancy')     renderPregnancyPage();
  else if (name === 'focus')         renderFocusTimer();
  else if (name === 'bmi')           renderBMI();
  else if (name === 'water')         renderWaterTracker();
  else if (name === 'currency')      renderCurrencyConverter();
}

// ─── DOCK / FAB CONTROLS ──────────────────────────────────────────────────────
let fabOpen = false, moreOpen = false;

function toggleFab() {
  fabOpen  = !fabOpen;
  moreOpen = false;
  document.getElementById('dock-center-fab').classList.toggle('open', fabOpen);
  document.getElementById('fab-menu').classList.toggle('open', fabOpen);
  document.getElementById('more-drawer').classList.remove('open');
  document.getElementById('nav-overlay').classList.toggle('show', fabOpen);
}

function closeFab() { closeAllMenus(); }

function toggleMoreDrawer() {
  moreOpen = !moreOpen;
  fabOpen  = false;
  document.getElementById('more-drawer').classList.toggle('open', moreOpen);
  document.getElementById('dock-center-fab').classList.remove('open');
  document.getElementById('fab-menu').classList.remove('open');
  document.getElementById('nav-overlay').classList.toggle('show', moreOpen);

  const moreBtn = document.getElementById('nav-more');
  if (moreBtn) {
    const r = document.createElement('div');
    r.className = 'nav-ripple';
    moreBtn.appendChild(r);
    setTimeout(() => r.remove(), 450);
    moreBtn.classList.toggle('active', moreOpen);
  }
}

function closeAllMenus() {
  fabOpen  = false;
  moreOpen = false;
  document.getElementById('dock-center-fab').classList.remove('open');
  document.getElementById('fab-menu').classList.remove('open');
  document.getElementById('more-drawer').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('show');
}

/** Add a ripple animation to a nav button and close any open menus */
function navRipple(el) {
  closeAllMenus();
  const r = document.createElement('div');
  r.className = 'nav-ripple';
  el.appendChild(r);
  setTimeout(() => r.remove(), 450);
}

// ─── AUTO-HIDE DOCK ON SCROLL ─────────────────────────────────────────────────
(function () {
  let scrollTimer;
  const content = document.getElementById('content');
  if (!content) return;
  content.addEventListener('scroll', () => {
    const dock = document.getElementById('floating-dock');
    if (!dock) return;
    dock.classList.add('dock-hide');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => dock.classList.remove('dock-hide'), 400);
  }, { passive: true });
})();

// ─── STATUS BAR CLOCK ─────────────────────────────────────────────────────────
function updateStatusBarClock() {
  const el = document.querySelector('#statusbar .time');
  if (!el) return;
  const now  = new Date();
  const h    = now.getHours();
  const m    = now.getMinutes();
  const hh   = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const mm   = String(m).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  el.textContent = `${hh}:${mm} ${ampm}`;
}
setInterval(updateStatusBarClock, 1000);
updateStatusBarClock();

// ─── NOTIFICATION BADGE ───────────────────────────────────────────────────────
function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const unread = (app.notifications || []).filter(n => !n.read).length;
  if (unread > 0) {
    badge.style.display = 'flex';
    badge.textContent   = unread > 99 ? '99+' : String(unread);
  } else {
    badge.style.display = 'none';
  }
}
