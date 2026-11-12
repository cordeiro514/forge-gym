import { EXERCISES, MUSCLES, allowed, alternatives } from './exercises.js';
import {
  dayKey, parseKey, addDays, weekStart, fmt, generatePlan, entryFor, estMinutes, suggest, buildWorkout, makeExercise,
  warmups, formatSets, findPRs, bestScores, bestScore, e1rm, sessionVolume, weeklyCounts, setsPerMuscle, coachMessage, insights, isDeload,
} from './coach.js';
import { load, save, wipe, convertUnits, normalize, validateImport } from './store.js';

const VERSION = '1.0.0';
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
};
const icon = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[n]}</svg>`;

// ---------- small helpers ----------
const unit = () => S.profile.unit;
const clock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const fdate = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const sdate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const greeting = (d) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening');
const nextIdx = () => S.plan.rotation % S.plan.templates.length;
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

function barChart(weeks, goal) {
  const W = 320, H = 120, T = 16, B = 20, max = Math.max(goal, ...weeks.map((w) => w.count), 1);
  const bw = (W - 20) / weeks.length;
  const Y = (v) => T + (1 - v / max) * (H - T - B);
  const bars = weeks.map((w, i) => {
    const x = 10 + i * bw + bw * 0.18, h = H - B - Y(w.count);
    return `<rect x="${x.toFixed(1)}" y="${Y(w.count).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="4" class="${w.count >= goal ? 'bar hit' : 'bar'}"/>
      <text x="${(x + bw * 0.32).toFixed(1)}" y="${(Y(w.count) - 4).toFixed(1)}" text-anchor="middle">${w.count || ''}</text>
      <text x="${(x + bw * 0.32).toFixed(1)}" y="${H - 5}" text-anchor="middle">${sdate(w.start)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sessions per week"><line x1="10" x2="${W - 10}" y1="${Y(goal)}" y2="${Y(goal)}" class="goal"/>${bars}</svg>`;
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
    return `<div class="day ${hit ? 'hit' : ''} ${key === dayKey(now) ? 'today' : ''}"><span>${l}</span><i>${hit ? icon('check', 14) : ''}</i></div>`;
  }).join('');
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
    <section class="card"><div class="row between"><h3>This week</h3><span class="muted small">${done} of ${p.days} sessions</span></div><div class="week">${dots}</div></section>
    ${insights(S, now).map(insightHTML).join('')}
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
  const ex = EXERCISES[e.exId], bw = ex.factor === null;
  const warm = i === warmIdx ? warmups(e.exId, +e.sets[0].w, unit()) : [];
  const done = e.sets.every((s) => s.done);
  const arrow = { up: '↑', down: '↓', back: '↺', deload: '≈', new: '★', same: '→' }[e.tone] || '';
  return `<section class="card ex ${done ? 'complete' : ''}">
    <div class="ex-head"><div><h3>${esc(ex.name)}</h3><p class="muted small">${cap(ex.muscle)} · ${e.sets.length} × ${e.lo}–${e.hi} · rest ${e.rest}s</p></div><button class="icon-btn" data-act="ex-menu" data-i="${i}" aria-label="Exercise options">${icon('more')}</button></div>
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

  return `<main class="screen">
    <header class="top"><h1>Progress</h1></header>
    <div class="stats">
      <div class="stat"><b>${S.sessions.length}</b><span>workouts</span></div>
      <div class="stat"><b>${month}</b><span>this month</span></div>
      <div class="stat"><b>${Math.round(weekVol).toLocaleString()}</b><span>${p.unit} lifted this week</span></div>
      <div class="stat"><b>${prCount}</b><span>records set</span></div>
    </div>
    <section class="card"><div class="row between"><h3>Sessions per week</h3><span class="muted small">goal ${p.days}</span></div>${barChart(weeklyCounts(S.sessions, 8, now), p.days)}</section>
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
    ${ui.planStale ? staleBanner() : ''}
    ${S.plan.templates.map((t, ti) => `<section class="card"><div class="row between"><div><p class="eyebrow">${ti === nextIdx() ? 'Next up' : `Day ${ti + 1}`}</p><h2>${esc(t.name)}</h2></div><button class="btn sm ghost" data-act="start" data-t="${ti}">Start</button></div>
      <ul class="list">${t.exercises.map((e, k) => `<li><span>${esc(EXERCISES[e.exId].name)}<small class="muted"> ${cap(EXERCISES[e.exId].muscle)}</small></span><em>${e.sets} × ${e.lo}–${e.hi}</em><button class="icon-btn sm" data-act="plan-swap" data-t="${ti}" data-k="${k}" aria-label="Swap ${esc(EXERCISES[e.exId].name)}">${icon('swap', 18)}</button></li>`).join('')}</ul></section>`).join('')}
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
    <section class="card"><h3>Rest timer</h3><label class="switch"><input type="checkbox" data-field="sound" ${S.prefs.sound ? 'checked' : ''}><span>Beep and vibrate when rest ends</span></label></section>
    <section class="card"><h3>Your data</h3><p class="muted small">Everything is stored on this phone only. Export a backup now and then, especially before changing phones or clearing browser data.</p>
      <div class="row gap wrap"><button class="btn ghost" data-act="export">Export backup</button><label class="btn ghost">Import backup<input type="file" accept="application/json,.json" hidden data-field="import"></label></div></section>
    <section class="card"><h3>Install</h3><button class="btn ghost" data-act="install">How to add to home screen</button></section>
    <section class="card"><button class="btn danger" data-act="reset-confirm">Erase all data</button><p class="muted small">Forge ${VERSION}</p></section>
  </main>`;
}

const TABS = [['today', 'Today', 'home'], ['progress', 'Progress', 'chart'], ['plan', 'Plan', 'list'], ['profile', 'Profile', 'user']];
function tabsHTML() {
  const body = { today: todayHTML, progress: progressHTML, plan: planHTML, profile: settingsHTML }[ui.tab]();
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
        <p class="muted small">Next up: ${esc(next.name)}. I've already adjusted your weights from today.</p><button class="btn primary block" data-act="close-sheet">Done</button>`);
    }
    case 'session': {
      const s = S.sessions.find((x) => x.id === sh.id);
      if (!s) return '';
      return panel(`<h2>${esc(s.name)}</h2><p class="muted">${fdate(s.date)} · ${s.durMin} min · ${Math.round(s.volume).toLocaleString()} ${unit()} lifted</p>
        ${s.exercises.map((e) => `<h3>${esc(EXERCISES[e.exId].name)}</h3><p>${esc(formatSets(e.sets, unit()))}</p>`).join('')}
        <button class="btn danger block" data-act="delete-session-confirm" data-id="${s.id}">${icon('trash', 18)} Delete this workout</button>`);
    }
    case 'install':
      return panel(`<h2>Add to your home screen</h2>${isIOS() ? '<ol class="steps"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>' : '<ol class="steps"><li>Open this page in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu.</li><li>Choose <b>Install app</b> (or <b>Add to Home screen</b>).</li></ol>'}<p class="muted small">After that it opens full screen, works offline and keeps your data on the phone.</p><button class="btn primary block" data-act="close-sheet">Got it</button>`);
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

// ---------- actions ----------
const PLAN_KEYS = ['goal', 'experience', 'days', 'equipment'];

const A = {
  nav(el) { ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
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
    S.profile = { name: o.name.trim(), goal: o.goal, experience: o.experience, days: o.days, equipment: o.equipment, unit: o.unit, bodyweight: bw };
    S.plan = generatePlan(S.profile);
    S.weights = [{ date: dayKey(new Date()), v: bw }];
    persist();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    ui.tab = 'today'; render(); window.scrollTo(0, 0);
  },

  'set-profile'(el) {
    const k = el.dataset.k, v = k === 'days' ? +el.dataset.v : el.dataset.v;
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

  async export() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const file = new File([blob], `forge-backup-${dayKey(new Date())}.json`, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Forge backup' }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
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
});

document.addEventListener('change', async (e) => {
  const f = e.target.dataset.field, t = e.target;
  if (f === 'chart-ex') { ui.chartEx = t.value; render(); }
  else if (f === 'sound') { S.prefs.sound = t.checked; persist(); if (t.checked) alarm(); }
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

// ---------- boot ----------
expireDeload();
if (S.profile && navigator.storage && navigator.storage.persist) navigator.storage.persist();
if (S.active) ui.view = 'workout';
render();

if ('serviceWorker' in navigator && (!['localhost', '127.0.0.1'].includes(location.hostname) || location.search.includes('sw'))) {
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('New version ready — reopen the app to use it'); had = true; });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
