// ══════════════════════════════════════════
//  LifeSync V2.1 — firebase-config.js
//  Firebase initialization + Auth + Firestore
// ══════════════════════════════════════════
import { initializeApp }                       from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence }
                                               from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider }
                                               from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app-check.js";
import { getFirestore, collection, getDocs, serverTimestamp, setDoc, doc, getDoc }
                                               from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage, isSupported as messagingSupported }
                                               from "https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging.js";
import { getAnalytics, logEvent }              from "https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js";

// ── Config ───────────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey:            "AIzaSyBUjYH5qPD4EyPSgKhdKZySClnGip72ET0",
  authDomain:        "lifesync-83346.firebaseapp.com",
  projectId:         "lifesync-83346",
  storageBucket:     "lifesync-83346.firebasestorage.app",
  messagingSenderId: "592850266176",
  appId:             "1:592850266176:web:5544beb27aa475b36457a5",
  measurementId:     "G-8J130ZT1WK"
};

export const VAPID_KEY      = 'BPd8SeQoVNRtTVvowT6ZdJvjjgFBFX38akouIAOTSadnVwx2zGFc9o5emUoeXMDWQ2ly-opKMhoCOcWVjHdDagk';
export const RECAPTCHA_KEY  = '6LceWeksAAAAADbwZh6ZIwhaxBMlGVOGMYNZwG90';

// ── Initialize ───────────────────────────────────────────────────────────────
export const fbApp    = initializeApp(firebaseConfig);
export const auth     = getAuth(fbApp);
export const db       = getFirestore(fbApp);
export const provider = new GoogleAuthProvider();

provider.addScope('profile');
provider.addScope('email');
provider.setCustomParameters({ prompt: 'select_account' });

// Persist login across sessions
setPersistence(auth, browserLocalPersistence).catch(() => {});

// ── Analytics ────────────────────────────────────────────────────────────────
export let analytics = null;
try {
  analytics = getAnalytics(fbApp);
  console.log('✓ Firebase Analytics');
} catch(e) { console.warn('Analytics init:', e.message); }

// ── App Check (reCAPTCHA v3, token auto-refresh) ─────────────────────────────
export function initAppCheck() {
  try {
    initializeAppCheck(fbApp, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_KEY),
      isTokenAutoRefreshEnabled: true
    });
    const badge = document.getElementById('appcheck-badge');
    if (badge) { badge.style.display = 'inline-flex'; badge.textContent = '🛡 Secure'; }
    console.log('✓ App Check (reCAPTCHA v3)');
  } catch(e) { console.warn('App Check:', e.message); }
}

// ── FCM Messaging setup ────────────────────────────────────────────────────
export async function initFCM() {
  try {
    const supported = await messagingSupported();
    if (!supported) { console.warn('FCM not supported in this browser'); return null; }
    const messaging = getMessaging(fbApp);
    onMessage(messaging, payload => {
      console.log('FCM foreground message:', payload);
      if (window.LifeSyncNotifications) {
        window.LifeSyncNotifications.handleFCMMessage(payload);
      }
    });
    return messaging;
  } catch(e) { console.warn('FCM init:', e.message); return null; }
}

// ── Firestore helpers ─────────────────────────────────────────────────────
export async function firestoreSaveUserData(uid, data) {
  try {
    await setDoc(doc(db, 'users', uid), { data, updatedAt: serverTimestamp() }, { merge: true });
  } catch(e) { console.warn('Firestore save:', e.message); }
}

export async function firestoreLoadUserData(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch(e) { console.warn('Firestore load:', e.message); return null; }
}

export { logEvent, analytics as _analytics };
export { GoogleAuthProvider, browserLocalPersistence, setPersistence };
export { getFirestore, collection, getDocs, serverTimestamp, setDoc, doc, getDoc };
export { getMessaging, getToken, onMessage, messagingSupported };
