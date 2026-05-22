/**
 * indexedDB.js
 * LifeSync Premium — IndexedDB Storage Layer v1.0
 *
 * Replaces ALL localStorage usage in the app with IndexedDB.
 * Provides a synchronous-style API (via in-memory cache) so the rest
 * of the app code works WITHOUT any changes.
 *
 * Stores managed:
 *   • lifesync_v2_data       → main app state (reminders, habits, notes, etc.)
 *   • ls_mood_log            → mood check-in history (last 30 days)
 *   • ls_water               → daily water intake
 *   • ls_currency            → currency converter last state
 *   • ls_focus_log           → focus/Pomodoro session log
 *   • ls_bmi_data            → last BMI calculation
 *   • pwa_install_dismissed_v1 → PWA install banner dismiss timestamp
 *
 * HOW IT WORKS
 * ─────────────
 * 1. On boot, `initDB()` opens the IndexedDB database and loads every key
 *    into an in-memory cache (`_cache`).
 * 2. `localStorage.getItem / setItem / removeItem` are monkey-patched so
 *    existing code continues to work synchronously from cache.
 * 3. Every write also flushes to IndexedDB asynchronously (fire-and-forget).
 * 4. A one-time migration copies any existing localStorage data into IDB
 *    and then clears localStorage.
 *
 * USAGE
 * ─────
 * Add this script FIRST, before any other scripts:
 *   <script src="indexedDB.js"></script>
 *
 * The script exposes:
 *   window.LifeSyncDB.ready  – Promise that resolves when IDB is loaded
 *   window.LifeSyncDB.get(key)           – async read
 *   window.LifeSyncDB.set(key, value)    – async write (value = string)
 *   window.LifeSyncDB.remove(key)        – async delete
 *   window.LifeSyncDB.clearAll()         – async wipe entire store
 */

(function (window) {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────────────────
  const DB_NAME    = 'LifeSyncDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';   // generic key-value object store

  /** All localStorage keys this app uses */
  const MANAGED_KEYS = [
    'lifesync_v2_data',
    'ls_mood_log',
    'ls_water',
    'ls_currency',
    'ls_focus_log',
    'ls_bmi_data',
    'pwa_install_dismissed_v1',
  ];

  // ── IN-MEMORY CACHE ───────────────────────────────────────────────────────
  /** Mirrors IDB contents; keeps synchronous localStorage API working */
  const _cache = Object.create(null);

  // ── IDB HANDLE ────────────────────────────────────────────────────────────
  let _db = null;

  // ── READY PROMISE ─────────────────────────────────────────────────────────
  let _resolveReady, _rejectReady;
  const _ready = new Promise((res, rej) => {
    _resolveReady = res;
    _rejectReady  = rej;
  });

  // ── LOW-LEVEL IDB HELPERS ─────────────────────────────────────────────────

  function _openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME); // key-path = explicit key
        }
      };

      req.onsuccess  = (e) => resolve(e.target.result);
      req.onerror    = (e) => reject(e.target.error);
      req.onblocked  = ()  => reject(new Error('IDB blocked'));
    });
  }

  function _idbGet(key) {
    return new Promise((resolve, reject) => {
      const tx  = _db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  function _idbSet(key, value) {
    return new Promise((resolve, reject) => {
      const tx  = _db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  function _idbDelete(key) {
    return new Promise((resolve, reject) => {
      const tx  = _db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  function _idbGetAll() {
    return new Promise((resolve, reject) => {
      const result = {};
      const tx     = _db.transaction(STORE_NAME, 'readonly');
      const store  = tx.objectStore(STORE_NAME);
      const req    = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          result[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function _idbClear() {
    return new Promise((resolve, reject) => {
      const tx  = _db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ── MIGRATION: localStorage → IndexedDB ──────────────────────────────────
  /**
   * Copy any existing localStorage data into IDB once.
   * Runs only when IDB is empty for a given key.
   */
  async function _migrate() {
    let migrated = 0;
    for (const key of MANAGED_KEYS) {
      try {
        // Only migrate if IDB doesn't already have data for this key
        const existing = await _idbGet(key);
        if (existing === null) {
          let lsVal = null;
          try { lsVal = window._origLS ? window._origLS.getItem(key) : localStorage.getItem(key); } catch (e) {}
          if (lsVal !== null) {
            await _idbSet(key, lsVal);
            _cache[key] = lsVal;
            migrated++;
          }
        } else {
          _cache[key] = existing;
        }
      } catch (e) {
        // If IDB fails for this key, fall back to localStorage value
        try {
          const lsVal = localStorage.getItem(key);
          if (lsVal !== null) _cache[key] = lsVal;
        } catch (_) {}
      }
    }

    // After migration, clean up localStorage keys (optional but keeps storage tidy)
    if (migrated > 0) {
      for (const key of MANAGED_KEYS) {
        try { localStorage.removeItem(key); } catch (e) {}
      }
    }
  }

  // ── BOOT ──────────────────────────────────────────────────────────────────
  async function initDB() {
    try {
      _db = await _openDB();

      // Load all existing IDB data into cache
      const all = await _idbGetAll();
      Object.assign(_cache, all);

      // One-time migration from localStorage
      await _migrate();

      _resolveReady(true);
    } catch (err) {
      console.warn('[LifeSyncDB] IndexedDB unavailable, falling back to localStorage:', err.message);
      // Populate cache from localStorage as fallback
      for (const key of MANAGED_KEYS) {
        try {
          const v = localStorage.getItem(key);
          if (v !== null) _cache[key] = v;
        } catch (e) {}
      }
      _resolveReady(false); // resolved (not rejected) — app still works via LS
    }
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────
  const LifeSyncDB = {
    /** Promise — resolves when IDB is ready (true) or fell back to LS (false) */
    get ready() { return _ready; },

    /** Async read — returns string or null */
    async get(key) {
      await _ready;
      if (_db) {
        try { return await _idbGet(key); } catch (e) {}
      }
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },

    /** Async write — value must be a string (JSON.stringify yourself if needed) */
    async set(key, value) {
      // Update cache immediately for synchronous reads
      _cache[key] = value;
      if (_db) {
        try { await _idbSet(key, value); return; } catch (e) {}
      }
      try { localStorage.setItem(key, value); } catch (e) {}
    },

    /** Async delete */
    async remove(key) {
      delete _cache[key];
      if (_db) {
        try { await _idbDelete(key); return; } catch (e) {}
      }
      try { localStorage.removeItem(key); } catch (e) {}
    },

    /** Wipe the entire IDB store (used by resetData()) */
    async clearAll() {
      for (const k of Object.keys(_cache)) delete _cache[k];
      if (_db) {
        try { await _idbClear(); return; } catch (e) {}
      }
      for (const key of MANAGED_KEYS) {
        try { localStorage.removeItem(key); } catch (e) {}
      }
    },

    /** Export all data as a plain object (for backup / debug) */
    async exportAll() {
      await _ready;
      if (_db) {
        try { return await _idbGetAll(); } catch (e) {}
      }
      const out = {};
      for (const key of MANAGED_KEYS) {
        try { const v = localStorage.getItem(key); if (v) out[key] = v; } catch (e) {}
      }
      return out;
    },

    /** Import data from a backup object */
    async importAll(data) {
      for (const [key, value] of Object.entries(data)) {
        await this.set(key, value);
      }
    },
  };

  // ── MONKEY-PATCH localStorage ─────────────────────────────────────────────
  /**
   * Override localStorage.getItem / setItem / removeItem for MANAGED_KEYS.
   * Non-managed keys pass through to the real localStorage unchanged.
   * This keeps all existing app code working without modification.
   */
  (function patchLocalStorage() {
    // Keep a reference to the original localStorage methods
    const _origGetItem    = Storage.prototype.getItem.bind(localStorage);
    const _origSetItem    = Storage.prototype.setItem.bind(localStorage);
    const _origRemoveItem = Storage.prototype.removeItem.bind(localStorage);

    // Expose originals for migration use
    window._origLS = {
      getItem:    _origGetItem,
      setItem:    _origSetItem,
      removeItem: _origRemoveItem,
    };

    Storage.prototype.getItem = function (key) {
      if (this === localStorage && MANAGED_KEYS.includes(key)) {
        // Return from cache (synchronous, always up-to-date)
        return Object.prototype.hasOwnProperty.call(_cache, key) ? _cache[key] : null;
      }
      return _origGetItem(key);
    };

    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && MANAGED_KEYS.includes(key)) {
        // Write to cache synchronously
        _cache[key] = String(value);
        // Flush to IDB asynchronously (fire-and-forget)
        if (_db) {
          _idbSet(key, String(value)).catch(() => {
            // IDB write failed — keep in cache, try real LS as fallback
            try { _origSetItem(key, value); } catch (e) {}
          });
        } else {
          try { _origSetItem(key, value); } catch (e) {}
        }
        return;
      }
      _origSetItem(key, value);
    };

    Storage.prototype.removeItem = function (key) {
      if (this === localStorage && MANAGED_KEYS.includes(key)) {
        delete _cache[key];
        if (_db) {
          _idbDelete(key).catch(() => {
            try { _origRemoveItem(key); } catch (e) {}
          });
        } else {
          try { _origRemoveItem(key); } catch (e) {}
        }
        return;
      }
      _origRemoveItem(key);
    };
  })();

  // ── PATCH resetData() ─────────────────────────────────────────────────────
  /**
   * Wrap the app's resetData() so it also clears IndexedDB.
   * We wait for DOMContentLoaded to ensure resetData is already defined.
   */
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof window.resetData === 'function') {
      const _origResetData = window.resetData;
      window.resetData = async function () {
        // Clear IDB first, then run original reset
        await LifeSyncDB.clearAll();
        _origResetData();
      };
    }
  });

  // ── ATTACH TO WINDOW ──────────────────────────────────────────────────────
  window.LifeSyncDB = LifeSyncDB;

  // ── START ─────────────────────────────────────────────────────────────────
  initDB();

}(window));


/* ════════════════════════════════════════════════════════════════════════════
   MINI USAGE GUIDE
   ════════════════════════════════════════════════════════════════════════════

   ┌─ Existing code (no changes needed) ───────────────────────────────────┐
   │  localStorage.setItem('lifesync_v2_data', JSON.stringify(app));       │
   │  localStorage.getItem('ls_water')                                     │
   │  localStorage.removeItem('lifesync_v2_data')                          │
   └───────────────────────────────────────────────────────────────────────┘
   These now read/write IndexedDB automatically via the patched localStorage.

   ┌─ New async API (optional, for direct IDB access) ─────────────────────┐
   │  await window.LifeSyncDB.set('my_key', JSON.stringify(data));         │
   │  const raw = await window.LifeSyncDB.get('my_key');                   │
   │  await window.LifeSyncDB.remove('my_key');                            │
   │  const backup = await window.LifeSyncDB.exportAll();                  │
   │  await window.LifeSyncDB.importAll(backup);                           │
   └───────────────────────────────────────────────────────────────────────┘

   ┌─ Wait for IDB to be ready before first render ────────────────────────┐
   │  await window.LifeSyncDB.ready;   // resolves after migration done    │
   │  let app = loadData();            // cache is populated by this point │
   └───────────────────────────────────────────────────────────────────────┘

   ┌─ In index.html, load ORDER matters ───────────────────────────────────┐
   │  <script src="indexedDB.js"></script>   ← FIRST                       │
   │  <script src="config.js"></script>                                     │
   │  <script src="helpers.js"></script>                                    │
   │  <script src="calendarEngine.js"></script>                             │
   │  <script src="syncService.js"></script>                                │
   │  <script src="themeManager.js"></script>                               │
   └───────────────────────────────────────────────────────────────────────┘

   MANAGED KEYS (stored in IndexedDB):
     lifesync_v2_data          → main app object
     ls_mood_log               → mood history array
     ls_water                  → water intake (daily)
     ls_currency               → currency converter state
     ls_focus_log              → focus/Pomodoro sessions
     ls_bmi_data               → last BMI result
     pwa_install_dismissed_v1  → install banner dismiss time

   All other keys (e.g. from third-party scripts) still use real localStorage.
════════════════════════════════════════════════════════════════════════════ */
