// ══════════════════════════════════════════
// LifeSync V2.2 — firebase-config.js
// Ultra Firebase System
// Auth • Firestore • FCM • Cloud Sync
// Replace FULL old firebase-config.js
// ══════════════════════════════════════════

// ────────────────────────────────────────
// IMPORTS
// ────────────────────────────────────────

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app-check.js";

import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  getDocs,
  serverTimestamp,
  setDoc,
  doc,
  getDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

import {
  getMessaging,
  getToken,
  onMessage,
  isSupported as messagingSupported
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging.js";

import {
  getAnalytics,
  logEvent
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js";

// ────────────────────────────────────────
// FIREBASE CONFIG
// ────────────────────────────────────────

export const firebaseConfig = {

  apiKey:
    "AIzaSyBUjYH5qPD4EyPSgKhdKZySClnGip72ET0",

  authDomain:
    "lifesync-83346.firebaseapp.com",

  projectId:
    "lifesync-83346",

  storageBucket:
    "lifesync-83346.firebasestorage.app",

  messagingSenderId:
    "592850266176",

  appId:
    "1:592850266176:web:5544beb27aa475b36457a5",

  measurementId:
    "G-8J130ZT1WK"

};

export const VAPID_KEY =
  'BPd8SeQoVNRtTVvowT6ZdJvjjgFBFX38akouIAOTSadnVwx2zGFc9o5emUoeXMDWQ2ly-opKMhoCOcWVjHdDagk';

export const RECAPTCHA_KEY =
  '6LceWeksAAAAADbwZh6ZIwhaxBMlGVOGMYNZwG90';

// ────────────────────────────────────────
// INITIALIZE
// ────────────────────────────────────────

export const fbApp =
  initializeApp(firebaseConfig);

export const auth =
  getAuth(fbApp);

export const db =
  getFirestore(fbApp);

export const provider =
  new GoogleAuthProvider();

// ────────────────────────────────────────
// OFFLINE FIRESTORE
// ────────────────────────────────────────

enableIndexedDbPersistence(db)

  .then(() => {

    console.log(
      '🔥 Firestore Offline Enabled'
    );

  })

  .catch(err => {

    console.warn(
      'Offline Cache:',
      err.message
    );

  });

// ────────────────────────────────────────
// GOOGLE LOGIN
// ────────────────────────────────────────

provider.addScope('profile');
provider.addScope('email');

provider.setCustomParameters({
  prompt:'select_account'
});

// PERSIST LOGIN
setPersistence(
  auth,
  browserLocalPersistence
).catch(() => {});

// ────────────────────────────────────────
// ANALYTICS
// ────────────────────────────────────────

export let analytics = null;

try {

  analytics =
    getAnalytics(fbApp);

  console.log(
    '📊 Analytics Ready'
  );

} catch(err) {

  console.warn(
    'Analytics:',
    err.message
  );

}

// ────────────────────────────────────────
// APP CHECK
// ────────────────────────────────────────

export function initAppCheck() {

  try {

    initializeAppCheck(fbApp, {

      provider:
        new ReCaptchaV3Provider(
          RECAPTCHA_KEY
        ),

      isTokenAutoRefreshEnabled:true

    });

    console.log(
      '🛡 App Check Ready'
    );

  } catch(err) {

    console.warn(
      'App Check:',
      err.message
    );

  }

}

// ────────────────────────────────────────
// FCM
// ────────────────────────────────────────

export async function initFCM() {

  try {

    const supported =
      await messagingSupported();

    if (!supported) {

      console.warn(
        '⚠️ FCM Not Supported'
      );

      return null;
    }

    const messaging =
      getMessaging(fbApp);

    onMessage(
      messaging,
      payload => {

        console.log(
          '📩 Foreground Notification',
          payload
        );

        window
          .LifeSyncNotifications
          ?.handleFCMMessage(payload);

      }
    );

    return messaging;

  } catch(err) {

    console.warn(
      'FCM:',
      err.message
    );

    return null;
  }

}

// ────────────────────────────────────────
// SAVE FCM TOKEN
// ────────────────────────────────────────

export async function saveFCMToken(uid) {

  try {

    const supported =
      await messagingSupported();

    if (!supported) return;

    const messaging =
      getMessaging(fbApp);

    const token =
      await getToken(
        messaging,
        {
          vapidKey:VAPID_KEY
        }
      );

    if (!token) return;

    await setDoc(

      doc(db, 'fcmTokens', uid),

      {

        token,

        updatedAt:
          serverTimestamp()

      },

      { merge:true }

    );

    console.log(
      '✅ FCM Token Saved'
    );

  } catch(err) {

    console.warn(
      'FCM Token:',
      err.message
    );

  }

}

// ────────────────────────────────────────
// FIRESTORE SAVE
// ────────────────────────────────────────

export async function firestoreSaveUserData(
  uid,
  data
) {

  try {

    await setDoc(

      doc(db, 'users', uid),

      {

        data,

        updatedAt:
          serverTimestamp()

      },

      { merge:true }

    );

    console.log(
      '☁️ Firestore Saved'
    );

  } catch(err) {

    console.warn(
      'Firestore Save:',
      err.message
    );

  }

}

// ────────────────────────────────────────
// FIRESTORE LOAD
// ────────────────────────────────────────

export async function firestoreLoadUserData(
  uid
) {

  try {

    const snap =
      await getDoc(
        doc(db, 'users', uid)
      );

    if (snap.exists()) {

      return snap.data();

    }

    return null;

  } catch(err) {

    console.warn(
      'Firestore Load:',
      err.message
    );

    return null;
  }

}

// ────────────────────────────────────────
// REALTIME SYNC
// ────────────────────────────────────────

export function realtimeUserSync(
  uid,
  callback
) {

  return onSnapshot(

    doc(db, 'users', uid),

    snap => {

      if (snap.exists()) {

        callback?.(
          snap.data()
        );

      }

    },

    err => {

      console.warn(
        'Realtime Sync:',
        err.message
      );

    }

  );

}

// ────────────────────────────────────────
// AUTO CLOUD BACKUP
// ────────────────────────────────────────

export async function autoCloudBackup() {

  try {

    const user =
      auth.currentUser;

    if (!user) return;

    await firestoreSaveUserData(
      user.uid,
      window.app
    );

    console.log(
      '☁️ Cloud Backup Complete'
    );

  } catch(err) {

    console.warn(
      'Cloud Backup:',
      err.message
    );

  }

}

// AUTO BACKUP
setInterval(() => {

  autoCloudBackup();

}, 1000 * 60 * 5);

// ────────────────────────────────────────
// AUTH STATE
// ────────────────────────────────────────

onAuthStateChanged(
  auth,
  async user => {

    if (user) {

      console.log(
        '✅ Logged In:',
        user.email
      );

      window.currentUser =
        user;

      window.showToast?.(
        `👋 Welcome ${
          user.displayName || 'User'
        }`
      );

      // SAVE TOKEN
      saveFCMToken(user.uid);

      // LOAD CLOUD DATA
      const cloud =
        await firestoreLoadUserData(
          user.uid
        );

      if (
        cloud &&
        cloud.data
      ) {

        window.app =
          Object.assign(
            {},
            window.app,
            cloud.data
          );

        window.renderHome?.();
        window.renderReminders?.();
        window.renderCalendar?.();

        console.log(
          '☁️ Cloud Data Loaded'
        );

      }

    } else {

      console.log(
        '⚠️ Logged Out'
      );

    }

  }
);

// ────────────────────────────────────────
// DEVICE INFO
// ────────────────────────────────────────

export const deviceInfo = {

  userAgent:
    navigator.userAgent,

  language:
    navigator.language,

  platform:
    navigator.platform

};

// ────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────

export {
  logEvent,
  analytics as _analytics
};

export {
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence
};

export {
  getFirestore,
  collection,
  getDocs,
  serverTimestamp,
  setDoc,
  doc,
  getDoc
};

export {
  getMessaging,
  getToken,
  onMessage,
  messagingSupported
};

console.log(
  '🔥 Firebase V2.2 Ultra Ready'
);
