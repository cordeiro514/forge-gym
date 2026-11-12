// Exercise library and the "slots" the plan generator fills.
// `factor` is a conservative starting load as a fraction of bodyweight (per hand for dumbbells);
// null marks a bodyweight movement.

export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'];

const x = (name, muscle, pattern, equip, kind, factor, lower = false) => ({ name, muscle, pattern, equip, kind, factor, lower });

export const EXERCISES = {
  // chest
  bb_bench: x('Barbell Bench Press', 'chest', 'hpush', 'barbell', 'compound', 0.5),
  db_bench: x('Dumbbell Bench Press', 'chest', 'hpush', 'dumbbell', 'compound', 0.2),
  db_incline: x('Incline Dumbbell Press', 'chest', 'hpush', 'dumbbell', 'compound', 0.17),
  machine_chest: x('Machine Chest Press', 'chest', 'hpush', 'machine', 'compound', 0.4),
  pushup: x('Push-Up', 'chest', 'hpush', 'bodyweight', 'compound', null),
  decline_pushup: x('Decline Push-Up', 'chest', 'hpush', 'bodyweight', 'compound', null),
  dips: x('Dips', 'chest', 'hpush', 'bodyweight', 'compound', null),
  cable_fly: x('Cable Fly', 'chest', 'chestiso', 'cable', 'isolation', 0.1),
  db_fly: x('Dumbbell Fly', 'chest', 'chestiso', 'dumbbell', 'isolation', 0.07),
  // back
  bb_row: x('Barbell Row', 'back', 'hpull', 'barbell', 'compound', 0.4),
  db_row: x('One-Arm Dumbbell Row', 'back', 'hpull', 'dumbbell', 'compound', 0.2),
  cable_row: x('Seated Cable Row', 'back', 'hpull', 'cable', 'compound', 0.4),
  inv_row: x('Inverted Row', 'back', 'hpull', 'bodyweight', 'compound', null),
  lat_pulldown: x('Lat Pulldown', 'back', 'vpull', 'cable', 'compound', 0.5),
  pullup: x('Pull-Up', 'back', 'vpull', 'bodyweight', 'compound', null),
  chinup: x('Chin-Up', 'back', 'vpull', 'bodyweight', 'compound', null),
  db_pullover: x('Dumbbell Pullover', 'back', 'vpull', 'dumbbell', 'compound', 0.2),
  // shoulders
  ohp: x('Overhead Press', 'shoulders', 'vpush', 'barbell', 'compound', 0.3),
  db_press: x('Dumbbell Shoulder Press', 'shoulders', 'vpush', 'dumbbell', 'compound', 0.14),
  machine_shoulder: x('Machine Shoulder Press', 'shoulders', 'vpush', 'machine', 'compound', 0.3),
  pike_pushup: x('Pike Push-Up', 'shoulders', 'vpush', 'bodyweight', 'compound', null),
  lat_raise: x('Lateral Raise', 'shoulders', 'sidedelt', 'dumbbell', 'isolation', 0.05),
  cable_lat_raise: x('Cable Lateral Raise', 'shoulders', 'sidedelt', 'cable', 'isolation', 0.04),
  face_pull: x('Face Pull', 'shoulders', 'reardelt', 'cable', 'isolation', 0.12),
  rear_fly: x('Rear Delt Fly', 'shoulders', 'reardelt', 'dumbbell', 'isolation', 0.05),
  // arms
  bb_curl: x('Barbell Curl', 'biceps', 'curl', 'barbell', 'isolation', 0.2),
  db_curl: x('Dumbbell Curl', 'biceps', 'curl', 'dumbbell', 'isolation', 0.09),
  hammer: x('Hammer Curl', 'biceps', 'curl', 'dumbbell', 'isolation', 0.1),
  cable_curl: x('Cable Curl', 'biceps', 'curl', 'cable', 'isolation', 0.15),
  pushdown: x('Triceps Pushdown', 'triceps', 'triext', 'cable', 'isolation', 0.25),
  skull: x('Skull Crushers', 'triceps', 'triext', 'barbell', 'isolation', 0.15),
  db_ext: x('Overhead Dumbbell Extension', 'triceps', 'triext', 'dumbbell', 'isolation', 0.12),
  bench_dip: x('Bench Dip', 'triceps', 'triext', 'bodyweight', 'isolation', null),
  close_pushup: x('Close-Grip Push-Up', 'triceps', 'triext', 'bodyweight', 'isolation', null),
  // legs
  bb_squat: x('Barbell Back Squat', 'quads', 'squat', 'barbell', 'compound', 0.6, true),
  goblet: x('Goblet Squat', 'quads', 'squat', 'dumbbell', 'compound', 0.25, true),
  bw_squat: x('Bodyweight Squat', 'quads', 'squat', 'bodyweight', 'compound', null, true),
  leg_press: x('Leg Press', 'quads', 'legpress', 'machine', 'compound', 1.0, true),
  bulgarian: x('Bulgarian Split Squat', 'quads', 'lunge', 'dumbbell', 'compound', 0.1, true),
  lunge: x('Dumbbell Lunge', 'quads', 'lunge', 'dumbbell', 'compound', 0.1, true),
  bw_lunge: x('Bodyweight Lunge', 'quads', 'lunge', 'bodyweight', 'compound', null, true),
  leg_ext: x('Leg Extension', 'quads', 'quadiso', 'machine', 'isolation', 0.3, true),
  rdl: x('Romanian Deadlift', 'hamstrings', 'hinge', 'barbell', 'compound', 0.6, true),
  deadlift: x('Deadlift', 'hamstrings', 'hinge', 'barbell', 'compound', 0.8, true),
  db_rdl: x('Dumbbell Romanian Deadlift', 'hamstrings', 'hinge', 'dumbbell', 'compound', 0.2, true),
  leg_curl: x('Lying Leg Curl', 'hamstrings', 'hamiso', 'machine', 'isolation', 0.25, true),
  hip_thrust: x('Hip Thrust', 'glutes', 'bridge', 'barbell', 'compound', 0.7, true),
  glute_bridge: x('Glute Bridge', 'glutes', 'bridge', 'bodyweight', 'compound', null, true),
  calf_raise: x('Standing Calf Raise', 'calves', 'calves', 'machine', 'isolation', 0.5, true),
  db_calf: x('Dumbbell Calf Raise', 'calves', 'calves', 'dumbbell', 'isolation', 0.15, true),
  bw_calf: x('Bodyweight Calf Raise', 'calves', 'calves', 'bodyweight', 'isolation', null, true),
  // core
  cable_crunch: x('Cable Crunch', 'core', 'core', 'cable', 'isolation', 0.3),
  hanging_knee: x('Hanging Knee Raise', 'core', 'core', 'bodyweight', 'isolation', null),
  crunch: x('Crunch', 'core', 'core', 'bodyweight', 'isolation', null),
  dead_bug: x('Dead Bug', 'core', 'core', 'bodyweight', 'isolation', null),
};

const EQUIPMENT = { gym: null, dumbbells: ['dumbbell', 'bodyweight'], bodyweight: ['bodyweight'] };

export const allowed = (id, equipment) => {
  const ok = EQUIPMENT[equipment];
  return !ok || ok.includes(EXERCISES[id].equip);
};

// Same muscle and kind, ordered with the same movement pattern first.
export function alternatives(id, equipment) {
  const cur = EXERCISES[id];
  return Object.keys(EXERCISES)
    .filter((k) => k !== id && allowed(k, equipment) && EXERCISES[k].muscle === cur.muscle && EXERCISES[k].kind === cur.kind)
    .sort((a, b) => (EXERCISES[b].pattern === cur.pattern) - (EXERCISES[a].pattern === cur.pattern));
}

// Preference lists: the generator takes the first exercise the user's equipment allows
// and that isn't already in the same workout.
export const SLOTS = {
  chestPress: ['bb_bench', 'db_bench', 'machine_chest', 'pushup'],
  inclinePress: ['db_incline', 'machine_chest', 'decline_pushup', 'pushup'],
  chestIso: ['cable_fly', 'db_fly'],
  hRow: ['bb_row', 'cable_row', 'db_row', 'inv_row'],
  hRowB: ['db_row', 'cable_row', 'inv_row', 'bb_row'],
  vPull: ['lat_pulldown', 'pullup', 'chinup', 'db_pullover'],
  shoulderPress: ['ohp', 'db_press', 'machine_shoulder', 'pike_pushup'],
  sideDelt: ['lat_raise', 'cable_lat_raise'],
  rearDelt: ['face_pull', 'rear_fly'],
  bicepsA: ['bb_curl', 'db_curl', 'cable_curl', 'chinup'],
  bicepsB: ['hammer', 'db_curl', 'cable_curl'],
  tricepsA: ['pushdown', 'skull', 'db_ext', 'close_pushup'],
  tricepsB: ['db_ext', 'bench_dip', 'pushdown', 'close_pushup'],
  squat: ['bb_squat', 'goblet', 'bw_squat'],
  legPress: ['leg_press', 'bulgarian', 'lunge', 'bw_lunge'],
  lunge: ['bulgarian', 'lunge', 'bw_lunge'],
  hinge: ['rdl', 'db_rdl', 'glute_bridge'],
  hingeB: ['deadlift', 'db_rdl', 'glute_bridge'],
  quadIso: ['leg_ext', 'lunge', 'bw_lunge'],
  hamIso: ['leg_curl', 'glute_bridge', 'db_rdl'],
  glute: ['hip_thrust', 'glute_bridge'],
  calves: ['calf_raise', 'db_calf', 'bw_calf'],
  core: ['cable_crunch', 'hanging_knee', 'crunch', 'dead_bug'],
  coreB: ['hanging_knee', 'crunch', 'dead_bug'],
};

export function pick(slot, equipment, used) {
  return SLOTS[slot].find((id) => allowed(id, equipment) && !used.has(id)) || null;
}
