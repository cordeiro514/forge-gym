// The "assistant": everything automatic lives here as pure functions (no DOM, no storage),
// so it can be tested from Node. State shape is documented in store.js.
import { EXERCISES, pick } from './exercises.js';

export const DAY_MS = 86400000;

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const weekStart = (d) => addDays(startOfDay(d), -((new Date(d).getDay() + 6) % 7)); // Monday
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);

export const fmt = (n) => String(Math.round(n * 10) / 10);

// ---------- loads ----------
export const roundTo = (v, step) => +(Math.round(v / step) * step).toFixed(2);

export function stepFor(ex, unit) {
  const kg = unit === 'kg';
  if (ex.equip === 'dumbbell') return kg ? 1 : 2.5;
  return kg ? 2.5 : 5;
}

export function incFor(ex, unit) {
  const kg = unit === 'kg';
  if (ex.equip === 'dumbbell') return kg ? 2 : 5;
  if (ex.lower) return kg ? 5 : 10;
  return kg ? 2.5 : 5;
}

const minLoad = (ex, unit) => (ex.equip === 'barbell' ? (unit === 'kg' ? 20 : 45) : stepFor(ex, unit) * 2);
const EXP_MULT = { beginner: 0.8, intermediate: 1.3, advanced: 1.8 };

export function starterWeight(ex, p) {
  if (ex.factor === null) return 0;
  const w = roundTo(ex.factor * p.bodyweight * (EXP_MULT[p.experience] || 1), stepFor(ex, p.unit));
  return Math.max(w, minLoad(ex, p.unit));
}

export const e1rm = (w, r) => (r <= 1 ? w : w * (1 + Math.min(r, 12) / 30));

// ---------- plan generation ----------
const DAYS = {
  fullA: { name: 'Full Body A', slots: ['squat', 'chestPress', 'hRow', 'shoulderPress', 'hamIso', 'core'] },
  fullB: { name: 'Full Body B', slots: ['hinge', 'inclinePress', 'vPull', 'lunge', 'bicepsA', 'tricepsA'] },
  upperA: { name: 'Upper A', slots: ['chestPress', 'hRow', 'shoulderPress', 'vPull', 'bicepsA', 'tricepsA'] },
  upperB: { name: 'Upper B', slots: ['inclinePress', 'hRowB', 'vPull', 'sideDelt', 'bicepsB', 'tricepsB'] },
  lowerA: { name: 'Lower A', slots: ['squat', 'hinge', 'lunge', 'hamIso', 'calves', 'core'] },
  lowerB: { name: 'Lower B', slots: ['legPress', 'hingeB', 'glute', 'quadIso', 'calves', 'coreB'] },
  push: { name: 'Push', slots: ['chestPress', 'shoulderPress', 'inclinePress', 'sideDelt', 'tricepsA', 'tricepsB'] },
  pull: { name: 'Pull', slots: ['vPull', 'hRow', 'hRowB', 'rearDelt', 'bicepsA', 'bicepsB'] },
  legs: { name: 'Legs', slots: ['squat', 'hinge', 'legPress', 'hamIso', 'calves', 'core'] },
  push2: { name: 'Push B', slots: ['inclinePress', 'shoulderPress', 'chestIso', 'sideDelt', 'tricepsB', 'tricepsA'] },
  pull2: { name: 'Pull B', slots: ['hRowB', 'vPull', 'rearDelt', 'bicepsB', 'bicepsA', 'coreB'] },
  legs2: { name: 'Legs B', slots: ['legPress', 'hingeB', 'lunge', 'quadIso', 'calves', 'coreB'] },
};

const PROGRAMS = {
  2: ['fullA', 'fullB'],
  3: ['fullA', 'fullB'],
  4: ['upperA', 'lowerA', 'upperB', 'lowerB'],
  5: ['push', 'pull', 'legs', 'upperB', 'lowerB'],
  6: ['push', 'pull', 'legs', 'push2', 'pull2', 'legs2'],
};

export function scheme(ex, p) {
  const compound = ex.kind === 'compound';
  let sets = (compound ? { beginner: 3, intermediate: 3, advanced: 4 } : { beginner: 2, intermediate: 3, advanced: 3 })[p.experience] ?? 3;
  let lo, hi, rest;
  if (p.goal === 'strength') {
    [lo, hi, rest] = compound ? [3, 6, 180] : [8, 12, 90];
    if (compound && p.experience !== 'beginner') sets += 1;
  } else if (p.goal === 'muscle') [lo, hi, rest] = compound ? [6, 10, 120] : [10, 15, 75];
  else if (p.goal === 'fatloss') [lo, hi, rest] = compound ? [8, 12, 75] : [12, 15, 60];
  else [lo, hi, rest] = compound ? [8, 12, 90] : [10, 15, 60];
  if (ex.factor === null) [lo, hi] = p.goal === 'strength' ? [5, 10] : [8, 15];
  return { sets, lo, hi, rest };
}

export function generatePlan(p) {
  const templates = (PROGRAMS[p.days] || PROGRAMS[3]).map((key) => {
    const used = new Set();
    const exercises = [];
    for (const slot of DAYS[key].slots) {
      const exId = pick(slot, p.equipment, used);
      if (!exId) continue;
      used.add(exId);
      exercises.push({ exId, ...scheme(EXERCISES[exId], p) });
    }
    return { id: key, name: DAYS[key].name, exercises };
  });
  return { templates, rotation: 0, deload: null, lastDeloadEnd: null, generatedAt: dayKey(new Date()) };
}

export const entryFor = (exId, p) => ({ exId, ...scheme(EXERCISES[exId], p) });

export const estMinutes = (t) => Math.max(15, Math.round(t.exercises.reduce((m, e) => m + (e.sets * (45 + e.rest)) / 60, 5) / 5) * 5);

// ---------- progression ----------
export function exerciseHistory(sessions, exId, n = 2) {
  const out = [];
  for (let i = sessions.length - 1; i >= 0 && out.length < n; i--) {
    if (sessions[i].deload) continue; // deload weeks don't set the baseline
    const e = sessions[i].exercises.find((x) => x.exId === exId && x.sets.length);
    if (e) out.push({ date: sessions[i].date, sets: e.sets });
  }
  return out; // most recent first
}

export const isDeload = (plan, now = new Date()) => !!plan.deload && dayKey(now) >= plan.deload.start && dayKey(now) <= plan.deload.end;

// Double progression: add reps until every set hits the top of the range, then add weight.
export function suggest(entry, sessions, p, ctx = {}) {
  const ex = EXERCISES[entry.exId];
  const now = ctx.now || new Date();
  const unit = p.unit;
  const step = stepFor(ex, unit);
  const [last, prev] = exerciseHistory(sessions, entry.exId, 2);
  let out;

  if (!last) {
    const w = starterWeight(ex, p);
    out = {
      w, r: entry.lo, tone: 'new', last: null,
      note: w ? 'Starter weight from your bodyweight. Adjust it to something you can lift with 2–3 reps left in the tank.' : 'Clean reps, stop 1–2 short of failure.',
    };
  } else {
    const topW = Math.max(...last.sets.map((s) => s.w));
    const atW = last.sets.filter((s) => s.w >= topW - 1e-6);
    const minR = Math.min(...atW.map((s) => s.r));
    const full = atW.length >= entry.sets;
    const gap = daysBetween(last.date, now);
    const inc = incFor(ex, unit);
    const rough = (h) => h.sets.some((s) => s.r < entry.lo);

    if (ex.factor === null && topW === 0) {
      // bodyweight: add reps, then make it harder
      if (full && minR >= entry.hi) out = { w: 0, r: entry.hi, tone: 'up', note: 'You maxed this range. Make it harder: add weight (backpack, belt) or a tougher variation.' };
      else { const r = Math.min(entry.hi, full ? minR + 1 : minR); out = { w: 0, r, tone: 'same', note: `Beat last time: aim for ${r} reps on every set.` }; }
    } else if (gap >= 21) {
      out = { w: roundTo(topW * 0.9, step), r: entry.lo, tone: 'back', note: `Back after ${gap} days — eased off 10% to restart safely.` };
    } else if (full && minR >= entry.hi) {
      out = { w: topW + inc, r: entry.lo, tone: 'up', note: `Move up +${fmt(inc)} ${unit} — you hit ${entry.hi} reps on every set.` };
    } else if (rough(last) && prev && rough(prev) && Math.max(...prev.sets.map((s) => s.w)) >= topW - inc) {
      out = { w: roundTo(topW * 0.9, step), r: entry.lo, tone: 'down', note: 'Two rough sessions in a row — dropping 10% to rebuild.' };
    } else if (minR < entry.lo) {
      out = { w: topW, r: entry.lo, tone: 'same', note: `Stay here until you get ${entry.lo}+ reps on every set.` };
    } else {
      const r = Math.min(entry.hi, minR + 1);
      out = { w: topW, r, tone: 'same', note: `Same weight — go for ${r} reps on every set.` };
    }
    out.last = last.sets;
  }

  out.sets = entry.sets;
  if (ctx.deload) {
    if (out.w > 0) out.w = roundTo(out.w * 0.9, step);
    out.sets = Math.max(2, entry.sets - 1);
    out.tone = 'deload';
    out.note = 'Deload week: lighter on purpose. Leave plenty in the tank.';
  }
  return out;
}

export function makeExercise(entry, S, now, deload) {
  const s = suggest(entry, S.sessions, S.profile, { now, deload });
  return {
    exId: entry.exId, lo: entry.lo, hi: entry.hi, rest: entry.rest,
    note: s.note, tone: s.tone, last: s.last,
    sets: Array.from({ length: s.sets }, () => ({ w: s.w, r: s.r, done: false })),
  };
}

export function buildWorkout(S, tIdx, now = new Date()) {
  const t = S.plan.templates[tIdx];
  const deload = isDeload(S.plan, now);
  return {
    id: String(now.getTime()), templateIdx: tIdx, templateId: t.id,
    name: t.name + (deload ? ' · Deload' : ''),
    startedAt: now.getTime(), deload, rest: null,
    exercises: t.exercises.map((e) => makeExercise(e, S, now, deload)),
  };
}

export function warmups(exId, w, unit) {
  const ex = EXERCISES[exId];
  if (ex.kind !== 'compound' || !['barbell', 'machine'].includes(ex.equip) || !(w > 0)) return [];
  const bar = ex.equip === 'barbell' ? (unit === 'kg' ? 20 : 45) : 0;
  if (w < Math.max(bar * 2, stepFor(ex, unit) * 8)) return []; // light loads need no ramp-up
  const step = stepFor(ex, unit);
  const list = [[0.5, 8], [0.7, 5], [0.85, 2]].map(([f, r]) => ({ w: Math.max(roundTo(w * f, step), bar), r }));
  return list.filter((s, i) => s.w < w && (i === 0 || s.w > list[i - 1].w));
}

export function formatSets(sets, unit) {
  if (!sets || !sets.length) return '';
  if (sets.every((s) => s.w === sets[0].w)) return `${sets[0].w ? fmt(sets[0].w) + ' ' + unit + ' × ' : ''}${sets.map((s) => s.r).join(', ')}${sets[0].w ? '' : ' reps'}`;
  return sets.map((s) => `${fmt(s.w)}×${s.r}`).join(', ');
}

// ---------- PRs & stats ----------
export const bestScores = (sets) => ({
  weight: Math.max(0, ...sets.filter((s) => s.w > 0).map((s) => e1rm(s.w, s.r))),
  reps: Math.max(0, ...sets.filter((s) => s.w === 0).map((s) => s.r)),
});

export const bestScore = (sets) => { const b = bestScores(sets); return b.weight || b.reps; };

// Compares a finished workout's exercises with everything logged before it.
export function findPRs(exercises, priorSessions) {
  const prs = [];
  for (const e of exercises) {
    const prior = { weight: 0, reps: 0 };
    for (const s of priorSessions) {
      const m = s.exercises.find((x) => x.exId === e.exId);
      if (!m) continue;
      const b = bestScores(m.sets);
      prior.weight = Math.max(prior.weight, b.weight);
      prior.reps = Math.max(prior.reps, b.reps);
    }
    const cur = bestScores(e.sets);
    if (prior.weight > 0 && cur.weight > prior.weight + 0.01) prs.push({ exId: e.exId, kind: 'weight', value: cur.weight, prev: prior.weight });
    else if (prior.weight === 0 && prior.reps > 0 && cur.reps > prior.reps) prs.push({ exId: e.exId, kind: 'reps', value: cur.reps, prev: prior.reps });
  }
  return prs;
}

export const sessionVolume = (exercises) => exercises.reduce((v, e) => v + e.sets.reduce((a, s) => a + s.w * s.r, 0), 0);

const countBetween = (sessions, a, b, skipDeload = false) =>
  sessions.filter((s) => { const d = new Date(s.date); return d >= a && d < b && !(skipDeload && s.deload); }).length;

export function weeklyCounts(sessions, n, now = new Date()) {
  const cur = weekStart(now);
  return Array.from({ length: n }, (_, i) => {
    const start = addDays(cur, -7 * (n - 1 - i));
    return { start, count: countBetween(sessions, start, addDays(start, 7)) };
  });
}

export function setsPerMuscle(sessions, since) {
  const out = {};
  for (const s of sessions) {
    if (new Date(s.date) < since) continue;
    for (const e of s.exercises) out[EXERCISES[e.exId].muscle] = (out[EXERCISES[e.exId].muscle] || 0) + e.sets.length;
  }
  return out;
}

function goalStreak(sessions, goal, now) {
  let ws = weekStart(now), n = 0;
  if (countBetween(sessions, ws, addDays(ws, 7)) >= goal) n++;
  ws = addDays(ws, -7);
  while (countBetween(sessions, ws, addDays(ws, 7)) >= goal) { n++; ws = addDays(ws, -7); }
  return n;
}

function trainingWeeksInRow(sessions, now, since) {
  let ws = weekStart(now), n = 0;
  if (!countBetween(sessions, ws, addDays(ws, 7), true)) ws = addDays(ws, -7);
  while (countBetween(sessions, ws, addDays(ws, 7), true) > 0 && (!since || addDays(ws, 7) > since)) { n++; ws = addDays(ws, -7); }
  return n;
}

function stalledLifts(S) {
  const ids = new Set(S.plan.templates.flatMap((t) => t.exercises.map((e) => e.exId)));
  const out = [];
  for (const id of ids) {
    const scores = S.sessions.filter((s) => !s.deload).map((s) => s.exercises.find((e) => e.exId === id)).filter(Boolean).map((e) => bestScore(e.sets));
    if (scores.length < 4) continue;
    if (Math.max(...scores.slice(-3)) <= Math.max(...scores.slice(0, -3)) + 0.01) out.push(id);
  }
  return out;
}

export function weightTrend(weights, now = new Date()) {
  const from = startOfDay(addDays(now, -28));
  const pts = weights.map((w) => ({ t: parseKey(w.date).getTime() / DAY_MS, v: w.v, d: parseKey(w.date) })).filter((p) => p.d >= from).sort((a, b) => a.t - b.t);
  if (pts.length < 2 || pts.at(-1).t - pts[0].t < 6) return null;
  const n = pts.length, mt = pts.reduce((a, p) => a + p.t, 0) / n, mv = pts.reduce((a, p) => a + p.v, 0) / n;
  const slope = pts.reduce((a, p) => a + (p.t - mt) * (p.v - mv), 0) / pts.reduce((a, p) => a + (p.t - mt) ** 2, 0);
  const latest = pts.at(-1).v;
  return { perWeek: slope * 7, pct: ((slope * 7) / latest) * 100, latest };
}

// ---------- the coach's words ----------
export function coachMessage(S, now, next) {
  const { profile: p, sessions } = S;
  const name = p.name;
  const last = sessions.at(-1);
  const wkStart = weekStart(now);
  const done = countBetween(sessions, wkStart, addDays(wkStart, 7));
  if (S.active) return `Workout in progress, ${name}. Finish strong — I'm tracking everything.`;
  if (!last) return `Welcome, ${name}! Your first workout is ready. Start lighter than you think — I'll adjust your weights after every session.`;
  const gap = daysBetween(last.date, now);
  if (gap === 0) return `Nice work today, ${name}. Eat, hydrate, sleep — that's where the progress happens. Next up: ${next.name}.`;
  if (gap >= 10) return `Good to see you back, ${name}. No guilt — one session restarts the momentum. I'll set the weights safely for you.`;
  if (done >= p.days) return `Weekly goal done: ${done}/${p.days} sessions. Another is optional — recovery counts too.`;
  const daysLeft = 7 - ((now.getDay() + 6) % 7);
  const need = p.days - done;
  if (need >= daysLeft) return `${need} session${need > 1 ? 's' : ''} left this week and ${daysLeft} day${daysLeft > 1 ? 's' : ''} to do it. Today is ${next.name} — let's go.`;
  return `Today is ${next.name}. ${done} of ${p.days} sessions done this week.`;
}

export function insights(S, now = new Date()) {
  const out = [];
  const { profile: p, plan, sessions } = S;
  const name = (id) => EXERCISES[id].name;

  if (isDeload(plan, now)) {
    out.push({ id: 'deload-on', tone: 'info', title: 'Deload week is on', text: `Weights and sets are lowered automatically through ${parseKey(plan.deload.end).toLocaleDateString(undefined, { weekday: 'long' })}. Your body rebuilds; strength comes back stronger.` });
  } else if (sessions.length) {
    const since = plan.lastDeloadEnd ? parseKey(plan.lastDeloadEnd) : null;
    const weeks = trainingWeeksInRow(sessions, now, since);
    const stalled = stalledLifts(S);
    if (weeks >= 6 || stalled.length >= 3) {
      out.push({
        id: 'deload-offer', tone: 'warn', title: 'Time for a deload week?',
        text: weeks >= 6 ? `${weeks} weeks of hard training in a row. A lighter week now helps you keep progressing.` : `${stalled.length} lifts have stalled. A lighter week usually unlocks them.`,
        action: { act: 'accept-deload', label: 'Start deload week' },
      });
    } else if (stalled.length) {
      out.push({ id: 'stalled', tone: 'info', title: 'Stalled lift', text: `${stalled.slice(0, 2).map(name).join(' and ')} ${stalled.length > 1 ? 'haven\'t' : 'hasn\'t'} improved in 3 sessions. Try sleeping and eating a bit more, or swap it in the Plan tab.` });
    }
  }

  const weekAgo = addDays(startOfDay(now), -6);
  const recent = sessions.filter((s) => new Date(s.date) >= weekAgo).flatMap((s) => s.prs || []);
  if (recent.length) {
    const pr = recent.at(-1);
    out.push({ id: 'pr', tone: 'good', title: 'New personal record', text: pr.kind === 'weight' ? `${name(pr.exId)}: estimated max ${fmt(pr.value)} ${p.unit} (was ${fmt(pr.prev)}).` : `${name(pr.exId)}: ${pr.value} reps (was ${pr.prev}).` });
  }

  const streak = goalStreak(sessions, p.days, now);
  if (streak >= 2) out.push({ id: 'streak', tone: 'good', title: `${streak}-week streak`, text: `You've hit ${p.days} sessions for ${streak} weeks running. Consistency is the whole game.` });

  const lastW = S.weights.at(-1);
  const trend = weightTrend(S.weights, now);
  if (!lastW || daysBetween(parseKey(lastW.date), now) >= 7) {
    out.push({ id: 'weigh', tone: 'info', title: 'Weekly weigh-in', text: lastW ? `Last logged ${daysBetween(parseKey(lastW.date), now)} days ago. Same time of day gives the cleanest trend.` : 'Log your bodyweight so I can track your trend.', action: { act: 'weigh-in', label: 'Log weight' } });
  } else if (trend) {
    const dir = trend.perWeek >= 0 ? 'up' : 'down';
    const rate = `${fmt(Math.abs(trend.perWeek))} ${p.unit}/week ${dir}`;
    let text = `Bodyweight trend: ${rate}.`, tone = 'info';
    if (p.goal === 'muscle') {
      if (trend.pct > 0.7) { text += ' Gaining quickly — a smaller surplus keeps it leaner.'; tone = 'warn'; }
      else if (trend.pct >= 0.05) { text += ' Right on target for building muscle.'; tone = 'good'; }
      else { text += ' Not gaining yet — eat a little more to fuel growth.'; tone = 'warn'; }
    } else if (p.goal === 'fatloss') {
      if (trend.pct < -1.2) { text += ' Dropping fast — eat a bit more to protect muscle.'; tone = 'warn'; }
      else if (trend.pct <= -0.2) { text += ' Right on target for fat loss.'; tone = 'good'; }
      else { text += ' Not dropping yet — tighten up portions a little.'; tone = 'warn'; }
    }
    out.push({ id: 'trend', tone, title: 'Weight trend', text });
  }
  return out;
}
