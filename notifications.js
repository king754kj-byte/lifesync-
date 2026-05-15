// ══════════════════════════════════════════
//  LifeSync V2.1 — notifications.js
//  Smart Notifications, Sounds & Vibration
// ══════════════════════════════════════════

class LifeSyncNotificationManager {
  constructor() {
    this.supported     = 'Notification' in window;
    this.permission    = this.supported ? Notification.permission : 'denied';
    this.audioCtx      = null;
    this.soundEnabled  = true;
    this.vibEnabled    = true;
    this._init();
  }

  // ── Init & Permission ────────────────────────────────────────────────────
  _init() {
    // Lazy-init AudioContext on first user gesture to comply with autoplay policies
    const unlockAudio = () => {
      if (!this.audioCtx) {
        try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch(e) {}
      }
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click',      unlockAudio);
    };
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('click',      unlockAudio, { once: true });

    // Restore settings from localStorage
    try {
      const ns = JSON.parse(localStorage.getItem('ls_notif_settings') || '{}');
      this.soundEnabled = ns.sound  !== false;
      this.vibEnabled   = ns.vibrate !== false;
    } catch(e) {}
  }

  async requestPermission() {
    if (!this.supported) return 'denied';
    try {
      this.permission = await Notification.requestPermission();
      return this.permission;
    } catch(e) { return 'denied'; }
  }

  // ── Sounds (Web Audio API — no external files needed) ───────────────────
  _getAudioCtx() {
    if (!this.audioCtx) {
      try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { return null; }
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
    return this.audioCtx;
  }

  playSound(type = 'default') {
    if (!this.soundEnabled) return;
    const ctx = this._getAudioCtx();
    if (!ctx) return;

    const sounds = {
      default:  [{ freq:523, dur:0.12, type:'sine' }, { freq:659, dur:0.15, type:'sine', delay:0.1 }],
      urgent:   [{ freq:880, dur:0.08, type:'sawtooth' }, { freq:880, dur:0.08, type:'sawtooth', delay:0.12 }, { freq:1046, dur:0.15, type:'sine', delay:0.28 }],
      success:  [{ freq:523, dur:0.10, type:'sine' }, { freq:659, dur:0.10, type:'sine', delay:0.1 }, { freq:784, dur:0.18, type:'sine', delay:0.22 }],
      snooze:   [{ freq:349, dur:0.15, type:'sine' }, { freq:294, dur:0.2, type:'sine', delay:0.18 }],
      complete: [{ freq:784, dur:0.08, type:'triangle' }, { freq:1047, dur:0.08, type:'triangle', delay:0.1 }, { freq:1319, dur:0.18, type:'triangle', delay:0.22 }],
      missed:   [{ freq:196, dur:0.25, type:'sawtooth' }, { freq:147, dur:0.25, type:'sawtooth', delay:0.3 }],
    };

    const seq = sounds[type] || sounds.default;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.25, ctx.currentTime);
    masterGain.connect(ctx.destination);

    seq.forEach(({ freq, dur, type: wt, delay = 0 }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(masterGain);

      osc.type      = wt;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.6, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime  + delay + dur + 0.01);
    });
  }

  // ── Vibration ─────────────────────────────────────────────────────────────
  vibrate(pattern = [100]) {
    if (!this.vibEnabled) return;
    if (!('vibrate' in navigator)) return;
    try { navigator.vibrate(pattern); } catch(e) {}
  }

  vibrateUrgent()  { this.vibrate([100, 50, 100, 50, 200]); }
  vibrateSuccess() { this.vibrate([50, 30, 80]); }
  vibrateMissed()  { this.vibrate([200, 100, 200]); }

  // ── Browser Notifications ────────────────────────────────────────────────
  send(title, body, opts = {}) {
    const {
      icon    = '🔔',
      tag     = 'lifesync-notif',
      urgency = 'normal',  // 'urgent' | 'normal' | 'low'
      sound   = true,
      vibrate = true,
      onLog   = null,
    } = opts;

    // In-app notification log
    if (typeof window !== 'undefined' && window.app) {
      if (!window.app.notifications) window.app.notifications = [];
      const entry = {
        id:      (window.nextId || (() => Date.now()))(),
        title,
        body,
        time:    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        urgency,
        read:    false,
      };
      window.app.notifications.unshift(entry);
      if (window.app.notifications.length > 80) window.app.notifications.pop();
      if (typeof window.saveData === 'function') window.saveData();
      if (typeof window.updateNotifBadge === 'function') window.updateNotifBadge();
      if (onLog) onLog(entry);
    }

    // Sound & vibration based on urgency
    if (sound) {
      const soundMap = { urgent: 'urgent', normal: 'default', low: 'snooze' };
      this.playSound(soundMap[urgency] || 'default');
    }
    if (vibrate) {
      if      (urgency === 'urgent') this.vibrateUrgent();
      else if (urgency === 'normal') this.vibrate([80]);
    }

    // System notification
    if (this.supported && this.permission === 'granted') {
      try {
        new Notification('LifeSync: ' + title, {
          body,
          tag,
          icon: './icon-192.png',
          badge: './icon-192.png',
          vibrate: vibrate ? [100, 50, 100] : undefined,
          silent: !sound,
        });
      } catch(e) { console.warn('Notification send:', e.message); }
    }
  }

  // ── FCM incoming message handler ──────────────────────────────────────────
  handleFCMMessage(payload) {
    const { title = 'LifeSync', body = '' } = payload.notification || {};
    this.send(title, body, { urgency: 'urgent' });
  }

  // ── Settings persistence ─────────────────────────────────────────────────
  saveSettings() {
    localStorage.setItem('ls_notif_settings', JSON.stringify({
      sound:   this.soundEnabled,
      vibrate: this.vibEnabled,
    }));
  }

  toggleSound(on) {
    this.soundEnabled = on;
    this.saveSettings();
    this.playSound(on ? 'success' : null);
  }

  toggleVibrate(on) {
    this.vibEnabled = on;
    this.saveSettings();
    if (on) this.vibrate([80]);
  }
}

// ── Export singleton ─────────────────────────────────────────────────────────
window.LifeSyncNotifications = new LifeSyncNotificationManager();
export default window.LifeSyncNotifications;
