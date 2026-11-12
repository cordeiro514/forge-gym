import { EXERCISES, MUSCLES, allowed, alternatives } from './exercises.js';
import {
  dayKey, parseKey, addDays, weekStart, fmt, generatePlan, entryFor, estMinutes, suggest, buildWorkout, makeExercise,
  warmups, formatSets, findPRs, bestScores, bestScore, e1rm, sessionVolume, weeklyCounts, setsPerMuscle, coachMessage, insights, isDeload,
} from './coach.js';
import {
  defaultStepGoal, dayValue, setDay, stepStats, fmtK, CARDIO_TYPES, cardioKcal, KM_PER_MI, pace, cardioBetween, weeklyCardio,
  DEFAULT_DAYS, buildICS, activityInsights,
} from './activity.js';
import { CUES } from './guide.js';
import { demoFrames } from './demos.js';
import {
  attachGim, gimHTML, gimSettingsHTML, stepsAutoHTML, gimSend, gimMic, gimRetry, gimInstall, gimNew, gimSetup, stopSpeaking,
  personId, syncSteps, configured, t as gt,
} from './gim.js';
import { load, save, wipe, convertUnits, normalize, validateImport, withGoals } from './store.js';

const VERSION = '1.3.0';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

let S = load();
const ui = {
  tab: 'today', view: 'tabs', sheet: null, chartEx: null, planStale: false,
  ob: { name: '', goal: 'muscle', experience: 'beginner', days: 3, equipment: 'gym', unit: 'kg', bodyweight: '' },
};
const persist = () => save(S);

// ---------- icons ----------
const PATHS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/>',
  chart: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  swap: '<path d="M7 4L4 7l3 3M4 7h13M17 20l3-3-3-3M20 17H7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  share: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7h14v-7"/>',
  minus: '<path d="M5 12h14"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  gim: '<circle cx="12" cy="12.5" r="9"/><path d="M3.6 9h16.8"/><path d="M9 13h.01M15 13h.01"/><path d="M9.5 16.5c1.5 1 3.5 1 5 0"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  send: '<path d="M5 12h13M13 6l6 6-6 6"/>',
};
const icon = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[n]}</svg>`;

// ---------- small helpers ----------
const unit = () => S.profile.unit;
const clock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const fdate = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const sdate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const greeting = (d) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening');
const nextIdx = () => S.plan.rotation % S.plan.templates.length;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferredPrompt = null;

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

function expireDeload(now = new Date()) {
  if (S.plan && S.plan.deload && dayKey(now) > S.plan.deload.end) { S.plan.lastDeloadEnd = S.plan.deload.end; S.plan.deload = null; persist(); }
}

// ---------- charts ----------
function lineChart(pts) {
  if (!pts.length) return '<p class="muted small">Nothing logged yet.</p>';
  const W = 320, H = 150, L = 40, R = 12, T = 12, B = 24;
  let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  const rawLo = lo, rawHi = hi;
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  const t0 = pts[0].t, t1 = pts.at(-1).t;
  const X = (t) => L + (t1 === t0 ? (W - L - R) / 2 : ((t - t0) / (t1 - t0)) * (W - L - R));
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const dots = pts.map((p) => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="3.2"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">
    <line x1="${L}" x2="${W - R}" y1="${Y(rawHi)}" y2="${Y(rawHi)}" class="grid"/><line x1="${L}" x2="${W - R}" y1="${Y(rawLo)}" y2="${Y(rawLo)}" class="grid"/>
    <text x="${L - 6}" y="${Y(rawHi) + 4}" text-anchor="end">${fmt(rawHi)}</text>
    ${rawHi !== rawLo ? `<text x="${L - 6}" y="${Y(rawLo) + 4}" text-anchor="end">${fmt(rawLo)}</text>` : ''}
    <path d="${d}" class="line"/>${dots}
    <text x="${L}" y="${H - 6}">${sdate(t0)}</text>${t1 !== t0 ? `<text x="${W - R}" y="${H - 6}" text-anchor="end">${sdate(t1)}</text>` : ''}
  </svg>`;
}

// items: [{ label, v }]; bars at or above the goal are highlighted.
function barChart(items, goal, label, fmtV = String) {
  const W = 320, H = 120, T = 16, B = 20, max = Math.max(goal, ...items.map((w) => w.v), 1);
  const bw = (W - 20) / items.length;
  const Y = (v) => T + (1 - v / max) * (H - T - B);
  const bars = items.map((w, i) => {
    const x = 10 + i * bw + bw * 0.18, h = H - B - Y(w.v);
    return `<rect x="${x.toFixed(1)}" y="${Y(w.v).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="3" class="${w.v >= goal ? 'bar hit' : 'bar'}"/>
      <text x="${(x + bw * 0.32).toFixed(1)}" y="${(Y(w.v) - 4).toFixed(1)}" text-anchor="middle">${w.v ? fmtV(w.v) : ''}</text>
      <text x="${(x + bw * 0.32).toFixed(1)}" y="${H - 5}" text-anchor="middle">${w.label}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}"><line x1="10" x2="${W - 10}" y1="${Y(goal)}" y2="${Y(goal)}" class="goal"/>${bars}</svg>`;
}

function meter(label, v, goal, text, actions) {
  const f = Math.min(1, goal ? v / goal : 0);
  return `<div class="meter"><div class="row between"><span class="m-label">${label}</span><span class="m-val">${text}</span></div>
    <div class="row gap"><div class="mtrack grow"><i style="width:${(f * 100).toFixed(1)}%" class="${v >= goal ? 'hit' : ''}"></i></div>${actions}</div></div>`;
}

function ring(done, target) {
  const r = 22, c = 2 * Math.PI * r, f = Math.min(1, done / target);
  return `<div class="ring" aria-label="${done} of ${target} sessions this week"><svg width="58" height="58" viewBox="0 0 58 58"><circle cx="29" cy="29" r="${r}" class="track"/><circle cx="29" cy="29" r="${r}" class="fill" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 29 29)"/></svg><b>${done}/${target}</b></div>`;
}

// ---------- onboarding ----------
const GOALS = [['muscle', 'Build muscle', 'Size and shape'], ['strength', 'Get stronger', 'Heavier lifts'], ['fatloss', 'Lose fat', 'Keep muscle, burn more'], ['general', 'Stay fit', 'Healthy and balanced']];
const LEVELS = [['beginner', 'Beginner', 'Under 1 year'], ['intermediate', 'Intermediate', '1–3 years'], ['advanced', 'Advanced', '3+ years']];
const EQUIP = [['gym', 'Full gym'], ['dumbbells', 'Dumbbells only'], ['bodyweight', 'No equipment']];

const chips = (list, key, cur, act) => `<div class="chips ${list.length === 3 && list[0][2] ? 'col' : list[0][2] ? 'two' : ''}">${list.map(([v, label, sub]) => `<button class="chip ${String(cur) === String(v) ? 'on' : ''}" data-act="${act}" data-k="${key}" data-v="${v}"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`).join('')}</div>`;

function onboardingHTML() {
  const o = ui.ob;
  return `<main class="screen onboard">
    <div class="logo">F</div>
    <h1>Meet your gym assistant</h1>
    <p class="lead">Answer a few questions and I'll build your plan, pick your weights, time your rests and track your progress. No setup after this.</p>
    <label class="field"><span>Your name</span><input type="text" data-field="ob-name" value="${esc(o.name)}" placeholder="First name" autocomplete="given-name" maxlength="24"></label>
    <h3>What's your main goal?</h3>${chips(GOALS, 'goal', o.goal, 'ob-set')}
    <h3>Training experience</h3>${chips(LEVELS, 'experience', o.experience, 'ob-set')}
    <h3>Days per week you can train</h3>${chips([2, 3, 4, 5, 6].map((d) => [d, d]), 'days', o.days, 'ob-set')}
    <h3>What do you have access to?</h3>${chips(EQUIP, 'equipment', o.equipment, 'ob-set')}
    <h3>Units and bodyweight</h3>
    <div class="row gap">${chips([['kg', 'kg'], ['lb', 'lb']], 'unit', o.unit, 'ob-set')}
      <label class="field grow"><span>Bodyweight (${o.unit})</span><input type="number" inputmode="decimal" step="any" min="20" data-field="ob-bw" value="${esc(o.bodyweight)}" placeholder="${o.unit === 'kg' ? '75' : '165'}"></label></div>
    <p class="muted small">Used only to suggest safe starting weights. Everything stays on your phone.</p>
    <button class="btn primary block" data-act="ob-finish">Build my plan</button>
  </main>`;
}

// ---------- today ----------
function insightHTML(i) {
  return `<section class="card insight ${i.tone}"><div><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></div>${i.action ? `<button class="btn sm ${i.tone === 'warn' ? 'primary' : 'ghost'}" data-act="${i.action.act}">${esc(i.action.label)}</button>` : ''}</section>`;
}

function todayHTML() {
  const now = new Date(), p = S.profile;
  expireDeload(now);
  const idx = nextIdx(), next = S.plan.templates[idx];
  const wk = weekStart(now);
  const done = S.sessions.filter((s) => new Date(s.date) >= wk).length;
  const trainedToday = S.sessions.some((s) => dayKey(s.date) === dayKey(now));
  const deload = isDeload(S.plan, now);
  const dots = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => {
    const key = dayKey(addDays(wk, i)), hit = S.sessions.some((s) => dayKey(s.date) === key);
    const cardio = !hit && S.cardio.some((c) => dayKey(c.date) === key);
    return `<div class="day ${hit ? 'hit' : ''} ${cardio ? 'cardio' : ''} ${key === dayKey(now) ? 'today' : ''}"><span>${l}</span><i>${hit || cardio ? icon('check', 14) : ''}</i></div>`;
  }).join('');
  const today = dayKey(now), steps = dayValue(S.steps, today), water = dayValue(S.water, today);
  const cardioMin = cardioBetween(S.cardio, wk, addDays(wk, 7));
  const remindNudge = !S.prefs.remindersSet && !S.prefs.remindersDismissed && S.sessions.length > 0;
  const rows = next.exercises.map((e) => {
    const s = suggest(e, S.sessions, p, { now, deload });
    return `<li><span>${esc(EXERCISES[e.exId].name)}</span><em>${s.sets} × ${e.lo}–${e.hi}${s.w ? ` · ${fmt(s.w)} ${p.unit}` : ''}</em></li>`;
  }).join('');
  const showInstall = !standalone() && !S.prefs.installDismissed && (deferredPrompt || isIOS());
  return `<main class="screen">
    <header class="top"><div><p class="eyebrow">${greeting(now)}</p><h1>${esc(p.name)}</h1></div>${ring(done, p.days)}</header>
    <section class="card coach"><div class="ava">F</div><p>${esc(coachMessage(S, now, next))}</p></section>
    ${S.active ? `<section class="card next"><p class="eyebrow">In progress</p><h2>${esc(S.active.name)}</h2><p class="muted">Started ${Math.round((Date.now() - S.active.startedAt) / 60000)} min ago · ${S.active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)} sets logged</p><button class="btn primary block" data-act="resume">Resume workout</button></section>`
      : `<section class="card next"><div class="row between"><div><p class="eyebrow">${trainedToday ? 'Next up' : "Today's workout"}${deload ? ' · deload' : ''}</p><h2>${esc(next.name)}</h2></div><span class="pill">~${estMinutes(next)} min</span></div>
        <ul class="exlist">${rows}</ul><button class="btn primary block" data-act="start" data-t="${idx}">Start workout</button><button class="link" data-act="pick-template">Choose a different workout</button></section>`}
    ${showInstall ? `<section class="card insight info"><div><h3>Put it on your home screen</h3><p>Opens full screen like a real app and works offline.</p></div><button class="btn sm primary" data-act="install">Install</button><button class="x" data-act="dismiss-install" aria-label="Dismiss">${icon('plus', 16)}</button></section>` : ''}
    <section class="card"><div class="row between"><h3>Today's activity</h3></div>
      ${meter('Steps', steps, p.stepGoal, `${steps.toLocaleString()} / ${p.stepGoal.toLocaleString()}`, `<button class="btn sm ghost" data-act="log-steps">Log</button>`)}
      ${meter('Water', water, p.waterGoal, `${water} / ${p.waterGoal} glasses`, `<button class="btn sm ghost sq" data-act="water" data-d="-1" aria-label="Remove a glass">${icon('minus', 16)}</button><button class="btn sm ghost sq" data-act="water" data-d="1" aria-label="Add a glass">${icon('plus', 16)}</button>`)}
      ${meter('Cardio this week', cardioMin, p.cardioGoal, `${cardioMin} / ${p.cardioGoal} min`, `<button class="btn sm ghost" data-act="log-cardio">Log</button>`)}
    </section>
    <section class="card"><div class="row between"><h3>This week</h3><span class="muted small">${done} of ${p.days} sessions</span></div><div class="week">${dots}</div></section>
    ${remindNudge ? `<section class="card insight info"><div><h3>Never miss a session</h3><p>Add your training days to your phone's calendar, with an alert before each workout.</p></div><button class="btn sm primary" data-act="reminders">Set up</button><button class="x" data-act="dismiss-reminders" aria-label="Dismiss">${icon('plus', 16)}</button></section>` : ''}
    ${[...activityInsights(S, now), ...insights(S, now)].map(insightHTML).join('')}
  </main>`;
}

// ---------- workout ----------
function setRow(i, j, s, bw) {
  return `<div class="set ${s.done ? 'done' : ''}"><span class="n">${j + 1}</span>
    <input class="num" type="number" inputmode="decimal" step="any" min="0" data-field="w" data-i="${i}" data-j="${j}" value="${s.w === '' ? '' : s.w}" placeholder="${bw ? '0' : ''}" aria-label="Set ${j + 1} weight">
    <input class="num" type="number" inputmode="numeric" min="0" data-field="r" data-i="${i}" data-j="${j}" value="${s.r}" aria-label="Set ${j + 1} reps">
    <button class="check" data-act="toggle-set" data-i="${i}" data-j="${j}" aria-label="${s.done ? 'Undo set' : 'Mark set done'}" aria-pressed="${s.done}">${icon('check', 20)}</button></div>`;
}

function exCardHTML(e, i, warmIdx) {
  const ex = EXERCISES[e.exId], bw = ex.factor === null, demo = demoFrames(e.exId);
  const warm = i === warmIdx ? warmups(e.exId, +e.sets[0].w, unit()) : [];
  const done = e.sets.every((s) => s.done);
  const arrow = { up: '↑', down: '↓', back: '↺', deload: '≈', new: '★', same: '→' }[e.tone] || '';
  return `<section class="card ex ${done ? 'complete' : ''}">
    <div class="ex-head">${demo ? `<button class="ex-thumb" data-act="howto" data-id="${e.exId}" aria-label="How to do ${esc(ex.name)}"><img src="${demo[0]}" alt="" loading="lazy"></button>` : ''}<div class="grow"><h3><button class="ex-name" data-act="howto" data-id="${e.exId}">${esc(ex.name)} ${icon('info', 16)}</button></h3><p class="muted small">${cap(ex.muscle)} · ${e.sets.length} × ${e.lo}–${e.hi} · rest ${e.rest}s</p></div><button class="icon-btn" data-act="ex-menu" data-i="${i}" aria-label="Exercise options">${icon('more')}</button></div>
    <p class="note ${e.tone}"><b>${arrow}</b> ${esc(e.note)}</p>
    ${e.last ? `<p class="muted small">Last time: ${esc(formatSets(e.last, unit()))}</p>` : ''}
    ${warm.length ? `<p class="muted small">Warm-up: ${warm.map((s) => `${fmt(s.w)}×${s.r}`).join(' → ')}</p>` : ''}
    <div class="sets"><div class="set-h"><span>Set</span><span>${bw ? '+' : ''}${unit()}</span><span>Reps</span><span></span></div>${e.sets.map((s, j) => setRow(i, j, s, bw)).join('')}</div>
    <button class="btn ghost sm" data-act="add-set" data-i="${i}">${icon('plus', 16)} Add set</button>
  </section>`;
}

function workoutHTML() {
  const a = S.active;
  const warmIdx = a.exercises.findIndex((e) => warmups(e.exId, +e.sets[0].w, unit()).length);
  return `<main class="screen workout">
    <header class="wk-top"><button class="icon-btn" data-act="leave" aria-label="Back to home">${icon('back')}</button><div class="grow"><h2>${esc(a.name)}</h2><p class="mono muted" id="elapsed">0:00</p></div><button class="btn primary sm" data-act="finish">Finish</button></header>
    ${a.exercises.map((e, i) => exCardHTML(e, i, warmIdx)).join('')}
    <button class="btn ghost block" data-act="add-exercise">${icon('plus', 18)} Add exercise</button>
  </main>
  <div class="restbar" id="restbar" hidden><div class="rb-fill" id="rbfill"></div><b id="rbtime" class="mono">0:00</b><span id="rblabel">Rest</span><button class="btn sm ghost" data-act="rest-add" data-s="-15">−15</button><button class="btn sm ghost" data-act="rest-add" data-s="15">+15</button><button class="btn sm primary" data-act="rest-skip">Skip</button></div>`;
}

// ---------- progress ----------
function progressHTML() {
  const now = new Date(), p = S.profile;
  const month = S.sessions.filter((s) => new Date(s.date) >= new Date(now.getFullYear(), now.getMonth(), 1)).length;
  const wk = weekStart(now);
  const weekVol = S.sessions.filter((s) => new Date(s.date) >= wk).reduce((v, s) => v + s.volume, 0);
  const prCount = S.sessions.reduce((n, s) => n + (s.prs || []).length, 0);

  const counts = {};
  for (const s of S.sessions) for (const e of s.exercises) counts[e.exId] = (counts[e.exId] || 0) + 1;
  const exIds = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  if (!exIds.includes(ui.chartEx)) ui.chartEx = exIds[0] || null;
  const series = ui.chartEx ? S.sessions.filter((s) => !s.deload).map((s) => ({ t: new Date(s.date).getTime(), e: s.exercises.find((e) => e.exId === ui.chartEx) })).filter((x) => x.e).map((x) => ({ t: x.t, v: bestScore(x.e.sets) })) : [];
  const weighted = ui.chartEx && S.sessions.some((s) => s.exercises.some((e) => e.exId === ui.chartEx && e.sets.some((x) => x.w > 0)));

  const wpts = S.weights.map((w) => ({ t: parseKey(w.date).getTime(), v: w.v }));
  const wChange = wpts.length > 1 ? wpts.at(-1).v - wpts[0].v : 0;

  const muscle = setsPerMuscle(S.sessions, wk);
  const maxM = Math.max(10, ...Object.values(muscle));
  const prs = S.sessions.flatMap((s) => (s.prs || []).map((pr) => ({ ...pr, date: s.date }))).slice(-5).reverse();
  const hist = S.sessions.slice(-15).reverse();
  const stepAvg = stepStats(S.steps, now);
  const stepDays = Array.from({ length: 14 }, (_, i) => { const d = addDays(now, i - 13); return { label: String(d.getDate()), v: dayValue(S.steps, dayKey(d)) }; });
  const recentCardio = S.cardio.slice(-5).reverse();

  return `<main class="screen">
    <header class="top"><h1>Progress</h1></header>
    <div class="stats">
      <div class="stat"><b>${S.sessions.length}</b><span>workouts</span></div>
      <div class="stat"><b>${month}</b><span>this month</span></div>
      <div class="stat"><b>${Math.round(weekVol).toLocaleString()}</b><span>${p.unit} lifted this week</span></div>
      <div class="stat"><b>${prCount}</b><span>records set</span></div>
    </div>
    <section class="card"><div class="row between"><h3>Sessions per week</h3><span class="muted small">goal ${p.days}</span></div>${barChart(weeklyCounts(S.sessions, 8, now).map((w) => ({ label: sdate(w.start), v: w.count })), p.days, 'Sessions per week')}</section>
    <section class="card"><div class="row between"><h3>Steps</h3><button class="btn sm ghost" data-act="log-steps">Log steps</button></div>
      <p class="muted small">${stepAvg.avg !== null ? `${stepAvg.avg.toLocaleString()} a day over the last 7 days · goal ${p.stepGoal.toLocaleString()}` : `Log a few days to see your average · goal ${p.stepGoal.toLocaleString()}`}</p>
      ${barChart(stepDays, p.stepGoal, 'Steps per day, last 14 days', fmtK)}</section>
    <section class="card"><div class="row between"><h3>Cardio</h3><button class="btn sm ghost" data-act="log-cardio">Log cardio</button></div>
      <p class="muted small">Minutes per week · goal ${p.cardioGoal}</p>
      ${barChart(weeklyCardio(S.cardio, 8, now).map((w) => ({ label: sdate(w.start), v: w.v })), p.cardioGoal, 'Cardio minutes per week')}
      ${recentCardio.length ? `<ul class="list">${recentCardio.map((c) => `<li><span>${esc(CARDIO_TYPES[c.type][0])} <small class="muted">${fdate(c.date)}</small><small class="muted">${c.min} min${c.km ? ` · ${fmt(p.unit === 'kg' ? c.km : c.km / KM_PER_MI)} ${p.unit === 'kg' ? 'km' : 'mi'} · ${pace(c.min, c.km, p.unit)}` : ''} · about ${c.kcal} kcal</small></span><button class="icon-btn sm" data-act="del-cardio" data-id="${c.id}" aria-label="Delete this cardio session">${icon('trash', 16)}</button></li>`).join('')}</ul>` : ''}</section>
    <section class="card"><div class="row between"><h3>Lift progress</h3>${exIds.length ? `<select data-field="chart-ex" aria-label="Exercise">${exIds.map((id) => `<option value="${id}" ${id === ui.chartEx ? 'selected' : ''}>${esc(EXERCISES[id].name)}</option>`).join('')}</select>` : ''}</div>
      ${series.length ? `<p class="muted small">${weighted ? `Estimated one-rep max (${p.unit})` : 'Best set (reps)'}${series.length > 1 ? ` · ${series.at(-1).v - series[0].v >= 0 ? '+' : ''}${fmt(series.at(-1).v - series[0].v)} since first session` : ''}</p>` : ''}
      ${lineChart(series)}</section>
    <section class="card"><div class="row between"><h3>Bodyweight</h3><button class="btn sm ghost" data-act="weigh-in">Log weight</button></div>
      ${wpts.length ? `<p class="muted small">${fmt(wpts.at(-1).v)} ${p.unit} now${wpts.length > 1 ? ` · ${wChange >= 0 ? '+' : ''}${fmt(wChange)} ${p.unit} since ${sdate(wpts[0].t)}` : ''}</p>` : ''}${lineChart(wpts)}</section>
    <section class="card"><div class="row between"><h3>Sets this week</h3><span class="muted small">aim for 10+ per muscle</span></div>
      <div class="muscles">${MUSCLES.map((m) => `<div class="mrow"><span>${cap(m)}</span><div class="mbar"><i style="width:${((muscle[m] || 0) / maxM) * 100}%" class="${(muscle[m] || 0) >= 10 ? 'hit' : ''}"></i></div><b>${muscle[m] || 0}</b></div>`).join('')}</div></section>
    ${prs.length ? `<section class="card"><h3>Recent records</h3><ul class="list">${prs.map((pr) => `<li><span>🏆 ${esc(EXERCISES[pr.exId].name)}</span><em>${pr.kind === 'weight' ? `${fmt(pr.value)} ${p.unit} est. max` : `${pr.value} reps`} · ${sdate(pr.date)}</em></li>`).join('')}</ul></section>` : ''}
    <section class="card"><h3>History</h3>${hist.length ? `<ul class="list">${hist.map((s) => `<li><button class="rowbtn" data-act="open-session" data-id="${s.id}"><span>${esc(s.name)}</span><em>${fdate(s.date)} · ${s.durMin} min</em></button></li>`).join('')}</ul>` : '<p class="muted">Your finished workouts will show up here.</p>'}</section>
  </main>`;
}

// ---------- plan ----------
function planHTML() {
  const p = S.profile, goal = GOALS.find((g) => g[0] === p.goal)[1];
  return `<main class="screen">
    <header class="top"><div><h1>Your plan</h1><p class="muted">${goal} · ${p.days} days/week · ${cap(p.equipment === 'gym' ? 'full gym' : p.equipment)}</p></div></header>
    <p class="muted small">I pick weights and reps for every session from what you did last time. Workouts rotate in order, so a missed day never breaks the plan.</p>
    ${S.plan.source === 'gim' ? `<section class="card insight good"><div><h3>Designed with GIM</h3><p>${esc(S.plan.title)}</p></div>${S.prevPlan ? '<button class="btn sm ghost" data-act="restore-plan">Undo</button>' : ''}</section>` : ''}
    ${ui.planStale ? staleBanner() : ''}
    ${S.plan.templates.map((t, ti) => `<section class="card"><div class="row between"><div><p class="eyebrow">${ti === nextIdx() ? 'Next up' : `Day ${ti + 1}`}</p><h2>${esc(t.name)}</h2></div><button class="btn sm ghost" data-act="start" data-t="${ti}">Start</button></div>
      <ul class="list">${t.exercises.map((e, k) => `<li><span><button class="ex-name" data-act="howto" data-id="${e.exId}">${esc(EXERCISES[e.exId].name)}</button><small class="muted"> ${cap(EXERCISES[e.exId].muscle)}</small></span><em>${e.sets} × ${e.lo}–${e.hi}</em><button class="icon-btn sm" data-act="plan-swap" data-t="${ti}" data-k="${k}" aria-label="Swap ${esc(EXERCISES[e.exId].name)}">${icon('swap', 18)}</button></li>`).join('')}</ul></section>`).join('')}
    <button class="btn ghost block" data-act="rebuild-confirm">Rebuild plan from my settings</button>
  </main>`;
}

const staleBanner = () => `<section class="card insight warn"><div><h3>Settings changed</h3><p>Rebuild the plan to match. This replaces your current plan and swaps; your history stays.</p></div><button class="btn sm primary" data-act="rebuild">Rebuild</button></section>`;

// ---------- settings ----------
function settingsHTML() {
  const p = S.profile;
  return `<main class="screen">
    <header class="top"><h1>Profile</h1></header>
    ${ui.planStale ? staleBanner() : ''}
    <section class="card"><label class="field"><span>Name</span><input type="text" data-field="p-name" value="${esc(p.name)}" maxlength="24"></label>
      <label class="field"><span>Bodyweight (${p.unit})</span><input type="number" inputmode="decimal" step="any" data-field="p-bw" value="${p.bodyweight}"></label>
      <h3>Units</h3>${chips([['kg', 'kg'], ['lb', 'lb']], 'unit', p.unit, 'set-profile')}
      <h3>Goal</h3>${chips(GOALS, 'goal', p.goal, 'set-profile')}
      <h3>Experience</h3>${chips(LEVELS, 'experience', p.experience, 'set-profile')}
      <h3>Days per week</h3>${chips([2, 3, 4, 5, 6].map((d) => [d, d]), 'days', p.days, 'set-profile')}
      <h3>Equipment</h3>${chips(EQUIP, 'equipment', p.equipment, 'set-profile')}</section>
    <section class="card"><h3>Daily targets</h3>
      <label class="field"><span>Steps per day</span><input type="number" inputmode="numeric" min="1000" step="500" data-field="p-stepgoal" value="${p.stepGoal}"></label>
      <label class="field"><span>Glasses of water per day (250 ml / 8 oz)</span><input type="number" inputmode="numeric" min="1" data-field="p-watergoal" value="${p.waterGoal}"></label>
      <label class="field"><span>Cardio minutes per week</span><input type="number" inputmode="numeric" min="10" step="10" data-field="p-cardiogoal" value="${p.cardioGoal}"></label>
      <p class="muted small">Set automatically from your goal and bodyweight. Change them any time.</p>
      <button class="btn ghost" data-act="steps-auto">${gt('autoSteps')}</button></section>
    <section class="card"><h3>Workout reminders</h3><p class="muted small">${S.prefs.reminders ? `Added for ${S.prefs.reminders.days.map((d) => WEEKDAYS[d]).join(', ')} at ${S.prefs.reminders.time}.` : 'Put your training days in your phone\'s calendar, with an alert before each workout.'}</p><button class="btn ghost" data-act="reminders">${icon('bell', 18)} ${S.prefs.reminders ? 'Change reminders' : 'Set up reminders'}</button></section>
    <section class="card"><h3>Rest timer</h3><label class="switch"><input type="checkbox" data-field="sound" ${S.prefs.sound ? 'checked' : ''}><span>Beep and vibrate when rest ends</span></label></section>
    <section class="card"><h3>Your data</h3><p class="muted small">Everything is stored on this phone only. Export a backup now and then, especially before changing phones or clearing browser data.</p>
      <div class="row gap wrap"><button class="btn ghost" data-act="export">Export backup</button><label class="btn ghost">Import backup<input type="file" accept="application/json,.json" hidden data-field="import"></label></div></section>
    <section class="card"><h3>Install</h3><button class="btn ghost" data-act="install">How to add to home screen</button></section>
    <section class="card"><button class="btn danger" data-act="reset-confirm">Erase all data</button><p class="muted small">Forge ${VERSION}</p></section>
  </main>`;
}

const TABS = [['today', 'Today', 'home'], ['progress', 'Progress', 'chart'], ['gim', 'GIM', 'gim'], ['plan', 'Plan', 'list'], ['profile', 'Profile', 'user']];
function tabsHTML() {
  const gimScreen = () => gimHTML(S, { more: icon('more'), mic: icon('mic', 26), send: icon('send', 22) });
  const body = { today: todayHTML, progress: progressHTML, gim: gimScreen, plan: planHTML, profile: settingsHTML }[ui.tab]();
  return `${body}<nav class="tabbar" aria-label="Main">${TABS.map(([k, label, ic]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-act="nav" data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`).join('')}</nav>`;
}

// ---------- sheets ----------
function panel(inner) { return `<div class="backdrop" data-act="close-sheet"></div><div class="panel" role="dialog" aria-modal="true"><div class="grab"></div>${inner}</div>`; }

function confirmSheet(title, text, act, label, danger) {
  return panel(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><div class="stack"><button class="btn ${danger ? 'danger' : 'primary'} block" data-act="${act}">${esc(label)}</button><button class="btn ghost block" data-act="close-sheet">Cancel</button></div>`);
}

function sheetHTML(sh) {
  switch (sh.type) {
    case 'templates':
      return panel(`<h2>Choose a workout</h2><ul class="list big">${S.plan.templates.map((t, i) => `<li><button class="rowbtn" data-act="start" data-t="${i}"><span>${esc(t.name)}${i === nextIdx() ? ' <small class="pill">next</small>' : ''}</span><em>${t.exercises.length} exercises · ~${estMinutes(t)} min</em></button></li>`).join('')}</ul>`);
    case 'swap': {
      const cur = sh.scope === 'plan' ? S.plan.templates[sh.t].exercises[sh.k].exId : S.active.exercises[sh.i].exId;
      const alts = alternatives(cur, S.profile.equipment);
      return panel(`<h2>Swap ${esc(EXERCISES[cur].name)}</h2><p class="muted small">Same muscle group, for your equipment. I'll pick a starting weight.</p>${alts.length ? `<ul class="list big">${alts.map((id) => `<li><button class="rowbtn" data-act="do-swap" data-id="${id}"><span>${esc(EXERCISES[id].name)}</span><em>${cap(EXERCISES[id].equip)}</em></button></li>`).join('')}</ul>` : '<p class="muted">No other options with your equipment.</p>'}`);
    }
    case 'add-exercise':
      return panel(`<h2>Add exercise</h2>${MUSCLES.map((m) => {
        const ids = Object.keys(EXERCISES).filter((id) => EXERCISES[id].muscle === m && allowed(id, S.profile.equipment) && !S.active.exercises.some((e) => e.exId === id));
        return ids.length ? `<h3>${cap(m)}</h3><ul class="list big">${ids.map((id) => `<li><button class="rowbtn" data-act="do-add" data-id="${id}"><span>${esc(EXERCISES[id].name)}</span><em>${cap(EXERCISES[id].equip)}</em></button></li>`).join('')}</ul>` : '';
      }).join('')}`);
    case 'ex-menu': {
      const e = S.active.exercises[sh.i];
      return panel(`<h2>${esc(EXERCISES[e.exId].name)}</h2><div class="stack"><button class="btn ghost block" data-act="swap-active" data-i="${sh.i}">${icon('swap', 18)} Swap exercise</button><button class="btn ghost block" data-act="remove-set" data-i="${sh.i}">Remove last set</button><button class="btn danger block" data-act="skip-ex" data-i="${sh.i}">${icon('trash', 18)} Skip this exercise</button></div>`);
    }
    case 'weigh': {
      const last = S.weights.at(-1);
      return panel(`<h2>Log bodyweight</h2><label class="field"><span>Weight (${unit()})</span><input type="number" inputmode="decimal" step="any" data-field="weigh" value="${last ? last.v : S.profile.bodyweight}" autofocus></label><button class="btn primary block" data-act="save-weight">Save</button>`);
    }
    case 'finish': {
      const all = S.active.exercises.reduce((n, e) => n + e.sets.length, 0), done = S.active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
      return panel(done ? `<h2>Finish workout?</h2><p class="muted">${done} of ${all} sets logged.${done < all ? ' Sets you did not tick are not saved.' : ''}</p><div class="stack"><button class="btn primary block" data-act="finish-save">Finish and save</button><button class="btn ghost block" data-act="close-sheet">Keep going</button><button class="btn danger block" data-act="discard-confirm">Discard workout</button></div>`
        : `<h2>No sets logged yet</h2><p class="muted">Tick the check on each set you finish and I'll save the workout.</p><div class="stack"><button class="btn primary block" data-act="close-sheet">Back to workout</button><button class="btn danger block" data-act="discard">Discard workout</button></div>`);
    }
    case 'summary': {
      const s = S.sessions.find((x) => x.id === sh.id);
      const sets = s.exercises.reduce((n, e) => n + e.sets.length, 0);
      const next = S.plan.templates[nextIdx()];
      return panel(`<div class="center"><div class="trophy">${s.prs.length ? '🏆' : '💪'}</div><h2>Workout complete</h2><p class="muted">${esc(s.name)}</p></div>
        <div class="stats three"><div class="stat"><b>${s.durMin}</b><span>min</span></div><div class="stat"><b>${sets}</b><span>sets</span></div><div class="stat"><b>${Math.round(s.volume).toLocaleString()}</b><span>${unit()} lifted</span></div></div>
        ${s.prs.length ? `<h3>New records</h3><ul class="list">${s.prs.map((pr) => `<li><span>🏆 ${esc(EXERCISES[pr.exId].name)}</span><em>${pr.kind === 'weight' ? `${fmt(pr.value)} ${unit()} est. max` : `${pr.value} reps`}</em></li>`).join('')}</ul>` : ''}
        <p class="muted small">Next up: ${esc(next.name)}. I've already adjusted your weights from today.</p>
        <div class="row gap"><button class="btn ghost grow" data-act="share" data-id="${s.id}">${icon('share', 18)} Share</button><button class="btn primary grow" data-act="close-sheet">Done</button></div>`);
    }
    case 'steps': {
      const cur = dayValue(S.steps, dayKey(addDays(new Date(), sh.day === 'yesterday' ? -1 : 0)));
      return panel(`<h2>Log steps</h2>${chips([['today', 'Today'], ['yesterday', 'Yesterday']], 'day', sh.day, 'steps-day')}
        <label class="field"><span>Steps</span><input type="number" inputmode="numeric" min="0" data-field="steps" value="${cur || ''}" placeholder="8000" autofocus></label>
        <p class="muted small">${isIOS() ? 'Copy the number from the Health app (Browse, Activity, Steps).' : 'Copy the number from Google Fit, Samsung Health or your watch app.'} Web apps can't read the step counter directly.</p>
        <button class="btn primary block" data-act="save-steps">Save</button>
        <button class="btn ghost block" data-act="steps-auto">${gt('autoSteps')}</button>`);
    }
    case 'cardio': {
      const u = unit() === 'kg' ? 'km' : 'mi';
      return panel(`<h2>Log cardio</h2><div class="chips grid3">${Object.entries(CARDIO_TYPES).map(([k, [label]]) => `<button class="chip ${sh.kind === k ? 'on' : ''}" data-act="cardio-type" data-v="${k}"><b>${label}</b></button>`).join('')}</div>
        <div class="row gap"><label class="field grow"><span>Minutes</span><input type="number" inputmode="numeric" min="1" data-field="cardio-min" value="${esc(sh.min || '')}" placeholder="30"></label>
        <label class="field grow"><span>Distance (${u}, optional)</span><input type="number" inputmode="decimal" step="any" min="0" data-field="cardio-dist" value="${esc(sh.dist || '')}" placeholder="${u === 'km' ? '5' : '3'}"></label></div>
        <p class="muted small">Calories are estimated from the activity, time and your bodyweight.</p>
        <button class="btn primary block" data-act="save-cardio">Save</button>`);
    }
    case 'reminders': {
      const r = sh.r;
      return panel(`<h2>Workout reminders</h2><p class="muted small">Pick your training days and time. Forge makes a calendar file and your phone adds the events, with alerts that work even when the app is closed.</p>
        <h3>Days</h3><div class="chips days">${WEEKDAYS.map((d, i) => `<button class="chip ${r.days.includes(i) ? 'on' : ''}" data-act="rem-day" data-d="${i}" aria-pressed="${r.days.includes(i)}"><b>${d}</b></button>`).join('')}</div>
        <label class="field"><span>Time</span><input type="time" data-field="rem-time" value="${r.time}"></label>
        <h3>Alert</h3>${chips([[0, 'At start'], [15, '15 min'], [30, '30 min'], [60, '1 hour']], 'alarm', r.alarm, 'rem-alarm')}
        <button class="btn primary block" data-act="rem-save">${icon('bell', 18)} Add to my calendar</button>
        <p class="muted small">Your phone opens the calendar file: tap Add All on iPhone, or Save on Android. To change them later, delete the Forge events in your calendar and add them again.${isIOS() && standalone() ? ' If nothing opens, do this once from Safari instead of the home screen app.' : ''}</p>`);
    }
    case 'howto': {
      const ex = EXERCISES[sh.id], demo = demoFrames(sh.id);
      return panel(`<h2>${esc(ex.name)}</h2><p class="muted">${cap(ex.muscle)} · ${cap(ex.equip)} · ${ex.kind}</p>
        ${demo ? `<div class="demo" role="img" aria-label="${esc(ex.name)}: start and end position"><img src="${demo[0]}" alt=""><img class="end" src="${demo[1]}" alt=""></div><p class="muted small">Photos: free-exercise-db (public domain)</p>` : ''}
        <ol class="steps cues">${(CUES[sh.id] || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
        <a class="btn ghost block" href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex.name} proper form`)}" target="_blank" rel="noopener">Watch a demo video</a>
        <button class="btn primary block" data-act="close-sheet">Got it</button>`);
    }
    case 'session': {
      const s = S.sessions.find((x) => x.id === sh.id);
      if (!s) return '';
      return panel(`<h2>${esc(s.name)}</h2><p class="muted">${fdate(s.date)} · ${s.durMin} min · ${Math.round(s.volume).toLocaleString()} ${unit()} lifted</p>
        ${s.exercises.map((e) => `<h3>${esc(EXERCISES[e.exId].name)}</h3><p>${esc(formatSets(e.sets, unit()))}</p>`).join('')}
        <div class="stack"><button class="btn ghost block" data-act="share" data-id="${s.id}">${icon('share', 18)} Share this workout</button>
        <button class="btn danger block" data-act="delete-session-confirm" data-id="${s.id}">${icon('trash', 18)} Delete this workout</button></div>`);
    }
    case 'install':
      return panel(`<h2>Add to your home screen</h2>${isIOS() ? '<ol class="steps"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>' : '<ol class="steps"><li>Open this page in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu.</li><li>Choose <b>Install app</b> (or <b>Add to Home screen</b>).</li></ol>'}<p class="muted small">After that it opens full screen, works offline and keeps your data on the phone.</p><button class="btn primary block" data-act="close-sheet">Got it</button>`);
    case 'gim-settings':
      return panel(gimSettingsHTML(S, chips));
    case 'steps-auto':
      return panel(stepsAutoHTML(S));
    case 'confirm':
      return confirmSheet(sh.title, sh.text, sh.act, sh.label, sh.danger);
    default:
      return '';
  }
}

function renderSheet() {
  const el = $('#sheet');
  el.innerHTML = ui.sheet ? sheetHTML(ui.sheet) : '';
  el.classList.toggle('open', !!ui.sheet);
  document.body.classList.toggle('noscroll', !!ui.sheet);
  const auto = $('[autofocus]', el);
  if (auto) auto.focus();
}

// ---------- render ----------
function render() {
  const y = window.scrollY;
  const root = $('#app');
  if (!S.profile) root.innerHTML = onboardingHTML();
  else if (S.active && ui.view === 'workout') root.innerHTML = workoutHTML();
  else { ui.view = 'tabs'; root.innerHTML = tabsHTML(); }
  renderSheet();
  window.scrollTo(0, y);
  syncTimers();
}

const openSheet = (sh) => { ui.sheet = sh; renderSheet(); };
const closeSheet = () => { ui.sheet = null; renderSheet(); };

// ---------- timers, sound, wake lock ----------
let ticker = null, actx = null, wake = null;

function primeAudio() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { /* no audio */ }
}

function alarm() {
  if (!S.prefs.sound) return;
  try {
    primeAudio();
    const t = actx.currentTime;
    [0, 0.2, 0.4].forEach((d) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
      o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + 0.18);
    });
  } catch { /* no audio */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

async function requestWake() {
  try {
    if (S.active && 'wakeLock' in navigator && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch { /* not allowed */ }
}
const releaseWake = () => { if (wake) wake.release().catch(() => {}); wake = null; };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') requestWake(); });

function updateTimers() {
  const a = S.active;
  if (!a) return;
  const el = $('#elapsed');
  if (el) el.textContent = clock(Date.now() - a.startedAt);
  const bar = $('#restbar');
  if (!bar) return;
  if (!a.rest) { bar.hidden = true; return; }
  bar.hidden = false;
  const left = Math.ceil((a.rest.end - Date.now()) / 1000);
  if (left > 0) {
    $('#rbtime').textContent = clock(left * 1000);
    $('#rblabel').textContent = 'Rest';
    $('#rbfill').style.width = `${Math.min(100, (1 - left / a.rest.total) * 100)}%`;
    bar.classList.remove('over');
  } else {
    if (!a.rest.fired && left < -5) { a.rest = null; persist(); bar.hidden = true; return; } // came back long after the rest ended
    if (!a.rest.fired) { a.rest.fired = true; a.rest.firedAt = Date.now(); persist(); alarm(); }
    $('#rbtime').textContent = '0:00';
    $('#rblabel').textContent = 'Go — next set!';
    $('#rbfill').style.width = '100%';
    bar.classList.add('over');
    if (Date.now() - a.rest.firedAt > 5000) { a.rest = null; persist(); bar.hidden = true; }
  }
}

function syncTimers() {
  clearInterval(ticker);
  if (S.active && ui.view === 'workout') { ticker = setInterval(updateTimers, 500); updateTimers(); requestWake(); }
}

// ---------- workout logic ----------
function startWorkout(t) {
  S.active = buildWorkout(S, t);
  ui.view = 'workout'; ui.sheet = null;
  persist(); render(); window.scrollTo(0, 0);
}

function isRecord(exId, set, exIdx) {
  const prior = { weight: 0, reps: 0 };
  const take = (sets) => { const b = bestScores(sets); prior.weight = Math.max(prior.weight, b.weight); prior.reps = Math.max(prior.reps, b.reps); };
  for (const s of S.sessions) { const m = s.exercises.find((x) => x.exId === exId); if (m && !s.deload) take(m.sets); }
  if (!prior.weight && !prior.reps) return false; // first time logging: nothing to beat
  const others = S.active.exercises[exIdx].sets.filter((x) => x.done && x !== set).map((x) => ({ w: +x.w || 0, r: +x.r }));
  take(others);
  return set.w > 0 ? prior.weight > 0 && e1rm(set.w, set.r) > prior.weight + 0.01 : prior.weight === 0 && set.r > prior.reps;
}

function commitFinish() {
  const a = S.active;
  const exercises = a.exercises
    .map((e) => ({ exId: e.exId, sets: e.sets.filter((s) => s.done && +s.r > 0).map((s) => ({ w: +s.w || 0, r: +s.r })) }))
    .filter((e) => e.sets.length);
  const prs = a.deload ? [] : findPRs(exercises, S.sessions.filter((s) => !s.deload));
  const session = {
    id: a.id, date: new Date().toISOString(), name: a.name, templateId: a.templateId, deload: a.deload,
    durMin: Math.max(1, Math.round((Date.now() - a.startedAt) / 60000)), volume: sessionVolume(exercises), prs, exercises,
  };
  S.sessions.push(session);
  S.plan.rotation = (a.templateIdx + 1) % S.plan.templates.length;
  S.active = null;
  releaseWake();
  persist();
  ui.view = 'tabs'; ui.tab = 'today';
  openSheet({ type: 'summary', id: session.id });
  render(); window.scrollTo(0, 0);
}

function swapExercise(newId) {
  const sh = ui.sheet, e = entryFor(newId, S.profile);
  if (sh.scope === 'plan') {
    S.plan.templates[sh.t].exercises[sh.k] = e;
  } else {
    const old = S.active.exercises[sh.i];
    const tpl = S.plan.templates[S.active.templateIdx];
    const k = tpl ? tpl.exercises.findIndex((x) => x.exId === old.exId) : -1;
    if (k >= 0) tpl.exercises[k] = e;
    S.active.exercises[sh.i] = makeExercise(e, S, new Date(), S.active.deload);
  }
  persist(); closeSheet(); render();
}

// ---------- files: share sheet when the phone has one, download otherwise ----------
function downloadFile(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function shareFile(blob, name, title) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  downloadFile(blob, name);
}

const fitText = (g, text, max) => { let t = text; while (g.measureText(t).width > max && t.length > 1) t = t.slice(0, -2) + '…'; return t; };

// A 1080×1350 picture of a finished workout. Built synchronously so the share sheet
// still counts as part of the tap (Safari refuses to share after an async gap).
function workoutImage(s) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d'), u = unit();
  const font = (w, px) => `${w} ${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  const box = (x, y, w, h, r, color) => { g.fillStyle = color; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); g.fill(); };
  const text = (t, x, y, w, px, color, align = 'left') => { g.font = font(w, px); g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y); };

  g.fillStyle = '#0f1115'; g.fillRect(0, 0, 1080, 1350);
  box(80, 80, 96, 96, 26, '#ff6a3d');
  g.textBaseline = 'middle'; text('F', 128, 130, 800, 60, '#1a0d08', 'center'); g.textBaseline = 'alphabetic';
  text('Forge', 200, 122, 700, 40, '#f2f4f8');
  text(fdate(s.date), 200, 166, 500, 32, '#8b93a3');
  g.font = font(800, 84); text(fitText(g, s.name, 920), 80, 320, 800, 84, '#f2f4f8');

  const sets = s.exercises.reduce((n, e) => n + e.sets.length, 0);
  [[String(s.durMin), 'minutes'], [String(sets), 'sets'], [Math.round(s.volume).toLocaleString(), `${u} lifted`]].forEach(([v, l], i) => {
    const x = 80 + i * 313;
    box(x, 380, 293, 190, 28, '#171a21');
    text(v, x + 32, 482, 800, 64, '#f2f4f8');
    text(l, x + 32, 534, 500, 30, '#8b93a3');
  });

  let y = 660;
  for (const pr of s.prs.slice(0, 3)) {
    g.font = font(700, 36);
    text(fitText(g, `🏆 ${EXERCISES[pr.exId].name}: ${pr.kind === 'weight' ? `${fmt(pr.value)} ${u} est. max` : `${pr.value} reps`}`, 920), 80, y, 700, 36, '#ff8a5c');
    y += 58;
  }
  if (s.prs.length) y += 20;
  const shown = s.exercises.slice(0, s.prs.length ? 5 : 7);
  for (const e of shown) {
    const best = e.sets.reduce((b, x) => ((x.w > 0 ? e1rm(x.w, x.r) : x.r) > (b.w > 0 ? e1rm(b.w, b.r) : b.r) ? x : b));
    const right = `${e.sets.length} × ${best.w > 0 ? `${fmt(best.w)} ${u} × ${best.r}` : `${best.r} reps`}`;
    g.font = font(500, 32);
    const rw = g.measureText(right).width;
    g.font = font(600, 36);
    text(fitText(g, EXERCISES[e.exId].name, 880 - rw), 80, y, 600, 36, '#f2f4f8');
    text(right, 1000, y, 500, 32, '#8b93a3', 'right');
    y += 64;
  }
  if (s.exercises.length > shown.length) text(`+ ${s.exercises.length - shown.length} more`, 80, y, 500, 30, '#8b93a3');
  text(`Tracked with Forge · ${location.host}${location.pathname}`, 540, 1270, 500, 28, '#8b93a3', 'center');

  const bin = atob(c.toDataURL('image/png').split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

// ---------- actions ----------
const PLAN_KEYS = ['goal', 'experience', 'days', 'equipment'];

const A = {
  nav(el) {
    if (ui.tab === 'gim' && el.dataset.tab !== 'gim') stopSpeaking();
    ui.tab = el.dataset.tab; render();
    window.scrollTo(0, ui.tab === 'gim' ? document.body.scrollHeight : 0);
  },

  'gim-send'() { const input = $('#gim-input'); if (input && input.value.trim()) { const text = input.value; input.value = ''; gimSend(text); } },
  'gim-chip': (el) => gimSend(el.dataset.text),
  'gim-mic': () => gimMic(),
  'gim-retry': () => gimRetry(),
  'gim-install': (el) => gimInstall(el.dataset.id),
  'gim-settings': () => { ui.gimDraft = {}; openSheet({ type: 'gim-settings' }); },
  'gim-lang'(el) { S.gim.lang = el.dataset.v; persist(); renderSheet(); render(); },
  'gim-connect'() {
    const d = ui.gimDraft || {};
    gimSetup(d.code ?? S.gim.code, d.url ?? S.gim.url);
    ui.gimDraft = {};
    if (ui.sheet && ui.sheet.type === 'gim-settings') closeSheet();
    if (configured()) syncSteps(true);
  },
  'gim-new-confirm': () => openSheet({ type: 'confirm', title: gt('newChatQ'), text: gt('newChatText'), act: 'gim-new', label: gt('newChat'), danger: true }),
  'gim-new'() { closeSheet(); gimNew(); },
  'steps-auto'() { personId(S); persist(); openSheet({ type: 'steps-auto' }); },
  async 'steps-sync'() {
    if (!configured()) { toast(gt('notReady')); return; }
    await syncSteps(true);
    toast(`Steps today: ${dayValue(S.steps, dayKey(new Date())).toLocaleString()}`);
  },
  'restore-plan'() {
    if (!S.prevPlan || S.active) return;
    [S.plan, S.prevPlan] = [S.prevPlan, S.plan];
    persist(); render(); toast('Previous plan restored');
  },
  start(el) { if (S.active) { ui.sheet = null; ui.view = 'workout'; render(); return; } startWorkout(+el.dataset.t); },
  resume() { ui.view = 'workout'; render(); window.scrollTo(0, 0); },
  leave() { ui.view = 'tabs'; ui.tab = 'today'; render(); window.scrollTo(0, 0); },
  'pick-template': () => openSheet({ type: 'templates' }),
  'close-sheet': closeSheet,

  'toggle-set'(el) {
    const e = S.active.exercises[+el.dataset.i], s = e.sets[+el.dataset.j];
    if (s.done) { s.done = false; persist(); render(); return; }
    const w = s.w === '' ? 0 : +s.w, r = +s.r;
    if (!(r > 0) || !(w >= 0)) { toast('Enter the reps you did first'); return; }
    s.w = w; s.r = r;
    primeAudio();
    const record = !S.active.deload && isRecord(e.exId, s, +el.dataset.i);
    s.done = true;
    if (record) toast('🏆 New personal record!');
    const finished = S.active.exercises.every((x) => x.sets.every((y) => y.done));
    S.active.rest = finished ? null : { end: Date.now() + e.rest * 1000, total: e.rest };
    persist(); render();
  },
  'add-set'(el) {
    const e = S.active.exercises[+el.dataset.i], l = e.sets.at(-1);
    e.sets.push({ w: l.w, r: l.r, done: false });
    persist(); render();
  },
  'remove-set'(el) {
    const e = S.active.exercises[+el.dataset.i];
    if (e.sets.length > 1) e.sets.pop();
    persist(); closeSheet(); render();
  },
  'ex-menu': (el) => openSheet({ type: 'ex-menu', i: +el.dataset.i }),
  'skip-ex'(el) {
    S.active.exercises.splice(+el.dataset.i, 1);
    if (!S.active.exercises.length) { S.active = null; releaseWake(); ui.view = 'tabs'; }
    persist(); closeSheet(); render();
  },
  'swap-active'(el) {
    const e = S.active.exercises[+el.dataset.i];
    if (e.sets.some((s) => s.done)) { closeSheet(); toast('Untick the logged sets first, then swap'); return; }
    openSheet({ type: 'swap', scope: 'active', i: +el.dataset.i });
  },
  'plan-swap': (el) => openSheet({ type: 'swap', scope: 'plan', t: +el.dataset.t, k: +el.dataset.k }),
  'do-swap': (el) => swapExercise(el.dataset.id),
  'add-exercise': () => openSheet({ type: 'add-exercise' }),
  'do-add'(el) {
    S.active.exercises.push(makeExercise(entryFor(el.dataset.id, S.profile), S, new Date(), S.active.deload));
    persist(); closeSheet(); render();
    window.scrollTo(0, document.body.scrollHeight);
  },
  'rest-add'(el) {
    const r = S.active.rest;
    if (r && !r.fired) { r.end += +el.dataset.s * 1000; r.total = Math.max(r.total, Math.ceil((r.end - Date.now()) / 1000)); persist(); updateTimers(); }
  },
  'rest-skip'() { S.active.rest = null; persist(); updateTimers(); },
  finish: () => openSheet({ type: 'finish' }),
  'finish-save': commitFinish,
  'discard-confirm': () => openSheet({ type: 'confirm', title: 'Discard this workout?', text: 'Nothing from it will be saved.', act: 'discard', label: 'Discard', danger: true }),
  discard() { S.active = null; releaseWake(); ui.view = 'tabs'; persist(); closeSheet(); render(); },

  'open-session': (el) => openSheet({ type: 'session', id: el.dataset.id }),
  'delete-session-confirm': (el) => openSheet({ type: 'confirm', title: 'Delete this workout?', text: 'It will be removed from your history and charts.', act: 'delete-session', label: 'Delete', danger: true, id: el.dataset.id }),
  'delete-session'() {
    const id = ui.sheet.id;
    S.sessions = S.sessions.filter((s) => s.id !== id);
    persist(); closeSheet(); render();
  },
  'weigh-in': () => openSheet({ type: 'weigh' }),
  'save-weight'() {
    const v = +$('[data-field="weigh"]').value;
    if (!(v > 20)) { toast('Enter your weight'); return; }
    const today = dayKey(new Date());
    S.weights = S.weights.filter((w) => w.date !== today);
    S.weights.push({ date: today, v });
    S.weights.sort((a, b) => a.date.localeCompare(b.date));
    S.profile.bodyweight = v;
    persist(); closeSheet(); render(); toast('Weight saved');
  },
  'accept-deload'() {
    const now = new Date();
    S.plan.deload = { start: dayKey(now), end: dayKey(addDays(now, 6)) };
    persist(); render(); toast('Deload week started. I lowered your loads.');
  },

  'ob-set'(el) { ui.ob[el.dataset.k] = el.dataset.k === 'days' ? +el.dataset.v : el.dataset.v; if (el.dataset.k === 'unit') ui.ob.bodyweight = ''; render(); },
  'ob-finish'() {
    const o = ui.ob, bw = +o.bodyweight;
    if (!o.name.trim()) { toast('What should I call you?'); return; }
    if (!(bw >= 20)) { toast('Add your bodyweight to set safe starting weights'); return; }
    S.profile = withGoals({ name: o.name.trim(), goal: o.goal, experience: o.experience, days: o.days, equipment: o.equipment, unit: o.unit, bodyweight: bw });
    S.plan = generatePlan(S.profile);
    S.weights = [{ date: dayKey(new Date()), v: bw }];
    persist();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    ui.tab = 'today'; render(); window.scrollTo(0, 0);
  },

  'set-profile'(el) {
    const k = el.dataset.k, v = k === 'days' ? +el.dataset.v : el.dataset.v;
    // a step goal still on the old default follows the new goal; a custom one is kept
    if (k === 'goal' && S.profile.stepGoal === defaultStepGoal(S.profile.goal)) S.profile.stepGoal = defaultStepGoal(v);
    if (k === 'unit') convertUnits(S, v); else S.profile[k] = v;
    if (PLAN_KEYS.includes(k)) ui.planStale = true;
    persist(); render();
  },
  rebuild() { S.plan = generatePlan(S.profile); ui.planStale = false; persist(); render(); toast('Plan rebuilt'); },
  'rebuild-confirm': () => openSheet({ type: 'confirm', title: 'Rebuild your plan?', text: 'This replaces your current plan and any swaps you made. Your history stays.', act: 'rebuild-close', label: 'Rebuild plan' }),
  'rebuild-close'() { closeSheet(); A.rebuild(); },

  install() {
    if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => { deferredPrompt = null; render(); }); }
    else openSheet({ type: 'install' });
  },
  'dismiss-install'() { S.prefs.installDismissed = true; persist(); render(); },

  export() {
    // the GIM access code stays on this phone, out of backup files
    const copy = { ...S, gim: { ...S.gim, code: '' } };
    shareFile(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }), `forge-backup-${dayKey(new Date())}.json`, 'Forge backup');
  },
  share(el) {
    const s = S.sessions.find((x) => x.id === el.dataset.id);
    if (s) shareFile(workoutImage(s), `forge-${dayKey(s.date)}.png`, s.name);
  },
  howto: (el) => openSheet({ type: 'howto', id: el.dataset.id }),

  'log-steps': () => openSheet({ type: 'steps', day: 'today' }),
  'steps-day'(el) { ui.sheet.day = el.dataset.v; renderSheet(); },
  'save-steps'() {
    const v = Math.round(+$('[data-field="steps"]').value);
    if (!(v >= 0) || v > 100000) { toast('Enter your step count'); return; }
    S.steps = setDay(S.steps, dayKey(addDays(new Date(), ui.sheet.day === 'yesterday' ? -1 : 0)), v);
    persist(); closeSheet(); render(); toast(v >= S.profile.stepGoal ? 'Step goal hit' : 'Steps saved');
  },
  water(el) {
    const key = dayKey(new Date()), v = Math.max(0, dayValue(S.water, key) + +el.dataset.d);
    S.water = setDay(S.water, key, v);
    persist(); render();
    if (+el.dataset.d > 0 && v === S.profile.waterGoal) toast('Water goal hit');
  },
  'log-cardio': () => openSheet({ type: 'cardio', kind: 'run', min: '', dist: '' }),
  'cardio-type'(el) { ui.sheet.kind = el.dataset.v; renderSheet(); },
  'save-cardio'() {
    const sh = ui.sheet, min = Math.round(+sh.min), dist = +sh.dist || 0;
    if (!(min > 0 && min <= 600)) { toast('Enter how many minutes'); return; }
    const km = dist > 0 ? +(unit() === 'kg' ? dist : dist * KM_PER_MI).toFixed(2) : 0;
    const kcal = cardioKcal(sh.kind, min, S.profile.bodyweight, unit());
    S.cardio.push({ id: String(Date.now()), date: new Date().toISOString(), type: sh.kind, min, km, kcal });
    persist(); closeSheet(); render(); toast(`${CARDIO_TYPES[sh.kind][0]} logged · about ${kcal} kcal`);
  },
  'del-cardio'(el) { S.cardio = S.cardio.filter((c) => c.id !== el.dataset.id); persist(); render(); toast('Cardio session removed'); },

  reminders() {
    const r = S.prefs.reminders || { days: DEFAULT_DAYS[S.profile.days] || DEFAULT_DAYS[3], time: '18:00', alarm: 30 };
    openSheet({ type: 'reminders', r: { ...r, days: [...r.days] } });
  },
  'rem-day'(el) { const d = +el.dataset.d, r = ui.sheet.r; r.days = r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d]; renderSheet(); },
  'rem-alarm'(el) { ui.sheet.r.alarm = +el.dataset.v; renderSheet(); },
  'rem-save'() {
    const r = ui.sheet.r;
    if (!r.days.length) { toast('Pick at least one day'); return; }
    if (!/^\d{2}:\d{2}$/.test(r.time)) { toast('Pick a time'); return; }
    const ics = buildICS({ days: r.days, time: r.time, alarm: r.alarm, minutes: Math.max(...S.plan.templates.map(estMinutes)), url: location.origin + location.pathname });
    downloadFile(new Blob([ics], { type: 'text/calendar' }), 'forge-workouts.ics');
    S.prefs.reminders = { days: [...r.days].sort((a, b) => a - b), time: r.time, alarm: r.alarm };
    S.prefs.remindersSet = true;
    persist(); closeSheet(); render(); toast('Calendar file ready: add it to your calendar');
  },
  'dismiss-reminders'() { S.prefs.remindersDismissed = true; persist(); render(); },
  'import-apply'() {
    S = normalize(ui.pendingImport); ui.pendingImport = null;
    persist(); closeSheet(); ui.tab = 'today'; render(); toast('Backup restored');
  },
  'reset-confirm': () => openSheet({ type: 'confirm', title: 'Erase everything?', text: 'Your plan, workouts and weights are deleted from this phone. This cannot be undone.', act: 'reset', label: 'Erase all data', danger: true }),
  reset() { wipe(); S = normalize(null); ui.tab = 'today'; ui.view = 'tabs'; ui.sheet = null; ui.planStale = false; ui.ob = { name: '', goal: 'muscle', experience: 'beginner', days: 3, equipment: 'gym', unit: 'kg', bodyweight: '' }; releaseWake(); render(); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !A[el.dataset.act]) return;
  A[el.dataset.act](el, e);
});

document.addEventListener('input', (e) => {
  const f = e.target.dataset.field, t = e.target;
  if (f === 'w' || f === 'r') {
    const s = S.active.exercises[+t.dataset.i].sets[+t.dataset.j];
    s[f] = t.value === '' ? '' : +t.value;
    if (s.done) { s.done = false; t.closest('.set').classList.remove('done'); } // editing a logged set reopens it
    persist();
  } else if (f === 'ob-name') ui.ob.name = t.value;
  else if (f === 'ob-bw') ui.ob.bodyweight = t.value;
  else if (f === 'p-name') { if (t.value.trim()) { S.profile.name = t.value.trim(); persist(); } }
  else if (f === 'p-bw') { if (+t.value >= 20) { S.profile.bodyweight = +t.value; persist(); } }
  else if (f === 'p-stepgoal') { if (+t.value >= 500) { S.profile.stepGoal = Math.round(+t.value); persist(); } }
  else if (f === 'p-watergoal') { if (+t.value >= 1 && +t.value <= 30) { S.profile.waterGoal = Math.round(+t.value); persist(); } }
  else if (f === 'p-cardiogoal') { if (+t.value >= 10) { S.profile.cardioGoal = Math.round(+t.value); persist(); } }
  else if (f === 'cardio-min' || f === 'cardio-dist') ui.sheet[f === 'cardio-min' ? 'min' : 'dist'] = t.value;
  else if (f === 'gim-code' || f === 'gim-url') { ui.gimDraft = ui.gimDraft || {}; ui.gimDraft[f === 'gim-code' ? 'code' : 'url'] = t.value; }
  else if (f === 'rem-time') ui.sheet.r.time = t.value;
});

document.addEventListener('change', async (e) => {
  const f = e.target.dataset.field, t = e.target;
  if (f === 'chart-ex') { ui.chartEx = t.value; render(); }
  else if (f === 'sound') { S.prefs.sound = t.checked; persist(); if (t.checked) alarm(); }
  else if (f === 'rem-time' && ui.sheet && ui.sheet.r) ui.sheet.r.time = t.value;
  else if (f === 'gim-voice') { S.gim.voice = t.checked; persist(); if (!t.checked) stopSpeaking(); }
  else if (f === 'gim-natural') { S.gim.natural = t.checked; persist(); }
  else if (f === 'import' && t.files[0]) {
    try {
      const obj = JSON.parse(await t.files[0].text());
      const bad = validateImport(obj);
      if (bad) { toast(bad); return; }
      ui.pendingImport = obj;
      openSheet({ type: 'confirm', title: 'Restore this backup?', text: `${obj.sessions.length} workouts for ${obj.profile.name}. This replaces what is on this phone now.`, act: 'import-apply', label: 'Restore backup', danger: true });
    } catch { toast('Could not read that file'); }
    t.value = '';
  }
});

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (S.profile && ui.view === 'tabs' && ui.tab === 'today' && !ui.sheet) render(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'gim-input') { e.preventDefault(); A['gim-send'](); }
});

// ---------- boot ----------
expireDeload();
if (S.profile && navigator.storage && navigator.storage.persist) navigator.storage.persist();
if (S.active) ui.view = 'workout';
attachGim({
  S: () => S, persist, toast,
  render: (toBottom) => { if (ui.view !== 'workout') { render(); if (toBottom && ui.tab === 'gim') window.scrollTo(0, document.body.scrollHeight); } },
});
render();
syncSteps();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncSteps(); });

if ('serviceWorker' in navigator && (!['localhost', '127.0.0.1'].includes(location.hostname) || location.search.includes('sw'))) {
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('New version ready — reopen the app to use it'); had = true; });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
