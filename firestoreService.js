/* ============================================================
   LifeSync — Firestore Service Module  (firestoreService.js)
   Version : 6.1

   Provides a clean, reusable Firestore API layer.
   Imported dynamically by features that need live DB access.

   Usage:
     import { getFirestoreDB, userDoc, userCollection }
       from './firestoreService.js';

     const db  = await getFirestoreDB();
     const ref = userDoc(db, uid, 'reminders', docId);
   ============================================================ */

'use strict';

/* ── Firebase SDK version (kept in one place) ────────────── */
const SDK_VERSION = '12.13.0';
const SDK_BASE    = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

/* ── Firebase project config ─────────────────────────────── */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBUjYH5qPD4EyPSgKhdKZySClnGip72ET0',
  authDomain:        'lifesync.qzz.io',
  projectId:         'lifesync-83346',
  storageBucket:     'lifesync-83346.firebasestorage.app',
  messagingSenderId: '592850266176',
  appId:             '1:592850266176:web:5544beb27aa475b36457a5',
  measurementId:     'G-8J130ZT1WK',
};

/* ── Module-level singletons ─────────────────────────────── */
let _app = null;
let _db  = null;
let _initPromise = null;

/* ══════════════════════════════════════════════════════════
   getFirestoreDB()
   Returns the shared Firestore instance (lazy init).
   Safe to call concurrently — init runs only once.
══════════════════════════════════════════════════════════ */
export async function getFirestoreDB () {
  if (_db) return _db;

  if (!_initPromise) {
    _initPromise = _initFirestore();
  }

  _db = await _initPromise;
  return _db;
}

async function _initFirestore () {
  const [{ initializeApp, getApps }, { getFirestore }] = await Promise.all([
    import(`${SDK_BASE}/firebase-app.js`),
    import(`${SDK_BASE}/firebase-firestore.js`),
  ]);

  /* Reuse existing Firebase app if already initialized */
  const existingApps = getApps();
  _app = existingApps.length > 0
    ? existingApps[0]
    : initializeApp(FIREBASE_CONFIG);

  return getFirestore(_app);
}

/* ══════════════════════════════════════════════════════════
   Path helpers
   All user data lives under: users/{uid}/...
══════════════════════════════════════════════════════════ */

/**
 * Returns a Firestore DocumentReference for a user-scoped document.
 * @param {Firestore} db
 * @param {string}    uid       - Firebase Auth UID
 * @param {string}    collection - sub-collection name (e.g. 'reminders')
 * @param {string}    docId
 */
export async function userDoc (db, uid, collectionName, docId) {
  const { doc } = await import(`${SDK_BASE}/firebase-firestore.js`);
  return doc(db, 'users', uid, collectionName, docId);
}

/**
 * Returns a Firestore CollectionReference for a user-scoped collection.
 */
export async function userCollection (db, uid, collectionName) {
  const { collection } = await import(`${SDK_BASE}/firebase-firestore.js`);
  return collection(db, 'users', uid, collectionName);
}

/* ══════════════════════════════════════════════════════════
   CRUD helpers
══════════════════════════════════════════════════════════ */

/** Get a document; returns null if not found */
export async function getDocument (db, ...pathSegments) {
  const { doc, getDoc } = await import(`${SDK_BASE}/firebase-firestore.js`);
  try {
    const ref  = doc(db, ...pathSegments);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    console.warn('[FirestoreService] getDocument error:', err.message);
    return null;
  }
}

/** Set (overwrite) a document */
export async function setDocument (db, data, ...pathSegments) {
  const { doc, setDoc, serverTimestamp } = await import(`${SDK_BASE}/firebase-firestore.js`);
  const ref = doc(db, ...pathSegments);
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

/** Update specific fields in a document */
export async function updateDocument (db, data, ...pathSegments) {
  const { doc, updateDoc, serverTimestamp } = await import(`${SDK_BASE}/firebase-firestore.js`);
  const ref = doc(db, ...pathSegments);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

/** Delete a document */
export async function deleteDocument (db, ...pathSegments) {
  const { doc, deleteDoc } = await import(`${SDK_BASE}/firebase-firestore.js`);
  const ref = doc(db, ...pathSegments);
  await deleteDoc(ref);
}

/** Add a document to a collection (auto ID) */
export async function addToCollection (db, data, ...collectionPath) {
  const { collection, addDoc, serverTimestamp } = await import(`${SDK_BASE}/firebase-firestore.js`);
  const ref = collection(db, ...collectionPath);
  return addDoc(ref, { ...data, createdAt: serverTimestamp() });
}

/** Get all documents in a collection */
export async function getCollection (db, ...collectionPath) {
  const { collection, getDocs } = await import(`${SDK_BASE}/firebase-firestore.js`);
  try {
    const ref  = collection(db, ...collectionPath);
    const snap = await getDocs(ref);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[FirestoreService] getCollection error:', err.message);
    return [];
  }
}

/**
 * Subscribe to real-time updates on a collection.
 * Returns an unsubscribe function.
 */
export async function subscribeCollection (db, callback, ...collectionPath) {
  const { collection, onSnapshot } = await import(`${SDK_BASE}/firebase-firestore.js`);
  const ref = collection(db, ...collectionPath);
  return onSnapshot(
    ref,
    (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(docs, null);
    },
    (err) => {
      console.warn('[FirestoreService] subscribeCollection error:', err.message);
      callback([], err);
    }
  );
}

/* ══════════════════════════════════════════════════════════
   Public config helpers (admin-set data readable by all)
══════════════════════════════════════════════════════════ */

/** Read a document from the publicConfig collection */
export async function getPublicConfig (db, docId) {
  return getDocument(db, 'publicConfig', docId);
}

/** Read a document from the appConfig collection */
export async function getAppConfig (db, docId) {
  return getDocument(db, 'appConfig', docId);
}

/* ══════════════════════════════════════════════════════════
   Offline-safe batch operations
══════════════════════════════════════════════════════════ */

/**
 * Writes multiple documents atomically.
 * @param {Firestore} db
 * @param {Array<{path: string[], data: object}>} operations
 */
export async function batchWrite (db, operations) {
  const { writeBatch, doc, serverTimestamp } = await import(`${SDK_BASE}/firebase-firestore.js`);
  const batch = writeBatch(db);
  const ts    = serverTimestamp();

  for (const op of operations) {
    const ref = doc(db, ...op.path);
    batch.set(ref, { ...op.data, updatedAt: ts }, { merge: true });
  }

  await batch.commit();
}

/* ══════════════════════════════════════════════════════════
   SDK version export (for diagnostics)
══════════════════════════════════════════════════════════ */
export const FIREBASE_SDK_VERSION = SDK_VERSION;
