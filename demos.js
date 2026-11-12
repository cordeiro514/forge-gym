// Two-photo motion demos (start and end position) from free-exercise-db, public domain (Unlicense):
// https://github.com/yuhonas/free-exercise-db. Files live in demos/<exercise id>-0.jpg and -1.jpg.
// Value: the dataset's exercise id; null when it has no good match.
export const DEMO_SOURCE = {
  bb_bench: 'Barbell_Bench_Press_-_Medium_Grip', db_bench: 'Dumbbell_Bench_Press', db_incline: 'Incline_Dumbbell_Press',
  machine_chest: 'Leverage_Chest_Press', pushup: 'Pushups', decline_pushup: 'Decline_Push-Up', dips: 'Dips_-_Chest_Version',
  cable_fly: 'Cable_Crossover', db_fly: 'Dumbbell_Flyes',
  bb_row: 'Bent_Over_Barbell_Row', db_row: 'One-Arm_Dumbbell_Row', cable_row: 'Seated_Cable_Rows', inv_row: 'Inverted_Row',
  lat_pulldown: 'Wide-Grip_Lat_Pulldown', pullup: 'Pullups', chinup: 'Chin-Up', db_pullover: 'Bent-Arm_Dumbbell_Pullover',
  ohp: 'Standing_Military_Press', db_press: 'Dumbbell_Shoulder_Press', machine_shoulder: 'Leverage_Shoulder_Press', pike_pushup: null,
  lat_raise: 'Side_Lateral_Raise', cable_lat_raise: 'Cable_Seated_Lateral_Raise', face_pull: 'Face_Pull', rear_fly: 'Seated_Bent-Over_Rear_Delt_Raise',
  bb_curl: 'Barbell_Curl', db_curl: 'Dumbbell_Bicep_Curl', hammer: 'Hammer_Curls', cable_curl: 'Standing_Biceps_Cable_Curl',
  pushdown: 'Triceps_Pushdown', skull: 'EZ-Bar_Skullcrusher', db_ext: 'Standing_Dumbbell_Triceps_Extension', bench_dip: 'Bench_Dips',
  close_pushup: 'Push-Ups_-_Close_Triceps_Position',
  bb_squat: 'Barbell_Squat', goblet: 'Goblet_Squat', bw_squat: 'Bodyweight_Squat', leg_press: 'Leg_Press', bulgarian: 'Split_Squat_with_Dumbbells',
  lunge: 'Dumbbell_Lunges', bw_lunge: 'Bodyweight_Walking_Lunge', leg_ext: 'Leg_Extensions',
  rdl: 'Romanian_Deadlift', deadlift: 'Barbell_Deadlift', db_rdl: 'Stiff-Legged_Dumbbell_Deadlift', leg_curl: 'Lying_Leg_Curls',
  hip_thrust: 'Barbell_Hip_Thrust', glute_bridge: 'Butt_Lift_Bridge',
  calf_raise: 'Standing_Calf_Raises', db_calf: 'Standing_Dumbbell_Calf_Raise', bw_calf: 'Standing_Dumbbell_Calf_Raise',
  cable_crunch: 'Cable_Crunch', hanging_knee: 'Hanging_Leg_Raise', crunch: 'Crunches', dead_bug: 'Dead_Bug',
};

export const demoFrames = (exId) => (DEMO_SOURCE[exId] ? [`demos/${exId}-0.jpg`, `demos/${exId}-1.jpg`] : null);
