// Persistence. Everything lives on the phone (localStorage); nothing is sent anywhere.
//
// State shape:
//   profile  { name, goal, experience, days, equipment, unit, bodyweight } | null
//   plan     { templates:[{id,name,exercises:[{exId,sets,lo,hi,rest}]}], rotation, deload:{start,end}|null, lastDeloadEnd }
//   sessions [{ id, date(ISO), name, templateId, deload, durMin, volume, prs, exercises:[{exId, sets:[{w,r}]}] }]
//   weights  [{ date:'YYYY-MM-DD', v }]
//   steps    [{ date:'YYYY-MM-DD', v }]          water [{ date, v }] (glasses)
//   cardio   [{ id, date(ISO), type, min, km, kcal }]  (distance always stored in km)
//   active   in-progress workout (see coach.buildWorkout) | null
//   prefs    { sound, installDismissed, reminders:{days,time,alarm}|null, remindersSet, remindersDismissed }
import { roundTo } from './coach.js';
import { defaultStepGoal, defaultWaterGoal, DEFAULT_CARDIO_GOAL } from './activity.js';

const KEY = 'forge.v1';
export let storageOk = true;

const blank = () => ({
  v: 1, profile: null, plan: null, sessions: [], weights: [], steps: [], water: [], cardio: [], active: null,
  prefs: { sound: true, installDismissed: false, reminders: null, remindersSet: false, remindersDismissed: false },
});

const list = (x) => (Array.isArray(x) ? x : []);

export function normalize(raw) {
  const S = { ...blank(), ...raw };
  S.prefs = { ...blank().prefs, ...(raw && raw.prefs) };
  S.sessions = list(S.sessions).sort((a, b) => new Date(a.date) - new Date(b.date));
  S.weights = list(S.weights).sort((a, b) => a.date.localeCompare(b.date));
  S.steps = list(S.steps);
  S.water = list(S.water);
  S.cardio = list(S.cardio).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (S.profile) withGoals(S.profile);
  return S;
}

// Fills in daily targets for profiles created before they existed.
export function withGoals(p) {
  if (!(p.stepGoal > 0)) p.stepGoal = defaultStepGoal(p.goal);
  if (!(p.waterGoal > 0)) p.waterGoal = defaultWaterGoal(p.bodyweight, p.unit);
  if (!(p.cardioGoal > 0)) p.cardioGoal = DEFAULT_CARDIO_GOAL;
  return p;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    storageOk = false;
    return normalize(null);
  }
}

export function save(S) {
  try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; } catch { storageOk = false; }
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

// Re-express every stored load in the other unit.
export function convertUnits(S, to) {
  if (S.profile.unit === to) return;
  const f = to === 'lb' ? 2.20462 : 1 / 2.20462;
  const step = to === 'lb' ? 0.5 : 0.25;
  const conv = (w) => roundTo(w * f, step);
  for (const s of S.sessions) {
    s.volume = Math.round(s.volume * f);
    for (const e of s.exercises) for (const set of e.sets) set.w = conv(set.w);
    for (const pr of s.prs || []) { if (pr.kind === 'weight') { pr.value = conv(pr.value); pr.prev = conv(pr.prev); } }
  }
  for (const w of S.weights) w.v = roundTo(w.v * f, 0.1);
  if (S.active) for (const e of S.active.exercises) {
    for (const set of e.sets) if (set.w !== '' && set.w != null) set.w = conv(+set.w);
    if (e.last) e.last = e.last.map((x) => ({ ...x, w: conv(x.w) }));
  }
  S.profile.bodyweight = roundTo(S.profile.bodyweight * f, 0.5);
  S.profile.unit = to;
}

export function validateImport(obj) {
  if (!obj || typeof obj !== 'object') return 'That file is not a Forge backup.';
  if (!obj.profile || !obj.plan || !Array.isArray(obj.sessions)) return 'That backup is missing data.';
  if (!['kg', 'lb'].includes(obj.profile.unit)) return 'That backup has an unknown unit.';
  return null;
}
