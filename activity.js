// Daily activity outside the weights: steps, water, cardio and calendar reminders.
// Pure functions like coach.js, so they can be tested from Node.
import { dayKey, addDays, startOfDay, weekStart, fmt } from './coach.js';

const toKg = (bw, unit) => (unit === 'kg' ? bw : bw / 2.20462);

// ---------- goals ----------
const STEP_GOALS = { fatloss: 10000, muscle: 8000, general: 8000, strength: 7000 };
export const defaultStepGoal = (goal) => STEP_GOALS[goal] || 8000;
// ~35 ml per kg of bodyweight, counted in 250 ml glasses
export const defaultWaterGoal = (bw, unit) => Math.min(16, Math.max(8, Math.round((toKg(bw, unit) * 35) / 250)));
export const DEFAULT_CARDIO_GOAL = 150; // minutes per week, the usual health guideline

// ---------- per-day values ({date, v}) ----------
export const dayValue = (list, key) => (list.find((x) => x.date === key) || { v: 0 }).v;

export function setDay(list, key, v) {
  const out = list.filter((x) => x.date !== key);
  if (v > 0) out.push({ date: key, v });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Average over the last n full days (today is still in progress, so it is left out).
export function stepStats(steps, now = new Date(), n = 7) {
  const keys = new Set(Array.from({ length: n }, (_, i) => dayKey(addDays(now, -(i + 1)))));
  const vals = steps.filter((s) => keys.has(s.date)).map((s) => s.v);
  return { days: vals.length, avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
}

export const fmtK = (n) => (n >= 1000 ? `${fmt(n / 1000)}k` : String(n));

// ---------- cardio ({id, date ISO, type, min, km, kcal}) ----------
export const CARDIO_TYPES = {
  run: ['Run', 9.8], walk: ['Walk', 3.8], bike: ['Bike', 7.5], rower: ['Rower', 7],
  elliptical: ['Elliptical', 5], stairs: ['Stair climber', 9], swim: ['Swim', 7], hiit: ['HIIT', 8], other: ['Other', 6],
};

// MET × kg × hours
export const cardioKcal = (type, min, bw, unit) => Math.round((CARDIO_TYPES[type] || CARDIO_TYPES.other)[1] * toKg(bw, unit) * (min / 60));

export const KM_PER_MI = 1.60934;

export function pace(min, km, unit) {
  if (!(km > 0) || !(min > 0)) return '';
  const dist = unit === 'kg' ? km : km / KM_PER_MI;
  const per = min / dist, m = Math.floor(per), s = Math.round((per - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')} /${unit === 'kg' ? 'km' : 'mi'}`;
}

export const cardioBetween = (cardio, a, b) => cardio.filter((c) => { const d = new Date(c.date); return d >= a && d < b; }).reduce((m, c) => m + c.min, 0);

export function weeklyCardio(cardio, n, now = new Date()) {
  const cur = weekStart(now);
  return Array.from({ length: n }, (_, i) => {
    const start = addDays(cur, -7 * (n - 1 - i));
    return { start, v: cardioBetween(cardio, start, addDays(start, 7)) };
  });
}

// ---------- calendar reminders ----------
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const DEFAULT_DAYS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };

// One repeating event on the chosen weekdays (0 = Monday), in the phone's local time.
export function buildICS({ days, time, alarm, minutes, url, now = new Date() }) {
  const sorted = [...days].sort((a, b) => a - b);
  const [hh, mm] = time.split(':').map(Number);
  let d = startOfDay(now);
  for (let i = 0; i < 7 && !sorted.includes((d.getDay() + 6) % 7); i++) d = addDays(d, 1);
  const p2 = (n) => String(n).padStart(2, '0');
  const start = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(hh)}${p2(mm)}00`;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Forge//Gym Assistant//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:forge-${now.getTime()}@forge-gym`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DURATION:PT${minutes}M`,
    `RRULE:FREQ=WEEKLY;BYDAY=${sorted.map((i) => BYDAY[i]).join(',')}`,
    'SUMMARY:Workout (Forge)',
    `DESCRIPTION:Open Forge to see today's workout: ${url}`,
    `URL:${url}`,
  ];
  if (alarm !== null && alarm !== undefined) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Workout time', `TRIGGER:-PT${alarm}M`, 'END:VALARM');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// ---------- the coach's words about activity ----------
export function activityInsights(S, now = new Date()) {
  const out = [];
  const p = S.profile;
  const st = stepStats(S.steps, now);
  if (st.days >= 3) {
    const avg = st.avg.toLocaleString(), goal = p.stepGoal.toLocaleString();
    if (st.avg >= p.stepGoal) out.push({ id: 'steps', tone: 'good', title: 'Steps on track', text: `Averaging ${avg} a day this week, above your ${goal} goal.` });
    else if (p.goal === 'fatloss') out.push({ id: 'steps', tone: 'warn', title: 'Add a walk', text: `Averaging ${avg} steps a day against ${goal}. An extra 20-minute walk (about 2,000 steps) is the easiest way to speed up fat loss.` });
    else if (st.avg < p.stepGoal * 0.8) out.push({ id: 'steps', tone: 'info', title: 'Steps below goal', text: `Averaging ${avg} a day against ${goal}. A short walk after meals adds up fast.` });
  }
  const wk = weekStart(now);
  const mins = cardioBetween(S.cardio, wk, addDays(wk, 7));
  if (mins >= p.cardioGoal) out.push({ id: 'cardio', tone: 'good', title: 'Cardio goal hit', text: `${mins} minutes of cardio this week. Your heart thanks you.` });
  return out;
}
