// Run with: node test-coach.mjs
import assert from 'node:assert/strict';
import { generatePlan, suggest, buildWorkout, findPRs, insights, warmups, e1rm, dayKey, addDays, isDeload } from './coach.js';
import { EXERCISES, allowed } from './exercises.js';

const profile = (o = {}) => ({ name: 'Sam', goal: 'muscle', experience: 'beginner', days: 4, equipment: 'gym', unit: 'kg', bodyweight: 80, ...o });
const sess = (daysAgo, exId, sets, extra = {}) => ({ id: String(Math.random()), date: addDays(new Date(), -daysAgo).toISOString(), name: 'x', exercises: [{ exId, sets }], prs: [], ...extra });
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ', name); };

t('every program/equipment/experience combo builds a valid plan', () => {
  for (const days of [2, 3, 4, 5, 6]) for (const equipment of ['gym', 'dumbbells', 'bodyweight']) for (const experience of ['beginner', 'intermediate', 'advanced']) for (const goal of ['muscle', 'strength', 'fatloss', 'general']) {
    const plan = generatePlan(profile({ days, equipment, experience, goal }));
    for (const tpl of plan.templates) {
      assert.ok(tpl.exercises.length >= 3, `${equipment} ${tpl.name} has only ${tpl.exercises.length}`);
      assert.equal(new Set(tpl.exercises.map((e) => e.exId)).size, tpl.exercises.length, 'duplicate exercise in a day');
      for (const e of tpl.exercises) { assert.ok(allowed(e.exId, equipment)); assert.ok(e.lo < e.hi && e.sets >= 2); }
    }
  }
});

t('first session uses a starter weight, rounded and above the bar', () => {
  const p = profile({ bodyweight: 80 });
  const s = suggest({ exId: 'bb_bench', sets: 3, lo: 6, hi: 10, rest: 120 }, [], p);
  assert.equal(s.tone, 'new'); assert.equal(s.w, 32.5); assert.equal(s.r, 6);
  const sq = suggest({ exId: 'bb_squat', sets: 3, lo: 6, hi: 10, rest: 120 }, [], profile({ bodyweight: 40 }));
  assert.ok(sq.w >= 20);
});

t('hitting the top of the range on every set adds weight', () => {
  const e = { exId: 'bb_bench', sets: 3, lo: 6, hi: 10, rest: 120 };
  const s = suggest(e, [sess(3, 'bb_bench', [{ w: 60, r: 10 }, { w: 60, r: 10 }, { w: 60, r: 10 }])], profile());
  assert.equal(s.w, 62.5); assert.equal(s.r, 6); assert.equal(s.tone, 'up');
  const lb = suggest(e, [sess(3, 'bb_bench', [{ w: 135, r: 10 }, { w: 135, r: 10 }, { w: 135, r: 10 }])], profile({ unit: 'lb' }));
  assert.equal(lb.w, 140);
});

t('short of the top: same weight, aim one rep higher', () => {
  const e = { exId: 'bb_bench', sets: 3, lo: 6, hi: 10, rest: 120 };
  const s = suggest(e, [sess(3, 'bb_bench', [{ w: 60, r: 8 }, { w: 60, r: 7 }, { w: 60, r: 7 }])], profile());
  assert.equal(s.w, 60); assert.equal(s.r, 8); assert.equal(s.tone, 'same');
});

t('only part of the sets done never progresses', () => {
  const e = { exId: 'bb_bench', sets: 3, lo: 6, hi: 10, rest: 120 };
  const s = suggest(e, [sess(3, 'bb_bench', [{ w: 60, r: 10 }, { w: 60, r: 10 }])], profile());
  assert.equal(s.w, 60);
});

t('two rough sessions drop 10%; one rough session does not', () => {
  const e = { exId: 'bb_bench', sets: 3, lo: 6, hi: 10, rest: 120 };
  const rough = [{ w: 60, r: 5 }, { w: 60, r: 4 }, { w: 60, r: 4 }];
  assert.equal(suggest(e, [sess(3, 'bb_bench', rough)], profile()).w, 60);
  const s = suggest(e, [sess(6, 'bb_bench', rough), sess(3, 'bb_bench', rough)], profile());
  assert.equal(s.w, 55); assert.equal(s.tone, 'down');
});

t('3+ weeks away eases off 10%', () => {
  const s = suggest({ exId: 'bb_bench', sets: 3, lo: 6, hi: 10, rest: 120 }, [sess(30, 'bb_bench', [{ w: 60, r: 8 }, { w: 60, r: 8 }, { w: 60, r: 8 }])], profile());
  assert.equal(s.w, 55); assert.equal(s.tone, 'back');
});

t('bodyweight moves progress by reps only, then ask for a harder variation', () => {
  const e = { exId: 'pushup', sets: 3, lo: 8, hi: 15, rest: 90 };
  assert.equal(suggest(e, [sess(2, 'pushup', [{ w: 0, r: 10 }, { w: 0, r: 9 }, { w: 0, r: 9 }])], profile()).r, 10);
  const top = suggest(e, [sess(2, 'pushup', [{ w: 0, r: 15 }, { w: 0, r: 15 }, { w: 0, r: 16 }])], profile());
  assert.equal(top.w, 0); assert.match(top.note, /harder/);
  const low = suggest({ exId: 'pullup', sets: 3, lo: 8, hi: 15, rest: 90 }, [sess(2, 'pullup', [{ w: 0, r: 3 }, { w: 0, r: 2 }, { w: 0, r: 2 }])], profile());
  assert.equal(low.r, 3); // meets people where they are
});

t('deload lowers weight and sets, and ignores deload sessions as baseline', () => {
  const e = { exId: 'bb_bench', sets: 3, lo: 6, hi: 10, rest: 120 };
  const base = sess(10, 'bb_bench', [{ w: 60, r: 8 }, { w: 60, r: 8 }, { w: 60, r: 8 }]);
  const d = suggest(e, [base], profile(), { deload: true });
  assert.equal(d.w, 55); assert.equal(d.sets, 2);
  const light = sess(2, 'bb_bench', [{ w: 55, r: 8 }, { w: 55, r: 8 }], { deload: true });
  assert.equal(suggest(e, [base, light], profile()).w, 60);
});

t('PRs: needs a prior best; weight PR uses estimated 1RM', () => {
  const prior = [sess(7, 'bb_bench', [{ w: 60, r: 8 }])];
  assert.equal(findPRs([{ exId: 'bb_bench', sets: [{ w: 62.5, r: 8 }] }], prior)[0].kind, 'weight');
  assert.equal(findPRs([{ exId: 'bb_bench', sets: [{ w: 50, r: 8 }] }], prior).length, 0);
  assert.equal(findPRs([{ exId: 'db_row', sets: [{ w: 20, r: 8 }] }], prior).length, 0);
  assert.ok(Math.abs(e1rm(100, 5) - 116.67) < 0.01);
});

t('warm-ups ramp up and stay under the working weight', () => {
  const w = warmups('bb_bench', 100, 'kg');
  assert.deepEqual(w.map((s) => s.w), [50, 70, 85]);
  assert.deepEqual(warmups('bb_bench', 25, 'kg'), []);
  assert.deepEqual(warmups('bb_bench', 32.5, 'kg'), []);
  assert.deepEqual(warmups('lat_raise', 10, 'kg'), []);
});

t('buildWorkout + deload window', () => {
  const S = { profile: profile(), sessions: [], weights: [] }; S.plan = generatePlan(S.profile);
  const a = buildWorkout(S, 0);
  assert.equal(a.exercises.length, S.plan.templates[0].exercises.length);
  assert.ok(a.exercises.every((e) => e.sets.every((s) => s.r > 0 && !s.done)));
  S.plan.deload = { start: dayKey(new Date()), end: dayKey(addDays(new Date(), 6)) };
  assert.ok(isDeload(S.plan)); assert.match(buildWorkout(S, 0).name, /Deload/);
});

t('insights: weigh-in nudge, deload offer after 6 straight weeks, PR card', () => {
  const S = { profile: profile(), weights: [], sessions: [], active: null }; S.plan = generatePlan(S.profile);
  assert.ok(insights(S).some((i) => i.id === 'weigh'));
  S.sessions = Array.from({ length: 7 }, (_, i) => sess(i * 7, 'bb_bench', [{ w: 60 + i, r: 8 }])).reverse();
  assert.ok(insights(S).some((i) => i.id === 'deload-offer'));
  S.sessions.at(-1).prs = [{ exId: 'bb_bench', kind: 'weight', value: 90, prev: 85 }];
  assert.ok(insights(S).some((i) => i.id === 'pr'));
});

console.log(`\n${n} tests passed`);
