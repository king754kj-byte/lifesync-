/**
 * calendarEngine.js
 * LifeSync Premium — Calendar Engine
 * Handles calendar rendering, event CRUD, and calendar-reminder sync
 */

// ─── CALENDAR RENDER ──────────────────────────────────────────────────────────
function renderCalendar() {
  const now = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const ml = document.getElementById('cal-month-label');
  if (ml) ml.textContent = `${months[now.getMonth()]} ${now.getFullYear()}`;

  const header = document.getElementById('cal-days-header');
  if (header) {
    header.innerHTML = ['S','M','T','W','T','F','S']
      .map(d => `<div class="cal-day-label">${d}</div>`)
      .join('');
  }

  const cells = document.getElementById('cal-cells');
  if (!cells) return;

  const startDay  = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today     = now.getDate();
  const sel       = app.calSelected || today;

  // Build event map: day → array of events
  const evMap = {};
  app.events.forEach(e => {
    if (!evMap[e.day]) evMap[e.day] = [];
    evMap[e.day].push(e);
  });

  let html = '';
  // Empty cells before month start
  for (let i = 0; i < startDay; i++) html += '<div></div>';

  // Day cells
  for (let d = 1; d <= totalDays; d++) {
    const isToday = d === today;
    const isSel   = d === sel;
    const evs     = evMap[d] || [];
    html += `
      <div style="width:100%;padding-top:100%;border-radius:10px;position:relative;cursor:pointer;"
           onclick="selectCalDay(${d})">
        <div class="cal-cell ${isSel ? 'selected' : isToday ? 'today' : ''}"
             style="position:absolute;inset:2px;">
          <span class="cal-num">${d}</span>
          ${evs.length > 0
            ? `<div class="cal-dot" style="background:${evs[0].color};"></div>`
            : ''}
        </div>
      </div>`;
  }

  cells.innerHTML = html;
  renderCalEvents(sel);
}

// ─── DAY SELECTION ────────────────────────────────────────────────────────────
function selectCalDay(d) {
  app.calSelected = d;
  renderCalendar();
}

// ─── EVENTS FOR SELECTED DAY ─────────────────────────────────────────────────
function renderCalEvents(day) {
  const title = document.getElementById('cal-events-title');
  const list  = document.getElementById('cal-events-list');
  if (!title || !list) return;

  const now    = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  title.textContent = `Events on ${months[now.getMonth()]} ${day}`;

  const evs = app.events.filter(e => e.day === day);
  if (evs.length === 0) {
    list.innerHTML = `<div class="card" style="text-align:center;color:#666;font-size:13px;">
      No events on this day
    </div>`;
    return;
  }

  list.innerHTML = evs.map(e => `
    <div class="card" style="box-shadow:0 0 18px ${e.color}22;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:24px;">${e.icon}</div>
        <div style="flex:1;">
          <div style="color:#fff;font-weight:700;font-size:14px;">${e.title}</div>
          <div style="color:#888;font-size:12px;">${e.time || ''}</div>
        </div>
        <span class="badge"
              style="background:${e.color}18;border-color:${e.color}55;color:${e.color};">
          Day ${e.day}
        </span>
        <div style="display:flex;gap:4px;">
          <button class="btn-sm"    style="padding:4px 8px;font-size:10px;"
                  onclick="editEvent(${e.id})">✏️</button>
          <button class="btn-danger" style="padding:4px 8px;font-size:10px;"
                  onclick="deleteEvent(${e.id})">🗑</button>
        </div>
      </div>
    </div>`).join('');
}

// ─── EDIT EVENT ───────────────────────────────────────────────────────────────
function editEvent(id) {
  const e = app.events.find(x => x.id === id);
  if (!e) return;
  document.getElementById('event-modal-title').textContent = '✏️ Edit Event';
  document.getElementById('event-edit-id').value  = id;
  document.getElementById('ev-title').value        = e.title;
  document.getElementById('ev-day').value          = e.day;
  document.getElementById('ev-icon').value         = e.icon;
  document.getElementById('ev-time').value         = e.time || '';
  document.getElementById('ev-color').value        = e.color;
  openModal('event-modal');
}

// ─── SAVE EVENT ───────────────────────────────────────────────────────────────
function saveEvent() {
  const title = document.getElementById('ev-title').value.trim();
  if (!title) { showToast('Please enter event name'); return; }

  const editId = document.getElementById('event-edit-id').value;
  const obj = {
    title,
    day:   parseInt(document.getElementById('ev-day').value) || new Date().getDate(),
    icon:  document.getElementById('ev-icon').value  || '📅',
    time:  document.getElementById('ev-time').value  || '',
    color: document.getElementById('ev-color').value,
  };

  if (editId) {
    const idx = app.events.findIndex(x => x.id == editId);
    if (idx >= 0) app.events[idx] = { ...app.events[idx], ...obj };
  } else {
    obj.id = nextId();
    app.events.push(obj);
  }

  saveData();
  closeModal('event-modal');
  renderCalendar();
}

// ─── DELETE EVENT ─────────────────────────────────────────────────────────────
function deleteEvent(id) {
  app.events = app.events.filter(x => x.id !== id);
  saveData();
  renderCalendar();
}

// ─── CALENDAR SYNC — Push active reminder due-dates as calendar dots ──────────
function updateCalendarReminderDots() {
  const now      = new Date();
  const curMonth = now.getMonth();
  const curYear  = now.getFullYear();

  // Remove previously injected reminder events, then rebuild
  app.events = app.events.filter(e => !e._fromReminder);

  app.reminders.forEach(r => {
    if (r.status === 'completed') return;
    if (!r.dueTs) return;
    const d = new Date(r.dueTs);
    if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
      app.events.push({
        id:            'r_' + r.id,
        day:           d.getDate(),
        icon:          r.icon  || '🔔',
        title:         r.title,
        time:          r.status === 'missed'
                         ? '⚠️ Missed'
                         : r.days === 0
                           ? '⚡ Today'
                           : `${r.days}d left`,
        color:         r.color || '#00d4ff',
        _fromReminder: true,
      });
    }
  });

  saveDataSilent();
  if (typeof currentPage !== 'undefined' && currentPage === 'calendar') {
    renderCalendar();
  }
}
