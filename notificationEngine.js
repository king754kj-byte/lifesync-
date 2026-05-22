// ══════════════════════════════════════════════════════════════════════════════
// notificationEngine.js — LifeSync Premium
// Real Notification System: browser notifications + in-app log + vibration
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

/* ── Utility helpers (shared) ────────────────────────────────────────────── */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function nowMs() { return Date.now(); }
function fmtTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ── In-app notification badge updater ──────────────────────────────────── */
function updateNotifBadge() {
  if (typeof app === 'undefined') return;
  const unread = (app.notifications || []).filter(n => !n.read).length;
  const badge = document.getElementById('nav-notif-badge');
  if (!badge) return;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/* ── Safe data save (no toast spam) ─────────────────────────────────────── */
function saveDataSilent() {
  try {
    const LS_KEY = window.LS_KEY || 'lifesync_data';
    localStorage.setItem(LS_KEY, JSON.stringify(window.app));
  } catch (e) {}
}

/* ── Core Notification Engine ────────────────────────────────────────────── */
window.LSNotif = {
  permission: (typeof Notification !== 'undefined') ? Notification.permission : 'denied',

  /**
   * Request browser notification permission from user.
   * @returns {Promise<boolean>} true if granted
   */
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

  /**
   * Send a notification (in-app log + browser notification + vibration).
   * @param {string} title   - Notification title
   * @param {string} body    - Notification body text
   * @param {string} [tag]   - Optional deduplication tag
   * @param {string} [icon]  - Optional icon URL
   */
  send(title, body, tag, icon) {
    // 1. Always add to in-app log
    if (!window.app) return;
    if (!window.app.notifications) window.app.notifications = [];

    const entry = {
      id:    (typeof nextId === 'function') ? nextId() : Date.now(),
      title,
      body,
      time:  fmtTime(nowMs()),
      date:  todayStr(),
      read:  false
    };

    window.app.notifications.unshift(entry);

    // Keep max 100 entries
    if (window.app.notifications.length > 100) {
      window.app.notifications = window.app.notifications.slice(0, 100);
    }

    saveDataSilent();
    updateNotifBadge();

    // 2. Browser push notification (if permission granted)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const n = new Notification('LifeSync: ' + title, {
          body,
          icon:      icon || './icon-192.png',
          badge:     './icon-192.png',
          tag:       tag || ('ls-' + Date.now()),
          renotify:  true,
          vibrate:   [200, 100, 200]
        });
        n.onclick = function () {
          window.focus();
          n.close();
        };
      } catch (e) {
        console.warn('[LSNotif] Browser notification failed:', e.message);
      }
    }

    // 3. Vibration (mobile)
    if (navigator.vibrate) {
      try { navigator.vibrate([200, 100, 200]); } catch (e) {}
    }
  },

  /**
   * Mark all notifications as read and refresh badge.
   */
  markAllRead() {
    if (!window.app || !window.app.notifications) return;
    window.app.notifications.forEach(n => { n.read = true; });
    saveDataSilent();
    updateNotifBadge();
  },

  /**
   * Mark a single notification as read by id.
   * @param {number|string} id
   */
  markRead(id) {
    if (!window.app || !window.app.notifications) return;
    const n = window.app.notifications.find(x => x.id === id);
    if (n) { n.read = true; saveDataSilent(); updateNotifBadge(); }
  },

  /**
   * Clear all notifications.
   */
  clearAll() {
    if (!window.app) return;
    window.app.notifications = [];
    saveDataSilent();
    updateNotifBadge();
  },

  /**
   * Get unread count.
   * @returns {number}
   */
  unreadCount() {
    return (window.app?.notifications || []).filter(n => !n.read).length;
  }
};

/* ── Override legacy sendBrowserNotif to use real engine ─────────────────── */
window.sendBrowserNotif = function (title, body) {
  window.LSNotif.send(title, body);
};

/* ── Render in-app notification center page ──────────────────────────────── */
function renderNotifications() {
  const pg = document.getElementById('page-notifications');
  if (!pg) return;

  const notifs = (window.app?.notifications || []);
  window.LSNotif.markAllRead();

  pg.innerHTML = `
    <div style="padding:20px 0 16px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:20px;font-weight:800;color:#fff;">🔔 Notifications</div>
      <button onclick="window.LSNotif.clearAll();renderNotifications();"
        style="font-size:11px;color:#555;background:none;border:1px solid rgba(255,255,255,0.07);
               border-radius:8px;padding:5px 12px;cursor:pointer;font-family:inherit;">
        Clear All
      </button>
    </div>
    ${notifs.length === 0
      ? `<div style="color:#555;text-align:center;padding:40px 0;font-size:13px;">No notifications yet 🎉</div>`
      : notifs.map(n => `
        <div style="padding:12px 14px;border-radius:16px;background:rgba(255,255,255,0.03);
                    border:1px solid rgba(255,255,255,0.07);margin-bottom:10px;">
          <div style="font-size:13px;font-weight:700;color:#fff;">${n.title}</div>
          <div style="font-size:12px;color:#888;margin-top:3px;">${n.body}</div>
          <div style="font-size:10px;color:#444;margin-top:6px;">${n.date} · ${n.time}</div>
        </div>`).join('')
    }`;
}
