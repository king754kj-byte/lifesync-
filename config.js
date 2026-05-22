/**
 * config.js
 * LifeSync Premium — App Configuration & Default Data
 * Contains: localStorage key, reminder categories, default app state
 */

// ─── STORAGE KEY ─────────────────────────────────────────────────────────────
const LS_KEY = 'lifesync_v2_data';

// ─── REMINDER CATEGORIES ─────────────────────────────────────────────────────
const REMINDER_CATS = [
  { key: 'anniversary', emoji: '💑', label: 'Anniversary', color: '#ff2d78', icon: '💑' },
  { key: 'period',      emoji: '🌊', label: 'Period',      color: '#00fff7', icon: '🌊' },
  { key: 'health',      emoji: '🏥', label: 'Health',      color: '#00e676', icon: '🏥' },
  { key: 'gas',         emoji: '⛽', label: 'Gas',         color: '#ff9800', icon: '⛽' },
  { key: 'birthday',    emoji: '🎂', label: 'Birthday',    color: '#ffb300', icon: '🎂' },
  { key: 'shopping',    emoji: '🛍️', label: 'Shopping',    color: '#b44fff', icon: '🛍️' },
  { key: 'task',        emoji: '📋', label: 'Task',        color: '#00d4ff', icon: '📋' },
  { key: 'recharge',    emoji: '📱', label: 'Recharge',    color: '#00d4ff', icon: '📱' },
  { key: 'event',       emoji: '🎉', label: 'Event',       color: '#ff9800', icon: '🎉' },
  { key: 'haircut',     emoji: '✂️',  label: 'Haircut',     color: '#00d4ff', icon: '✂️'  },
  { key: 'medicine',    emoji: '💊', label: 'Medicine',    color: '#b44fff', icon: '💊' },
  { key: 'bills',       emoji: '⚡', label: 'Bills',       color: '#00e676', icon: '⚡' },
  { key: 'other',       emoji: '📦', label: 'Others',      color: '#888',    icon: '📦' },
];

// ─── CURRENCY RATES (vs USD) ─────────────────────────────────────────────────
const CURRENCY_RATES = {
  USD: 1,    EUR: 0.92,  GBP: 0.79,  INR: 83.5,
  JPY: 156.2, CAD: 1.36, AUD: 1.53,  SGD: 1.35,
  AED: 3.67,  CHF: 0.90, CNY: 7.24,  KRW: 1342,
};

// ─── DEFAULT APP DATA ─────────────────────────────────────────────────────────
const defaultData = {
  reminders: [
    { id: 1,  icon: '✂️',  title: 'Haircut',         sub: 'Predicted: Jun 7 • Every 25 days',  days: 2,  color: '#00d4ff', cat: 'haircut',     urgent: true  },
    { id: 2,  icon: '💊',  title: 'Medicine Refill',  sub: 'Pantoprazole • Daily',              days: 1,  color: '#b44fff', cat: 'medicine',    urgent: true  },
    { id: 3,  icon: '💑',  title: 'Anniversary',      sub: '2nd Year • Jun 21',                 days: 8,  color: '#ff2d78', cat: 'anniversary', urgent: false },
    { id: 4,  icon: '🎂',  title: "Mom's Birthday",   sub: 'Jun 27',                            days: 14, color: '#ffb300', cat: 'birthday',    urgent: false },
    { id: 5,  icon: '🌊',  title: 'Period Tracker',   sub: 'Next: Jun 15 • 28 day cycle',       days: 6,  color: '#00fff7', cat: 'period',      urgent: false },
    { id: 6,  icon: '⚡',  title: 'Electricity Bill', sub: 'Due Jun 20 • Monthly',              days: 12, color: '#00e676', cat: 'bills',       urgent: false },
    { id: 7,  icon: '📱',  title: 'Mobile Recharge',  sub: 'Plan expires Jun 19',               days: 11, color: '#00d4ff', cat: 'recharge',    urgent: false },
    { id: 8,  icon: '⛽',  title: 'Gas Booking',      sub: 'Book before Jun 18',                days: 10, color: '#ff9800', cat: 'gas',         urgent: false },
    { id: 9,  icon: '🛍️', title: 'Monthly Shopping', sub: 'Groceries & essentials',            days: 5,  color: '#b44fff', cat: 'shopping',    urgent: false },
    { id: 10, icon: '🏥',  title: 'Health Checkup',   sub: 'Annual blood test due',             days: 7,  color: '#00e676', cat: 'health',      urgent: false },
  ],

  notes: [
    { id: 1, title: 'Shopping List',      body: 'Milk, eggs, bread, vegetables, fruits, butter, cheese.',            color: '#00d4ff', time: 'Today' },
    { id: 2, title: 'Gym Plan',           body: 'Monday: Chest & triceps. Wednesday: Back & biceps. Friday: Legs.', color: '#b44fff', time: 'Yesterday' },
    { id: 3, title: 'Doctor Visit Notes', body: 'Blood pressure normal. Continue medication for 2 weeks.',           color: '#00fff7', time: 'May 10' },
    { id: 4, title: 'Goals 2025',         body: 'Learn guitar, travel to 3 countries, read 12 books.',               color: '#ff2d78', time: 'May 1' },
  ],

  events: [
    { id: 1, day: 7,  icon: '💊', title: 'Medicine',       time: '9:00 AM',    color: '#b44fff' },
    { id: 2, day: 13, icon: '✂️', title: 'Haircut Due',    time: 'Urgent',     color: '#00fff7' },
    { id: 3, day: 15, icon: '🌊', title: 'Period Tracker', time: 'Prediction', color: '#ff2d78' },
    { id: 4, day: 21, icon: '💑', title: 'Anniversary',    time: 'Jun 21',     color: '#ff2d78' },
    { id: 5, day: 27, icon: '🎂', title: "Mom's Birthday", time: 'Jun 27',     color: '#ffb300' },
  ],

  habits: [
    { id: 1, name: 'Drink Water', icon: '💧', streak: 12, goal: 8, done: 5, color: '#00fff7' },
    { id: 2, name: 'Exercise',    icon: '🏋️', streak: 7,  goal: 1, done: 1, color: '#00d4ff' },
    { id: 3, name: 'Sleep 8hrs',  icon: '😴', streak: 5,  goal: 1, done: 0, color: '#b44fff' },
    { id: 4, name: 'Study',       icon: '📚', streak: 9,  goal: 2, done: 2, color: '#ffb300' },
    { id: 5, name: 'Meditation',  icon: '🧘', streak: 3,  goal: 1, done: 0, color: '#ff2d78' },
  ],

  expenses: [
    { id: 1, amount: 450, desc: 'Grocery Shopping', cat: 'shopping',  date: 'May 13' },
    { id: 2, amount: 200, desc: 'Auto Ride',         cat: 'transport', date: 'May 13' },
    { id: 3, amount: 599, desc: 'Mobile Recharge',   cat: 'bills',     date: 'May 12' },
    { id: 4, amount: 350, desc: 'Restaurant Dinner', cat: 'food',      date: 'May 11' },
  ],

  checklists: [
    {
      id: 1, name: 'Shopping List', icon: '🛒',
      items: [
        { id: 101, text: 'Milk',  done: false },
        { id: 102, text: 'Eggs',  done: true  },
        { id: 103, text: 'Bread', done: false },
      ],
    },
  ],

  settings:  { pin: false, notifs: true, dark: true, fingerprint: true, privacy: false },
  profile:   { name: 'Your Name', email: 'user@email.com' },
  weather:   'Sunny • 28°C',
  weatherCity: '',

  quotes: [
    'Every day is a new beginning.',
    'Small steps lead to big journeys.',
    'Your future self will thank you.',
    'Consistency beats perfection.',
    'Make today count.',
  ],

  chatMessages: [
    { role: 'ai', text: "Hey! I'm your LifeSync AI. Ask me anything about your schedule, predictions, or habits! 🤖" },
  ],

  reminderFilter:     'all',
  notifications:      [],
  fuelLogs:           [],
  periodSettings:     { lastDate: '', cycleLength: 28, duration: 5 },
  periodSymptomLog:   {},
  snoozeLog:          [],
  pregnancySettings:  {},
  calSelected:        new Date().getDate(),
  nextId:             200,

  // V2.1 fields
  completedReminders: [],
  missedReminders:    [],
  version:            '2.1',
};

// ─── MORE PAGES LIST (secondary tabs shown in "More" drawer) ──────────────────
const MORE_PAGE_IDS = [
  'calculator','stats','notes','notifications','weather',
  'fuel','period','pregnancy','focus','bmi','water','currency',
];
