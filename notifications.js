// ══════════════════════════════════════════
// LifeSync V2.2 — notifications.js
// Smart Notifications, Sounds & Vibration
// ══════════════════════════════════════════

class LifeSyncNotificationManager {

  constructor() {

    this.supported  = 'Notification' in window;
    this.permission = this.supported
      ? Notification.permission
      : 'denied';

    this.audioCtx = null;

    this.soundEnabled = true;
    this.vibEnabled   = true;

    this.cooldowns = {};

    this.quietHours = {
      start: 23,
      end: 7
    };

    this._init();
  }

  // ───────────────────────────────────────
  // INIT
  // ───────────────────────────────────────

  _init() {

    const unlockAudio = () => {

      if (!this.audioCtx) {

        try {

          this.audioCtx =
            new (
              window.AudioContext ||
              window.webkitAudioContext
            )();

        } catch(e) {}
      }

      document.removeEventListener(
        'touchstart',
        unlockAudio
      );

      document.removeEventListener(
        'click',
        unlockAudio
      );
    };

    document.addEventListener(
      'touchstart',
      unlockAudio,
      { once:true }
    );

    document.addEventListener(
      'click',
      unlockAudio,
      { once:true }
    );

    try {

      const saved = JSON.parse(
        localStorage.getItem(
          'ls_notif_settings'
        ) || '{}'
      );

      this.soundEnabled =
        saved.sound !== false;

      this.vibEnabled =
        saved.vibrate !== false;

    } catch(e) {}

    if (
      this.supported &&
      this.permission === 'default'
    ) {

      setTimeout(() => {
        this.requestPermission();
      }, 2500);
    }
  }

  // ───────────────────────────────────────
  // QUIET MODE
  // ───────────────────────────────────────

  isQuietTime() {

    const hour = new Date().getHours();

    return (
      hour >= this.quietHours.start ||
      hour < this.quietHours.end
    );
  }

  canNotify(tag) {

    const now = Date.now();

    if (!this.cooldowns[tag]) {

      this.cooldowns[tag] = now;

      return true;
    }

    const diff =
      now - this.cooldowns[tag];

    if (diff > 1000 * 60 * 30) {

      this.cooldowns[tag] = now;

      return true;
    }

    return false;
  }

  // ───────────────────────────────────────
  // PERMISSION
  // ───────────────────────────────────────

  async requestPermission() {

    if (!this.supported)
      return 'denied';

    try {

      this.permission =
        await Notification.requestPermission();

      return this.permission;

    } catch(e) {

      return 'denied';
    }
  }

  // ───────────────────────────────────────
  // AUDIO
  // ───────────────────────────────────────

  _getAudioCtx() {

    if (!this.audioCtx) {

      try {

        this.audioCtx =
          new (
            window.AudioContext ||
            window.webkitAudioContext
          )();

      } catch(e) {

        return null;
      }
    }

    if (
      this.audioCtx.state === 'suspended'
    ) {

      this.audioCtx.resume()
        .catch(() => {});
    }

    return this.audioCtx;
  }

  playSound(type = 'default') {

    if (!this.soundEnabled)
      return;

    if (
      localStorage.getItem(
        'lifesync_quiet'
      ) === 'true'
    ) return;

    const ctx = this._getAudioCtx();

    if (!ctx) return;

    const sounds = {

      default: [
        {
          freq:523,
          dur:0.12,
          type:'sine'
        },
        {
          freq:659,
          dur:0.15,
          type:'sine',
          delay:0.1
        }
      ],

      urgent: [
        {
          freq:880,
          dur:0.08,
          type:'sawtooth'
        },
        {
          freq:1046,
          dur:0.15,
          type:'sine',
          delay:0.18
        }
      ],

      success: [
        {
          freq:523,
          dur:0.10,
          type:'triangle'
        },
        {
          freq:784,
          dur:0.18,
          type:'triangle',
          delay:0.14
        }
      ],

      missed: [
        {
          freq:196,
          dur:0.25,
          type:'sawtooth'
        },
        {
          freq:147,
          dur:0.25,
          type:'sawtooth',
          delay:0.3
        }
      ],

      snooze: [
        {
          freq:349,
          dur:0.12,
          type:'sine'
        }
      ]
    };

    const seq =
      sounds[type] ||
      sounds.default;

    const master =
      ctx.createGain();

    master.gain.setValueAtTime(
      0.25,
      ctx.currentTime
    );

    master.connect(ctx.destination);

    seq.forEach(sound => {

      const osc =
        ctx.createOscillator();

      const gain =
        ctx.createGain();

      osc.connect(gain);

      gain.connect(master);

      osc.type =
        sound.type;

      osc.frequency.setValueAtTime(
        sound.freq,
        ctx.currentTime +
        (sound.delay || 0)
      );

      gain.gain.setValueAtTime(
        0.6,
        ctx.currentTime +
        (sound.delay || 0)
      );

      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime +
        (sound.delay || 0) +
        sound.dur
      );

      osc.start(
        ctx.currentTime +
        (sound.delay || 0)
      );

      osc.stop(
        ctx.currentTime +
        (sound.delay || 0) +
        sound.dur +
        0.01
      );
    });
  }

  // ───────────────────────────────────────
  // VIBRATION
  // ───────────────────────────────────────

  vibrate(pattern = [100]) {

    if (!this.vibEnabled)
      return;

    if (!('vibrate' in navigator))
      return;

    try {

      navigator.vibrate(pattern);

    } catch(e) {}
  }

  vibrateUrgent() {

    this.vibrate([
      100,
      50,
      100,
      50,
      200
    ]);
  }

  vibrateMissed() {

    this.vibrate([
      200,
      100,
      200
    ]);
  }

  // ───────────────────────────────────────
  // SEND NOTIFICATION
  // ───────────────────────────────────────

  send(title, body, opts = {}) {

    const {
      tag       = title,
      urgency   = 'normal',
      sound     = true,
      vibrate   = true,
      silent    = false
    } = opts;

    if (
      this.isQuietTime() &&
      urgency !== 'urgent'
    ) return;

    if (!this.canNotify(tag))
      return;

    // save notification log

    if (window.app) {

      if (!window.app.notifications)
        window.app.notifications = [];

      window.app.notifications.unshift({

        id: Date.now(),

        title,

        body,

        urgency,

        read:false,

        time:new Date()
          .toLocaleTimeString([], {
            hour:'2-digit',
            minute:'2-digit'
          })
      });

      if (
        window.app.notifications.length > 100
      ) {

        window.app.notifications.pop();
      }

      window.saveData?.();

      window.updateNotifBadge?.();
    }

    // sound

    if (sound && !silent) {

      const soundMap = {

        urgent:'urgent',

        normal:'default',

        low:'snooze'
      };

      this.playSound(
        soundMap[urgency] ||
        'default'
      );
    }

    // vibration

    if (vibrate) {

      if (urgency === 'urgent') {

        this.vibrateUrgent();

      } else {

        this.vibrate([80]);
      }
    }

    // system notification

    if (
      this.supported &&
      this.permission === 'granted'
    ) {

      try {

        new Notification(
          'LifeSync • ' + title,
          {
            body,

            icon:'./icon-192.png',

            badge:'./icon-192.png',

            tag,

            silent: !sound,

            vibrate:
              urgency === 'urgent'
                ? [100,50,100]
                : [60]
          }
        );

      } catch(e) {

        console.warn(
          'Notification error:',
          e.message
        );
      }
    }
  }

  // ───────────────────────────────────────
  // SETTINGS
  // ───────────────────────────────────────

  saveSettings() {

    localStorage.setItem(
      'ls_notif_settings',

      JSON.stringify({

        sound:this.soundEnabled,

        vibrate:this.vibEnabled
      })
    );
  }

  toggleSound(on) {

    this.soundEnabled = on;

    this.saveSettings();

    if (on) {

      this.playSound('success');
    }
  }

  toggleVibrate(on) {

    this.vibEnabled = on;

    this.saveSettings();

    if (on) {

      this.vibrate([80]);
    }
  }
}

// ══════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════

window.LifeSyncNotifications =
  new LifeSyncNotificationManager();

export default
  window.LifeSyncNotifications;

// ══════════════════════════════════════════
// ADVANCED SMART NOTIFICATIONS
// ══════════════════════════════════════════

window.LifeSyncAdvancedNotify = {

  smartReminder(reminder) {

    if (!reminder) return;

    const days =
      reminder.daysLeft ?? 0;

    let body = '';

    let urgency = 'normal';

    if (days < 0) {

      body =
        `❌ Missed: ${reminder.title}`;

      urgency = 'urgent';

      window.LifeSyncNotifications
        ?.playSound('missed');

      window.LifeSyncNotifications
        ?.vibrateMissed();
    }

    else if (days === 0) {

      body =
        `⚡ Today: ${reminder.title}`;

      urgency = 'urgent';

      window.LifeSyncNotifications
        ?.playSound('urgent');

      window.LifeSyncNotifications
        ?.vibrateUrgent();
    }

    else if (days === 1) {

      body =
        `⏰ Tomorrow: ${reminder.title}`;

      window.LifeSyncNotifications
        ?.playSound('default');
    }

    else {

      body =
        `📅 ${days} days left`;
    }

    window.LifeSyncNotifications
      ?.send(
        reminder.title,
        body,
        {
          urgency,

          tag:
            'smart-' +
            reminder.id
        }
      );
  },

  habitReminder(habit) {

    if (!habit) return;

    window.LifeSyncNotifications
      ?.send(
        '🔥 Habit Reminder',

        `Complete: ${habit.title}`,

        {
          urgency:'normal',

          tag:
            'habit-' +
            habit.id
        }
      );
  },

  dailySummary() {

    const reminders =
      window.app?.reminders || [];

    const habits =
      window.app?.habits || [];

    const pending =
      reminders.filter(r =>
        r.status !== 'completed'
      ).length;

    window.LifeSyncNotifications
      ?.send(
        '📊 Daily Summary',

        `${pending} reminders • ${habits.length} habits active`,

        {
          urgency:'low',

          tag:'daily-summary'
        }
      );
  }
};
