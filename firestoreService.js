/**
 * LifeSync v6.0 — firestoreService.js
 *
 * Thin async wrapper around Firebase Firestore v12 (modular SDK).
 * Loaded lazily so it doesn't block the main thread.
 *
 * Usage (from main app scripts):
 *   const svc = await window.getFirestoreService();
 *   await svc.setDoc('habits', docId, data);
 *   const docs = await svc.getDocs('habits');
 */

(async function () {
  'use strict';

  // ── Guard: load once ──────────────────────────────────────────────────────
  if (window.__LS_FIRESTORE_SVC__) return;

  let _db   = null;    // Firestore instance
  let _ready = false;

  // ── Wait for the main app to initialise Firebase ─────────────────────────
  function waitForDB(maxWait = 8000) {
    return new Promise((resolve, reject) => {
      if (window.db || window.fsDb) {
        resolve(window.db || window.fsDb);
        return;
      }

      const interval = 250;
      let elapsed    = 0;

      const poll = setInterval(() => {
        elapsed += interval;
        if (window.db || window.fsDb) {
          clearInterval(poll);
          resolve(window.db || window.fsDb);
        } else if (elapsed >= maxWait) {
          clearInterval(poll);
          reject(new Error('[firestoreService] DB not available after ' + maxWait + 'ms'));
        }
      }, interval);
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  try {
    _db    = await waitForDB();
    _ready = true;
    console.log('[firestoreService] Ready');
  } catch (e) {
    console.warn('[firestoreService] Firestore unavailable — offline mode only', e);
  }

  // ── Import Firestore helpers ──────────────────────────────────────────────
  let _fs = null;
  if (_ready) {
    try {
      _fs = await import('https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js');
    } catch (e) {
      console.warn('[firestoreService] Could not import Firestore SDK', e);
      _ready = false;
    }
  }

  // ── Service API ───────────────────────────────────────────────────────────
  const service = {

    get isReady() { return _ready; },

    /**
     * Set (create/overwrite) a document.
     * @param {string} col  - collection name
     * @param {string} docId - document ID
     * @param {object} data
     * @param {boolean} [merge=false] - merge instead of overwrite
     */
    async setDoc(col, docId, data, merge = false) {
      if (!_ready || !_fs) return null;
      try {
        const ref = _fs.doc(_db, col, docId);
        await _fs.setDoc(ref, { ...data, _updatedAt: new Date().toISOString() }, { merge });
        return true;
      } catch (e) {
        console.error('[firestoreService] setDoc error:', e);
        return null;
      }
    },

    /**
     * Get a single document.
     * @returns {object|null}
     */
    async getDoc(col, docId) {
      if (!_ready || !_fs) return null;
      try {
        const ref  = _fs.doc(_db, col, docId);
        const snap = await _fs.getDoc(ref);
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
      } catch (e) {
        console.error('[firestoreService] getDoc error:', e);
        return null;
      }
    },

    /**
     * Get all documents in a collection (optionally ordered).
     * @returns {Array}
     */
    async getDocs(col, orderByField = null, direction = 'asc') {
      if (!_ready || !_fs) return [];
      try {
        let q = _fs.collection(_db, col);
        if (orderByField) q = _fs.query(q, _fs.orderBy(orderByField, direction));
        const snap = await _fs.getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.error('[firestoreService] getDocs error:', e);
        return [];
      }
    },

    /**
     * Add a new document with auto-generated ID.
     * @returns {string|null} - the new document ID
     */
    async addDoc(col, data) {
      if (!_ready || !_fs) return null;
      try {
        const ref = await _fs.addDoc(
          _fs.collection(_db, col),
          { ...data, _createdAt: new Date().toISOString() }
        );
        return ref.id;
      } catch (e) {
        console.error('[firestoreService] addDoc error:', e);
        return null;
      }
    },

    /**
     * Delete a document.
     */
    async deleteDoc(col, docId) {
      if (!_ready || !_fs) return false;
      try {
        await _fs.deleteDoc(_fs.doc(_db, col, docId));
        return true;
      } catch (e) {
        console.error('[firestoreService] deleteDoc error:', e);
        return false;
      }
    },

    /**
     * Subscribe to real-time updates on a collection.
     * @returns {function} unsubscribe
     */
    onSnapshot(col, callback, orderByField = null) {
      if (!_ready || !_fs) return () => {};
      try {
        let q = _fs.collection(_db, col);
        if (orderByField) q = _fs.query(q, _fs.orderBy(orderByField, 'desc'));
        return _fs.onSnapshot(q, (snap) => {
          callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
      } catch (e) {
        console.error('[firestoreService] onSnapshot error:', e);
        return () => {};
      }
    },

    /**
     * Batch write multiple documents atomically.
     * @param {Array<{col, docId, data}>} ops
     */
    async batchSet(ops) {
      if (!_ready || !_fs || !ops.length) return false;
      try {
        const batch = _fs.writeBatch(_db);
        ops.forEach(({ col, docId, data }) => {
          const ref = _fs.doc(_db, col, docId);
          batch.set(ref, { ...data, _updatedAt: new Date().toISOString() }, { merge: true });
        });
        await batch.commit();
        return true;
      } catch (e) {
        console.error('[firestoreService] batchSet error:', e);
        return false;
      }
    },
  };

  // ── Expose globally ───────────────────────────────────────────────────────
  window.__LS_FIRESTORE_SVC__ = service;

  /**
   * getFirestoreService() — call from anywhere in the app.
   * Always returns the singleton; safe to call multiple times.
   */
  window.getFirestoreService = function () {
    return Promise.resolve(window.__LS_FIRESTORE_SVC__);
  };

  console.log('[firestoreService] Exposed as window.__LS_FIRESTORE_SVC__');

})();
