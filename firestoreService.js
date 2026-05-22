/* ══════════════════════════════════════════════════════════════════════════
   LifeSync Premium — firestoreService.js
   Firebase v12 (Auth + Firestore + FCM + Analytics + App Check)

   Usage in index.html (already present):
     <script type="module">
       import './firestoreService.js';
     </script>

   OR keep the existing inline <script type="module"> block as-is —
   this file is the standalone extracted version for cleaner project structure.

   Firebase Project : lifesync-83346
   SDK version      : 12.13.0
   Supports         : Google Sign-In, Email/Password, Firestore CRUD,
                      FCM push tokens, Analytics event logging, App Check
══════════════════════════════════════════════════════════════════════════ */

// ── Firebase SDK v12 (ES Module, loaded from CDN) ────────────────────────────
import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';

import { initializeAppCheck, ReCaptchaV3Provider }
  from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app-check.js';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

import {
  getFirestore,
  collection,
  getDocs,
  serverTimestamp,
  setDoc,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

import {
  getMessaging,
  getToken,
  onMessage,
  isSupported as messagingSupported,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging.js';

import { getAnalytics, logEvent }
  from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js';

/* ════════════════════════════════════════════════════════════════════════════
   CONFIG — LifeSync Firebase Project
════════════════════════════════════════════════════════════════════════════ */
const firebaseConfig = {
  apiKey:            'AIzaSyBUjYH5qPD4EyPSgKhdKZySClnGip72ET0',
  authDomain:        'lifesync-83346.firebaseapp.com',
  projectId:         'lifesync-83346',
  storageBucket:     'lifesync-83346.firebasestorage.app',
  messagingSenderId: '592850266176',
  appId:             '1:592850266176:web:5544beb27aa475b36457a5',
  measurementId:     'G-8J130ZT1WK',
};

// FCM VAPID key (Web Push certificate)
const VAPID_KEY    = 'BPd8SeQoVNRtTVvowT6ZdJvjjgFBFX38akouIAOTSadnVwx2zGFc9o5emUoeXMDWQ2ly-opKMhoCOcWVjHdDagk';

// reCAPTCHA v3 site key (App Check)
const RECAPTCHA_KEY = '6LceWeksAAAAADbwZh6ZIwhaxBMlGVOGMYNZwG90';

/* ════════════════════════════════════════════════════════════════════════════
   INITIALIZE FIREBASE
════════════════════════════════════════════════════════════════════════════ */
const fbApp    = initializeApp(firebaseConfig);
const auth     = getAuth(fbApp);
const db       = getFirestore(fbApp);
const provider = new GoogleAuthProvider();

// Google provider settings
provider.addScope('profile');
provider.addScope('email');
provider.setCustomParameters({ prompt: 'select_account' });

// Persist auth session across browser restarts
setPersistence(auth, browserLocalPersistence).catch(() => {});

/* ── Analytics ─────────────────────────────────────────────────────────────── */
let analytics = null;
try {
  analytics = getAnalytics(fbApp);
  console.log('[LifeSync] ✓ Analytics initialized');
} catch (e) {
  console.warn('[LifeSync] Analytics init skipped:', e.message);
}

/* ── App Check (reCAPTCHA v3) ─────────────────────────────────────────────── */
try {
  initializeAppCheck(fbApp, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  // Show shield badge in UI
  const badge = document.getElementById('appcheck-badge');
  if (badge) { badge.style.display = 'inline-flex'; badge.textContent = '🛡 Secure'; }
  console.log('[LifeSync] ✓ App Check (reCAPTCHA v3) active');
} catch (e) {
  console.warn('[LifeSync] App Check skipped:', e.message);
}

/* ════════════════════════════════════════════════════════════════════════════
   UTILITY HELPERS
════════════════════════════════════════════════════════════════════════════ */

/** Show a toast notification using the app's global showToast if available */
function safeToast(msg) {
  if (typeof window.showToast === 'function') window.showToast(msg);
  else console.log('[LifeSync Toast]', msg);
}

/** Map Firebase auth error codes to user-friendly messages */
function getAuthErrorMessage(code) {
  const map = {
    'auth/email-already-in-use':    '📧 Email already registered. Try Login.',
    'auth/weak-password':           '🔑 Password must be at least 6 characters.',
    'auth/invalid-email':           '📧 Invalid email address.',
    'auth/user-not-found':          '👤 No account found. Try Sign Up.',
    'auth/wrong-password':          '🔑 Wrong password. Try again.',
    'auth/invalid-credential':      '🔑 Invalid email or password.',
    'auth/too-many-requests':       '⏳ Too many attempts. Try again later.',
    'auth/popup-closed-by-user':    '❌ Sign-in popup closed. Try again.',
    'auth/cancelled-popup-request': '❌ Another login is in progress. Please wait.',
    'auth/popup-blocked':           '🚫 Popup blocked. Using redirect instead…',
    'auth/network-request-failed':  '📡 Network error. Check your connection.',
    'auth/requires-recent-login':   '🔒 Please log in again to complete this action.',
    'auth/account-exists-with-different-credential':
                                    '📧 Account exists with another provider.',
  };
  return map[code] || '⚠️ ' + (code || 'Auth error. Please try again.');
}

/** Render avatar element — photo URL if available, otherwise initials */
function setAvatarEl(el, user) {
  if (!el) return;
  const name     = user.displayName || 'LifeSync User';
  const initials = name.split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  if (user.photoURL) {
    el.innerHTML = `<img
      src="${user.photoURL}"
      alt="avatar"
      style="width:100%;height:100%;object-fit:cover;border-radius:50%;"
      onerror="this.parentElement.textContent='${initials}'"
    />`;
  } else {
    el.textContent = initials;
  }
}

/** Green glow animation on profile card after login */
function playLoginAnimation() {
  const ring = document.getElementById('prof-success-ring');
  const card = document.getElementById('profile-card-inner');
  if (!ring || !card) return;
  card.style.transition = 'box-shadow 0.25s';
  card.style.boxShadow  = '0 0 0 2px rgba(0,230,118,0.9), 0 0 32px rgba(0,230,118,0.4)';
  ring.style.transition = 'all 0.25s ease-out';
  ring.style.border     = '2px solid rgba(0,230,118,0.9)';
  ring.style.inset      = '-5px';
  ring.style.borderRadius = '26px';
  ring.style.opacity    = '1';
  setTimeout(() => {
    card.style.boxShadow  = '';
    ring.style.transition = 'all 0.7s ease-out';
    ring.style.opacity    = '0';
    ring.style.border     = '2px solid rgba(0,230,118,0)';
  }, 700);
}

/* ════════════════════════════════════════════════════════════════════════════
   AUTH UI — update all UI elements after login / logout
════════════════════════════════════════════════════════════════════════════ */
function updateAuthUI(user) {
  window.firebaseUser = user;

  // Guard: DOM may not be ready yet (onAuthStateChanged can fire early)
  if (!document.getElementById('fb-logged-in')) {
    const retry = () => updateAuthUI(user);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', retry, { once: true });
    } else {
      setTimeout(retry, 0);
    }
    return;
  }

  const loggedIn   = document.getElementById('fb-logged-in');
  const loggedOut  = document.getElementById('fb-not-logged-in');
  const fbUsername = document.getElementById('fb-username');
  const fbEmail    = document.getElementById('fb-user-email');
  const fbAvatar   = document.getElementById('fb-avatar-initials');
  const profName   = document.getElementById('prof-name');
  const profEmail  = document.getElementById('prof-email');
  const profAvatar = document.getElementById('prof-avatar');
  const profCard   = document.getElementById('profile-card');

  if (user) {
    const name  = user.displayName || 'LifeSync User';
    const email = user.email || '';

    if (loggedIn)   loggedIn.style.display  = '';
    if (loggedOut)  loggedOut.style.display = 'none';
    if (fbUsername) fbUsername.textContent  = name;
    if (fbEmail)    fbEmail.textContent     = email;
    if (profCard)   profCard.style.display  = '';
    if (profName)   profName.textContent    = name;
    if (profEmail)  profEmail.textContent   = email;

    setAvatarEl(fbAvatar,   user);
    setAvatarEl(profAvatar, user);

    // Animate only on fresh login (not silent session restore)
    const isRestore = Boolean(window._authUIFirstRun);
    window._authUIFirstRun = true;
    if (!isRestore) setTimeout(playLoginAnimation, 80);

    if (analytics) logEvent(analytics, 'login', {
      method: user.providerData[0]?.providerId || 'unknown',
    });
  } else {
    window._authUIFirstRun = false;
    if (loggedIn)   loggedIn.style.display  = 'none';
    if (loggedOut)  loggedOut.style.display = '';
    if (profCard)   profCard.style.display  = 'none';
    if (fbAvatar)   fbAvatar.innerHTML      = '?';
    if (profAvatar) profAvatar.innerHTML    = '?';
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   FIRESTORE — User Profile
════════════════════════════════════════════════════════════════════════════ */

/**
 * Save / merge user profile document to Firestore.
 * Collection: users/{uid}
 */
async function saveUserProfile(user) {
  if (!user) return;
  try {
    await setDoc(
      doc(db, 'users', user.uid),
      {
        uid:         user.uid,
        displayName: user.displayName || '',
        email:       user.email       || '',
        photoURL:    user.photoURL    || '',
        lastLogin:   serverTimestamp(),
        platform:    navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
        appVersion:  'v2.1',
      },
      { merge: true }
    );
  } catch (e) {
    console.warn('[LifeSync] Profile save error:', e.message);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   FIRESTORE — Reminders CRUD
   Collection: users/{uid}/reminders/{reminderId}
════════════════════════════════════════════════════════════════════════════ */

/**
 * Save (create or update) a single reminder to Firestore.
 * @param {Object} obj - Reminder object (must have .id field)
 */
async function fbSaveReminder(obj) {
  if (!window.firebaseUser) return;
  try {
    await setDoc(
      doc(db, 'users', window.firebaseUser.uid, 'reminders', String(obj.id)),
      {
        ...obj,
        updatedAt: serverTimestamp(),
        syncedFrom: 'web',
      },
      { merge: true }
    );
    console.log('[LifeSync] ✓ Reminder synced:', obj.title);
  } catch (e) {
    console.warn('[LifeSync] fbSaveReminder error:', e.message);
  }
}

/**
 * Load all reminders from Firestore and merge into local app data.
 * New cloud reminders that don't exist locally are appended.
 */
async function fbLoadReminders() {
  if (!window.firebaseUser) return;
  try {
    const snap = await getDocs(
      collection(db, 'users', window.firebaseUser.uid, 'reminders')
    );
    if (!snap.empty) {
      let added = 0;
      snap.forEach((docSnap) => {
        const fr = docSnap.data();
        // Merge: only add if not already in local app data
        if (!window.app?.reminders?.find((r) => r.id === fr.id)) {
          if (window.app?.reminders) {
            window.app.reminders.push(fr);
            added++;
          }
        }
      });

      if (added > 0 && typeof window.saveData === 'function') {
        window.saveData(true); // silent save
      }
      if (typeof window.renderPage === 'function' && window.currentPage) {
        window.renderPage(window.currentPage);
      }
      if (added > 0) safeToast(`☁️ ${added} reminder${added > 1 ? 's' : ''} synced from cloud!`);
      else safeToast('☁️ Cloud sync up to date');
    }
  } catch (e) {
    console.warn('[LifeSync] fbLoadReminders error:', e.message);
  }
}

/**
 * Delete a reminder from Firestore.
 * @param {number|string} id - Reminder id
 */
async function fbDeleteReminder(id) {
  if (!window.firebaseUser) return;
  try {
    await deleteDoc(
      doc(db, 'users', window.firebaseUser.uid, 'reminders', String(id))
    );
    console.log('[LifeSync] ✓ Reminder deleted from cloud:', id);
  } catch (e) {
    console.warn('[LifeSync] fbDeleteReminder error:', e.message);
  }
}

/**
 * Sync ALL local reminders to Firestore (bulk upload).
 * Useful on first login or after offline edits.
 */
async function fbSyncAllReminders() {
  if (!window.firebaseUser || !window.app?.reminders?.length) return;
  try {
    const reminders = window.app.reminders;
    await Promise.all(
      reminders.map((r) =>
        setDoc(
          doc(db, 'users', window.firebaseUser.uid, 'reminders', String(r.id)),
          { ...r, updatedAt: serverTimestamp() },
          { merge: true }
        )
      )
    );
    safeToast(`☁️ ${reminders.length} reminders backed up!`);
    console.log('[LifeSync] ✓ All reminders synced');
  } catch (e) {
    console.warn('[LifeSync] fbSyncAllReminders error:', e.message);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   FIRESTORE — Habits Backup
   Collection: users/{uid}/habits/{habitId}
════════════════════════════════════════════════════════════════════════════ */

/**
 * Save all habits to Firestore (backup).
 */
async function fbSyncHabits() {
  if (!window.firebaseUser || !window.app?.habits?.length) return;
  try {
    await Promise.all(
      window.app.habits.map((h) =>
        setDoc(
          doc(db, 'users', window.firebaseUser.uid, 'habits', String(h.id)),
          { ...h, updatedAt: serverTimestamp() },
          { merge: true }
        )
      )
    );
    console.log('[LifeSync] ✓ Habits backed up');
  } catch (e) {
    console.warn('[LifeSync] fbSyncHabits error:', e.message);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   FIRESTORE — Expenses Backup
   Collection: users/{uid}/expenses/{expenseId}
════════════════════════════════════════════════════════════════════════════ */

/**
 * Save all expenses to Firestore.
 */
async function fbSyncExpenses() {
  if (!window.firebaseUser || !window.app?.expenses?.length) return;
  try {
    await Promise.all(
      window.app.expenses.map((e) =>
        setDoc(
          doc(db, 'users', window.firebaseUser.uid, 'expenses', String(e.id)),
          { ...e, updatedAt: serverTimestamp() },
          { merge: true }
        )
      )
    );
    console.log('[LifeSync] ✓ Expenses backed up');
  } catch (e) {
    console.warn('[LifeSync] fbSyncExpenses error:', e.message);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   FCM — Firebase Cloud Messaging (Push Notifications)
════════════════════════════════════════════════════════════════════════════ */

/**
 * Initialize FCM, request permission, get token, save to Firestore,
 * and listen for foreground messages.
 */
async function initFCM() {
  try {
    const supported = await messagingSupported();
    if (!supported) {
      console.log('[LifeSync] FCM not supported on this browser.');
      return;
    }

    const messaging = getMessaging(fbApp);

    // Check notification permission
    if (typeof Notification === 'undefined') return;
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm !== 'granted') {
      console.log('[LifeSync] Notification permission denied — FCM skipped.');
      return;
    }

    // Get FCM token
    const token = await getToken(messaging, { vapidKey: VAPID_KEY }).catch(() => null);
    if (token) {
      window.fcmToken = token;
      console.log('[LifeSync] ✓ FCM token obtained');

      // Save token to Firestore (linked to current user)
      if (window.firebaseUser) {
        await setDoc(
          doc(db, 'users', window.firebaseUser.uid, 'tokens', 'fcm'),
          {
            token,
            updatedAt:  serverTimestamp(),
            userAgent:  navigator.userAgent,
            platform:   navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
          },
          { merge: true }
        );
        console.log('[LifeSync] ✓ FCM token saved to Firestore');
      }
    }

    // Handle foreground push messages (app is open)
    onMessage(messaging, (payload) => {
      console.log('[LifeSync] Foreground FCM message:', payload);
      const title = payload.notification?.title || payload.data?.title || 'LifeSync';
      const body  = payload.notification?.body  || payload.data?.body  || 'New notification';

      // Use app's notification system if available
      if (typeof window.sendBrowserNotif === 'function') {
        window.sendBrowserNotif(title, body);
      } else {
        safeToast('🔔 ' + title);
      }

      // Track in analytics
      if (analytics) logEvent(analytics, 'notification_received', { title });
    });

    console.log('[LifeSync] ✓ FCM Messaging ready');
  } catch (e) {
    console.warn('[LifeSync] FCM init error:', e.message);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   AUTH — Google Sign-In (popup with redirect fallback for mobile)
════════════════════════════════════════════════════════════════════════════ */
async function googleLogin() {
  const btn = document.getElementById('btn-google-login');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Signing in…'; }

  try {
    const result = await signInWithPopup(auth, provider);
    await saveUserProfile(result.user);
    updateAuthUI(result.user);
    await fbLoadReminders();
    await initFCM();
    safeToast('Welcome ' + (result.user.displayName || 'back') + '! 🎉');
    if (analytics) logEvent(analytics, 'login', { method: 'google' });
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
      // Mobile popup blocked → fallback to redirect
      safeToast('📱 Using redirect login…');
      try { await signInWithRedirect(auth, provider); }
      catch (re) { safeToast(getAuthErrorMessage(re.code)); }
    } else if (e.code === 'auth/cancelled-popup-request') {
      safeToast('⏳ Previous login in progress, please wait…');
    } else {
      safeToast(getAuthErrorMessage(e.code));
      console.warn('[LifeSync] Google login error:', e.code, e.message);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'G  Login with Google'; }
  }
}

/* ── Email Sign Up ─────────────────────────────────────────────────────────── */
async function emailSignup() {
  const email = (document.getElementById('fb-email')?.value  || '').trim();
  const pass  = (document.getElementById('fb-pass')?.value   || '');
  const name  = (document.getElementById('fb-name')?.value   || '').trim();

  if (!email || !pass) { safeToast('📧 Enter email and password'); return; }

  const btn = document.getElementById('btn-signup');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Creating account…'; }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (name) await updateProfile(cred.user, { displayName: name });

    await saveUserProfile({ ...cred.user, displayName: name || cred.user.displayName });
    updateAuthUI(auth.currentUser);
    await initFCM();
    if (analytics) logEvent(analytics, 'sign_up', { method: 'email' });
    safeToast('🎉 Account created! Welcome to LifeSync!');
  } catch (e) {
    safeToast(getAuthErrorMessage(e.code));
    console.warn('[LifeSync] Signup error:', e.code);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Sign Up'; }
  }
}

/* ── Email Login ───────────────────────────────────────────────────────────── */
async function emailLogin() {
  const email = (document.getElementById('fb-email')?.value || '').trim();
  const pass  = (document.getElementById('fb-pass')?.value  || '');

  if (!email || !pass) { safeToast('📧 Enter email and password'); return; }

  const btn = document.getElementById('btn-login');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Logging in…'; }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await saveUserProfile(cred.user);
    updateAuthUI(cred.user);
    await fbLoadReminders();
    await initFCM();
    safeToast('✓ Logged in! Welcome back!');
  } catch (e) {
    safeToast(getAuthErrorMessage(e.code));
    console.warn('[LifeSync] Email login error:', e.code);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
  }
}

/* ── Logout ────────────────────────────────────────────────────────────────── */
async function fbLogout() {
  try {
    await signOut(auth);
    updateAuthUI(null);
    window.firebaseUser = null;
    window.fcmToken     = null;
    safeToast('👋 Logged out successfully');
    if (analytics) logEvent(analytics, 'logout');
  } catch (e) {
    safeToast('Logout error: ' + e.message);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   AUTH STATE OBSERVER — auto-restore session on page load
════════════════════════════════════════════════════════════════════════════ */

// Handle redirect result (Google sign-in on mobile)
getRedirectResult(auth)
  .then(async (result) => {
    if (result?.user) {
      await saveUserProfile(result.user);
      updateAuthUI(result.user);
      await fbLoadReminders();
      safeToast('Welcome ' + (result.user.displayName || 'back') + '! 🎉');
    }
  })
  .catch((e) => {
    // auth/no-auth-event is normal when not coming from a redirect
    if (e.code !== 'auth/no-auth-event') {
      console.warn('[LifeSync] Redirect result error:', e.message);
    }
  });

// Main auth state listener — fires on page load and on every auth change
onAuthStateChanged(auth, async (user) => {
  updateAuthUI(user);
  if (user) {
    await fbLoadReminders();
    // FCM in background — don't block UI
    initFCM().catch(() => {});
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   ANALYTICS HELPERS — track key app events
════════════════════════════════════════════════════════════════════════════ */

/**
 * Log a custom event to Firebase Analytics.
 * @param {string} eventName
 * @param {Object} [params]
 */
function trackEvent(eventName, params = {}) {
  if (!analytics) return;
  try { logEvent(analytics, eventName, params); } catch (e) {}
}

/* ════════════════════════════════════════════════════════════════════════════
   EXPOSE ALL FUNCTIONS TO window (required by inline HTML onclick handlers)
════════════════════════════════════════════════════════════════════════════ */
window.googleLogin       = googleLogin;
window.emailSignup       = emailSignup;
window.emailLogin        = emailLogin;
window.fbLogout          = fbLogout;
window.fbSaveReminder    = fbSaveReminder;
window.fbLoadReminders   = fbLoadReminders;
window.fbDeleteReminder  = fbDeleteReminder;
window.fbSyncAllReminders = fbSyncAllReminders;
window.fbSyncHabits      = fbSyncHabits;
window.fbSyncExpenses    = fbSyncExpenses;
window.trackEvent        = trackEvent;

console.log('[LifeSync] ✓ firestoreService.js — Firebase v12 ready');
