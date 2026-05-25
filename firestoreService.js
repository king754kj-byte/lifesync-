/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           LifeSync v5.5 — Firestore Service Layer               ║
 * ║                                                                  ║
 * ║  Single source of truth for ALL Firestore read/write ops.        ║
 * ║  Replaces every scattered db.collection() call in the app.       ║
 * ║                                                                  ║
 * ║  Collections:                                                     ║
 * ║    users/{uid}                     — user profile                ║
 * ║    users/{uid}/reminders/{id}      — reminders                   ║
 * ║    users/{uid}/scEvents/{id}       — smart calendar events        ║
 * ║    users/{uid}/expenses/{id}       — expense entries             ║
 * ║    users/{uid}/checklists/{id}     — shopping/checklist data     ║
 * ║    users/{uid}/tokens/fcm          — FCM push token              ║
 * ║    userLayouts/{uid}               — smart layout config         ║
 * ║                                                                  ║
 * ║  Usage (ES Module — loaded via <script type="module">):          ║
 * ║    import { FS } from './firestoreService.js';                   ║
 * ║    await FS.reminders.save(uid, reminderObj);                    ║
 * ║    const list = await FS.reminders.loadAll(uid);                 ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ── Firebase SDK v12 Modular Imports ──────────────────────────────────────────
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

// ── DB Reference ─────────────────────────────────────────────────────────────
// Expects window.fbApp to be set by the Firebase init block in index.html.
// Falls back gracefully if not yet initialized.
let _db = null;

function getDB() {
  if (_db) return _db;
  if (window.fbApp) {
    _db = getFirestore(window.fbApp);
    return _db;
  }
  // Legacy compat-SDK fallback (used by SmartLayouts, etc.)
  if (window.db) return window.db;
  throw new Error('[FS] Firestore not initialized — fbApp not ready.');
}

// ── Safe executor — wraps every op in try/catch, logs, never throws to UI ────
async function safe(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[FS] ${label}:`, err.message || err);
    return null;
  }
}

// ── Timestamp helper ─────────────────────────────────────────────────────────
function ts() {
  return serverTimestamp();
}

// ── Path helpers ─────────────────────────────────────────────────────────────
const Path = {
  user:       (uid)         => ['users', uid],
  reminder:   (uid, id)     => ['users', uid, 'reminders',  String(id)],
  scEvent:    (uid, id)     => ['users', uid, 'scEvents',   String(id)],
  expense:    (uid, id)     => ['users', uid, 'expenses',   String(id)],
  checklist:  (uid, id)     => ['users', uid, 'checklists', String(id)],
  fcmToken:   (uid)         => ['users', uid, 'tokens',     'fcm'],
  layout:     (uid)         => ['userLayouts', uid],
};

// ─────────────────────────────────────────────────────────────────────────────
//  FS — Public Service API
// ─────────────────────────────────────────────────────────────────────────────
export const FS = {

  // ── PROFILE ───────────────────────────────────────────────────────────────
  profile: {
    /**
     * Save / merge user profile document.
     * @param {object} user — Firebase Auth user object
     */
    async save(user) {
      if (!user?.uid) return null;
      const db = getDB();
      return safe('profile.save', () =>
        setDoc(doc(db, ...Path.user(user.uid)), {
          uid:         user.uid,
          displayName: user.displayName || '',
          email:       user.email || '',
          photoURL:    user.photoURL || '',
          lastLogin:   ts(),
          platform:    navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
          appVersion:  '5.5',
        }, { merge: true })
      );
    },

    /**
     * Load user profile document.
     * @param {string} uid
     * @returns {object|null}
     */
    async load(uid) {
      if (!uid) return null;
      const db = getDB();
      return safe('profile.load', async () => {
        const snap = await getDoc(doc(db, ...Path.user(uid)));
        return snap.exists() ? snap.data() : null;
      });
    },
  },

  // ── REMINDERS ─────────────────────────────────────────────────────────────
  reminders: {
    /**
     * Save (upsert) a reminder.
     * @param {string} uid
     * @param {object} reminder — must have .id property
     */
    async save(uid, reminder) {
      if (!uid || !reminder?.id) return null;
      const db = getDB();
      return safe('reminders.save', () =>
        setDoc(
          doc(db, ...Path.reminder(uid, reminder.id)),
          { ...reminder, updatedAt: ts() },
          { merge: true }
        )
      );
    },

    /**
     * Load ALL reminders for a user.
     * @param {string} uid
     * @returns {Array}
     */
    async loadAll(uid) {
      if (!uid) return [];
      const db = getDB();
      return safe('reminders.loadAll', async () => {
        const snap = await getDocs(
          collection(db, ...Path.user(uid), 'reminders')
        );
        return snap.docs.map(d => d.data());
      }) ?? [];
    },

    /**
     * Delete a reminder by id.
     * @param {string} uid
     * @param {string|number} id
     */
    async delete(uid, id) {
      if (!uid || !id) return null;
      const db = getDB();
      return safe('reminders.delete', () =>
        deleteDoc(doc(db, ...Path.reminder(uid, id)))
      );
    },
  },

  // ── SMART CALENDAR EVENTS ─────────────────────────────────────────────────
  scEvents: {
    /**
     * Save (upsert) a smart calendar event.
     * @param {string} uid
     * @param {object} event — must have .id property
     */
    async save(uid, event) {
      if (!uid || !event?.id) return null;
      const db = getDB();
      return safe('scEvents.save', () =>
        setDoc(
          doc(db, ...Path.scEvent(uid, event.id)),
          { ...event, updatedAt: ts() },
          { merge: true }
        )
      );
    },

    /**
     * Load ALL smart calendar events for a user.
     * @param {string} uid
     * @returns {Array}
     */
    async loadAll(uid) {
      if (!uid) return [];
      const db = getDB();
      return safe('scEvents.loadAll', async () => {
        const snap = await getDocs(
          collection(db, ...Path.user(uid), 'scEvents')
        );
        return snap.docs.map(d => d.data());
      }) ?? [];
    },

    /**
     * Delete a smart calendar event by id.
     * @param {string} uid
     * @param {string|number} id
     */
    async delete(uid, id) {
      if (!uid || !id) return null;
      const db = getDB();
      return safe('scEvents.delete', () =>
        deleteDoc(doc(db, ...Path.scEvent(uid, id)))
      );
    },
  },

  // ── EXPENSES ──────────────────────────────────────────────────────────────
  expenses: {
    /**
     * Save (upsert) a single expense.
     * @param {string} uid
     * @param {object} expense — must have .id property
     */
    async save(uid, expense) {
      if (!uid || !expense?.id) return null;
      const db = getDB();
      return safe('expenses.save', () =>
        setDoc(
          doc(db, ...Path.expense(uid, expense.id)),
          { ...expense, updatedAt: ts() },
          { merge: true }
        )
      );
    },

    /**
     * Load ALL expenses for a user.
     * @param {string} uid
     * @returns {Array}
     */
    async loadAll(uid) {
      if (!uid) return [];
      const db = getDB();
      return safe('expenses.loadAll', async () => {
        const snap = await getDocs(
          collection(db, ...Path.user(uid), 'expenses')
        );
        return snap.docs.map(d => d.data());
      }) ?? [];
    },

    /**
     * Delete an expense by id.
     * @param {string} uid
     * @param {string|number} id
     */
    async delete(uid, id) {
      if (!uid || !id) return null;
      const db = getDB();
      return safe('expenses.delete', () =>
        deleteDoc(doc(db, ...Path.expense(uid, id)))
      );
    },
  },

  // ── CHECKLISTS ────────────────────────────────────────────────────────────
  checklists: {
    /**
     * Save (upsert) a checklist/shopping list.
     * @param {string} uid
     * @param {object} checklist — must have .id property
     */
    async save(uid, checklist) {
      if (!uid || !checklist?.id) return null;
      const db = getDB();
      return safe('checklists.save', () =>
        setDoc(
          doc(db, ...Path.checklist(uid, checklist.id)),
          { ...checklist, updatedAt: ts() },
          { merge: true }
        )
      );
    },

    /**
     * Load ALL checklists for a user.
     * @param {string} uid
     * @returns {Array}
     */
    async loadAll(uid) {
      if (!uid) return [];
      const db = getDB();
      return safe('checklists.loadAll', async () => {
        const snap = await getDocs(
          collection(db, ...Path.user(uid), 'checklists')
        );
        return snap.docs.map(d => d.data());
      }) ?? [];
    },

    /**
     * Delete a checklist by id.
     * @param {string} uid
     * @param {string|number} id
     */
    async delete(uid, id) {
      if (!uid || !id) return null;
      const db = getDB();
      return safe('checklists.delete', () =>
        deleteDoc(doc(db, ...Path.checklist(uid, id)))
      );
    },
  },

  // ── FCM TOKEN ─────────────────────────────────────────────────────────────
  fcm: {
    /**
     * Save FCM push token for a user.
     * @param {string} uid
     * @param {string} token — FCM registration token
     */
    async saveToken(uid, token) {
      if (!uid || !token) return null;
      const db = getDB();
      return safe('fcm.saveToken', () =>
        setDoc(
          doc(db, ...Path.fcmToken(uid)),
          { token, updatedAt: ts() },
          { merge: true }
        )
      );
    },

    /**
     * Load FCM token for a user.
     * @param {string} uid
     * @returns {string|null}
     */
    async loadToken(uid) {
      if (!uid) return null;
      const db = getDB();
      return safe('fcm.loadToken', async () => {
        const snap = await getDoc(doc(db, ...Path.fcmToken(uid)));
        return snap.exists() ? snap.data().token : null;
      });
    },
  },

  // ── SMART LAYOUTS ─────────────────────────────────────────────────────────
  layouts: {
    /**
     * Push (save) smart layout config for a user.
     * Replaces the entire document (merge: true for safety).
     * @param {string} uid
     * @param {object} payload — { activeLayoutId, customLayouts, lastUpdated, ... }
     */
    async push(uid, payload) {
      if (!uid) return false;
      const db = getDB();
      const result = await safe('layouts.push', () =>
        setDoc(
          doc(db, ...Path.layout(uid)),
          { ...payload, updatedAt: ts(), uid },
          { merge: true }
        )
      );
      return result !== null;
    },

    /**
     * Pull (load) smart layout config for a user.
     * @param {string} uid
     * @returns {object|null}
     */
    async pull(uid) {
      if (!uid) return null;
      const db = getDB();
      return safe('layouts.pull', async () => {
        const snap = await getDoc(doc(db, ...Path.layout(uid)));
        return snap.exists() ? snap.data() : null;
      });
    },
  },

  // ── BULK SYNC — load all data after login ─────────────────────────────────
  /**
   * Load ALL user data collections in parallel after login.
   * Returns an object with arrays ready to merge into app state.
   * @param {string} uid
   * @returns {{ reminders, scEvents, expenses, checklists }}
   */
  async syncAll(uid) {
    if (!uid) return { reminders: [], scEvents: [], expenses: [], checklists: [] };

    const [reminders, scEvents, expenses, checklists] = await Promise.allSettled([
      FS.reminders.loadAll(uid),
      FS.scEvents.loadAll(uid),
      FS.expenses.loadAll(uid),
      FS.checklists.loadAll(uid),
    ]);

    return {
      reminders:  reminders.status  === 'fulfilled' ? (reminders.value  ?? []) : [],
      scEvents:   scEvents.status   === 'fulfilled' ? (scEvents.value   ?? []) : [],
      expenses:   expenses.status   === 'fulfilled' ? (expenses.value   ?? []) : [],
      checklists: checklists.status === 'fulfilled' ? (checklists.value ?? []) : [],
    };
  },
};

// ── Expose on window for non-module scripts (backward compat) ─────────────────
// Allows legacy inline scripts to call: window.FS.reminders.save(uid, obj)
window.FS = FS;

// ── Expose db reference for legacy compat-style code ─────────────────────────
// SmartLayouts and other v8-compat code uses window.db.collection()
// We expose the modular db so it's available, but the old compat calls
// will only work if the compat SDK is also loaded. For new code, use FS.*.
//
// NOTE: The v8-compat-style calls (db.collection(...).doc(...).set(...))
// in the existing HTML should be migrated to FS.* calls over time.
// They are listed here for reference:
//
//   LINE 8214:  window.db.collection('users')…scEvents…set(obj)
//               → Replace with: FS.scEvents.save(uid, obj)
//
//   LINE 10276: db.collection('users')…expenses…set(obj)
//               → Replace with: FS.expenses.save(uid, obj)
//
//   LINE 10722: db.collection('users')…expenses…set(expObj)
//               → Replace with: FS.expenses.save(uid, expObj)
//
//   LINE 11863: db.collection('users')…checklists…set(cl)
//               → Replace with: FS.checklists.save(uid, cl)
//
//   LINE 26382: db.collection('userLayouts')…set(payload)
//               → Replace with: FS.layouts.push(uid, payload)
//
//   LINE 26395: db.collection('userLayouts')…get()
//               → Replace with: FS.layouts.pull(uid)

console.log('✓ LifeSync firestoreService.js v5.5 loaded');
