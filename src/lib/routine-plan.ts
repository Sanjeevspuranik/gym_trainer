export type RoutineWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type RoutineDayKind = "lifting" | "active-recovery" | "rest";

export type RoutineLoadBasis =
  | "baseline"
  | "suggested-start"
  | "progression-target"
  | "choose-at-session";

export type RoutineExerciseOption = {
  name: string;
  equipment: string;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  weightLabel: string;
  loadBasis: RoutineLoadBasis;
  notes: string;
};

export type RoutineExercise = {
  key: string;
  block: "A" | "B" | "C" | null;
  order: number;
  sets: {
    min: number;
    max: number;
  };
  reps: {
    min: number;
    max: number;
  };
  restSeconds: number | null;
  transitionSeconds: number | null;
  tempo: string | null;
  notes: string;
  options: RoutineExerciseOption[];
};

export type RoutineCardioSegment = {
  durationMinutes: number;
  speed: number;
  speedUnit: string | null;
  inclinePercent: number;
};

export type RoutineDay = {
  weekday: RoutineWeekday;
  title: string;
  kind: RoutineDayKind;
  notes: string;
  recoveryActivities: string[];
  exercises: RoutineExercise[];
  cardioFinisher: RoutineCardioSegment[];
};

export type WeeklyRoutine = {
  version: 1;
  name: string;
  equipmentRule: string;
  trainingWindow: {
    start: string;
    end: string;
  };
  proteinTargetGrams: {
    min: number;
    max: number;
  };
  progressionRule: string;
  days: RoutineDay[];
};

function option(
  name: string,
  equipment: string,
  minWeightKg: number | null,
  maxWeightKg: number | null,
  weightLabel: string,
  loadBasis: RoutineLoadBasis,
  notes = "",
): RoutineExerciseOption {
  return {
    name,
    equipment,
    minWeightKg,
    maxWeightKg,
    weightLabel,
    loadBasis,
    notes,
  };
}

function exercise(
  key: string,
  block: RoutineExercise["block"],
  order: number,
  setCount: number | { min: number; max: number },
  repCount: number | { min: number; max: number },
  options: RoutineExerciseOption[],
  settings: Partial<
    Pick<
      RoutineExercise,
      "restSeconds" | "transitionSeconds" | "tempo" | "notes"
    >
  > = {},
): RoutineExercise {
  const sets =
    typeof setCount === "number"
      ? { min: setCount, max: setCount }
      : setCount;
  const reps =
    typeof repCount === "number"
      ? { min: repCount, max: repCount }
      : repCount;
  return {
    key,
    block,
    order,
    sets,
    reps,
    restSeconds: settings.restSeconds ?? null,
    transitionSeconds: settings.transitionSeconds ?? null,
    tempo: settings.tempo ?? null,
    notes: settings.notes ?? "",
    options,
  };
}

const cardioFinisher: RoutineCardioSegment[] = [
  {
    durationMinutes: 15,
    speed: 5,
    speedUnit: null,
    inclinePercent: 13,
  },
  {
    durationMinutes: 5,
    speed: 7.5,
    speedUnit: null,
    inclinePercent: 3,
  },
];

const dumbbell = "Dumbbell";
const dumbbells = "Dumbbells";
const barbell = "Barbell";

export const DEFAULT_WEEKLY_ROUTINE: WeeklyRoutine = {
  version: 1,
  name: "Weekly Strength & Recovery",
  equipmentRule:
    "Use dumbbells, barbells, pulley/plate-loaded/leverage machines. Exclude cable tower exercises.",
  trainingWindow: {
    start: "07:00",
    end: "08:30",
  },
  proteinTargetGrams: {
    min: 120,
    max: 150,
  },
  progressionRule:
    "When all sets reach the top of the rep range with clean form, add 2.5 kg to dumbbell presses, curls, or rows, or 2.5–5 kg to barbell or machine lifts.",
  days: [
    {
      weekday: 1,
      title: "Upper Body A",
      kind: "lifting",
      notes:
        "Antagonist superset routine. Keep transitions tight and take the listed rest between efforts.",
      recoveryActivities: [],
      exercises: [
        exercise(
          "monday-lat-pulldown",
          "A",
          1,
          3,
          12,
          [
            option(
              "Lat Pulldown",
              "Pulley machine",
              40,
              40,
              "kg",
              "baseline",
              "Full top stretch; drive elbows down.",
            ),
          ],
          { transitionSeconds: 15 },
        ),
        exercise(
          "monday-incline-db-press",
          "A",
          2,
          2,
          12,
          [
            option(
              "Incline Dumbbell Bench Press",
              dumbbells,
              12.5,
              12.5,
              "kg each",
              "baseline",
              "Set bench to 30–45°; tuck elbows about 45°.",
            ),
          ],
          { restSeconds: 90 },
        ),
        exercise(
          "monday-flat-db-press",
          "A",
          3,
          2,
          12,
          [
            option(
              "Flat Dumbbell Bench Press",
              dumbbells,
              12.5,
              12.5,
              "kg each",
              "baseline",
              "Lower with control to mid-chest.",
            ),
          ],
          { restSeconds: 90 },
        ),
        exercise(
          "monday-row",
          "B",
          1,
          3,
          15,
          [
            option(
              "Chest-Supported Machine Row",
              "Back machine",
              20,
              20,
              "kg starting load",
              "suggested-start",
              "Match the row load if already established.",
            ),
            option(
              "T-Bar Row",
              barbell,
              20,
              20,
              "kg starting load",
              "suggested-start",
              "Avoid torso swing; squeeze shoulder blades back.",
            ),
          ],
          { transitionSeconds: 15 },
        ),
        exercise(
          "monday-seated-db-shoulder-press",
          "B",
          2,
          3,
          12,
          [
            option(
              "Seated Dumbbell Shoulder Press",
              dumbbells,
              12.5,
              12.5,
              "kg each",
              "baseline",
              "Brace core and press strictly overhead.",
            ),
          ],
          { restSeconds: 90 },
        ),
        exercise(
          "monday-lateral-raise",
          "C",
          1,
          2,
          12,
          [
            option(
              "Dumbbell Lateral Raise",
              dumbbells,
              5,
              5,
              "kg each",
              "baseline",
              "Slight forward lean; stop at shoulder height.",
            ),
          ],
          { transitionSeconds: 10 },
        ),
        exercise(
          "monday-incline-curl",
          "C",
          2,
          3,
          12,
          [
            option(
              "Incline Dumbbell Bicep Curl",
              dumbbells,
              5,
              5,
              "kg each",
              "baseline",
              "Use a full bottom stretch.",
            ),
          ],
          { transitionSeconds: 10 },
        ),
        exercise(
          "monday-triceps-extension",
          "C",
          3,
          2,
          12,
          [
            option(
              "Lying Dumbbell Tricep Extension",
              dumbbells,
              12.5,
              15,
              "kg, single DB or pair",
              "baseline",
              "Keep elbows tucked and extend fully.",
            ),
            option(
              "Overhead Dumbbell Tricep Extension",
              dumbbell,
              12.5,
              15,
              "kg, single DB or pair",
              "baseline",
              "Keep elbows tucked and extend fully.",
            ),
          ],
          { restSeconds: 90, notes: "Rest after the round." },
        ),
      ],
      cardioFinisher,
    },
    {
      weekday: 2,
      title: "Push",
      kind: "lifting",
      notes: "Chest, shoulders, and triceps. Use a controlled 2–3 second lowering phase.",
      recoveryActivities: [],
      exercises: [
        exercise(
          "tuesday-bench-press",
          null,
          1,
          3,
          { min: 8, max: 10 },
          [
            option(
              "Barbell Bench Press",
              barbell,
              30,
              40,
              "kg starting load",
              "suggested-start",
              "Choose a load that allows controlled reps.",
            ),
            option(
              "Flat Dumbbell Press",
              dumbbells,
              12.5,
              12.5,
              "kg each",
              "baseline",
              "Choose a load that allows controlled reps.",
            ),
          ],
          { restSeconds: 90, tempo: "2–3 seconds lowering" },
        ),
        exercise(
          "tuesday-incline-press",
          null,
          2,
          3,
          { min: 10, max: 12 },
          [
            option(
              "Incline Dumbbell Bench Press",
              dumbbells,
              12.5,
              12.5,
              "kg each",
              "baseline",
              "Upper chest focus.",
            ),
          ],
          { restSeconds: 90, tempo: "2–3 seconds lowering" },
        ),
        exercise(
          "tuesday-shoulder-press",
          null,
          3,
          3,
          { min: 10, max: 12 },
          [
            option(
              "Seated Dumbbell Shoulder Press",
              dumbbells,
              12.5,
              12.5,
              "kg each",
              "baseline",
              "Strict vertical press.",
            ),
          ],
          { restSeconds: 90, tempo: "2–3 seconds lowering" },
        ),
        exercise(
          "tuesday-lateral-raise",
          null,
          4,
          3,
          { min: 12, max: 15 },
          [
            option(
              "Dumbbell Lateral Raise",
              dumbbells,
              5,
              5,
              "kg each",
              "baseline",
              "Maintain side-delt tension.",
            ),
          ],
          { restSeconds: 60 },
        ),
        exercise(
          "tuesday-triceps",
          null,
          5,
          3,
          { min: 10, max: 12 },
          [
            option(
              "Skull Crushers",
              "EZ-bar / barbell",
              20,
              25,
              "kg starting load",
              "suggested-start",
              "Keep elbows pinned.",
            ),
            option(
              "Overhead Dumbbell Tricep Extension",
              dumbbell,
              12.5,
              12.5,
              "kg",
              "baseline",
              "Keep elbows pinned.",
            ),
          ],
          { restSeconds: 75 },
        ),
      ],
      cardioFinisher,
    },
    {
      weekday: 3,
      title: "Active Recovery",
      kind: "active-recovery",
      notes:
        "Keep activity low-intensity and restorative. Avoid heavy loading and high-heart-rate strain.",
      recoveryActivities: [
        "Light walking",
        "Easy mobility work",
        "Gentle stretching",
      ],
      exercises: [],
      cardioFinisher: [],
    },
    {
      weekday: 4,
      title: "Pull",
      kind: "lifting",
      notes: "Back, rear delts, and biceps.",
      recoveryActivities: [],
      exercises: [
        exercise(
          "thursday-lat-pulldown",
          null,
          1,
          3,
          { min: 10, max: 12 },
          [
            option(
              "Lat Pulldown",
              "Pulley machine",
              40,
              40,
              "kg",
              "baseline",
              "Full lat stretch at the top; use a clean drive.",
            ),
          ],
          { restSeconds: 90 },
        ),
        exercise(
          "thursday-row",
          null,
          2,
          3,
          { min: 8, max: 12 },
          [
            option(
              "Barbell Bent-Over Row",
              barbell,
              20,
              30,
              "kg starting range",
              "suggested-start",
              "Neutral spine; pull toward lower ribs/hips.",
            ),
            option(
              "Chest-Supported Row Machine",
              "Back machine",
              20,
              30,
              "kg starting range",
              "suggested-start",
              "Neutral spine; pull toward lower ribs/hips.",
            ),
          ],
          { restSeconds: 90 },
        ),
        exercise(
          "thursday-single-arm-row",
          null,
          3,
          3,
          { min: 10, max: 12 },
          [
            option(
              "Single-Arm Dumbbell Row",
              dumbbell,
              12.5,
              15,
              "kg each side",
              "baseline",
              "Brace on bench; pull elbow toward hip.",
            ),
          ],
          { restSeconds: 75, notes: "Complete each side." },
        ),
        exercise(
          "thursday-rear-delt-fly",
          null,
          4,
          3,
          { min: 12, max: 15 },
          [
            option(
              "Chest-Supported Rear Delt Dumbbell Fly",
              dumbbells,
              5,
              5,
              "kg each",
              "baseline",
              "Sweep out to rear delts; avoid shrugging.",
            ),
          ],
          { restSeconds: 60 },
        ),
        exercise(
          "thursday-incline-curl",
          null,
          5,
          3,
          { min: 10, max: 12 },
          [
            option(
              "Incline Dumbbell Bicep Curl",
              dumbbells,
              5,
              5,
              "kg each",
              "baseline",
              "Use a deep stretch at the bottom.",
            ),
          ],
          { restSeconds: 60 },
        ),
        exercise(
          "thursday-hammer-curl",
          null,
          6,
          { min: 2, max: 3 },
          { min: 10, max: 12 },
          [
            option(
              "Dumbbell Hammer Curl",
              dumbbells,
              7.5,
              7.5,
              "kg each",
              "progression-target",
              "Progress toward 7.5 kg when 12 reps are clean.",
            ),
            option(
              "Barbell Hammer Curl",
              barbell,
              20,
              20,
              "kg starting load",
              "suggested-start",
              "Brachialis and forearm focus.",
            ),
          ],
          { restSeconds: 60 },
        ),
      ],
      cardioFinisher,
    },
    {
      weekday: 5,
      title: "Legs",
      kind: "lifting",
      notes: "Quads, hamstrings, glutes, and calves.",
      recoveryActivities: [],
      exercises: [
        exercise(
          "friday-squat",
          null,
          1,
          3,
          { min: 8, max: 10 },
          [
            option(
              "Barbell Back Squat",
              barbell,
              30,
              40,
              "kg starting range",
              "suggested-start",
              "Brace core and use controlled depth.",
            ),
            option(
              "Goblet / Dumbbell Squat",
              dumbbell,
              15,
              20,
              "kg starting range",
              "suggested-start",
              "Brace core and use controlled depth.",
            ),
          ],
          { restSeconds: 120 },
        ),
        exercise(
          "friday-leg-press",
          null,
          2,
          3,
          { min: 10, max: 12 },
          [
            option(
              "Leg Press Machine",
              "Leg machine",
              60,
              80,
              "kg starting range",
              "suggested-start",
              "Avoid hard knee lockout or lower-back tuck.",
            ),
          ],
          { restSeconds: 90 },
        ),
        exercise(
          "friday-rdl",
          null,
          3,
          3,
          { min: 10, max: 12 },
          [
            option(
              "Romanian Deadlift",
              barbell,
              30,
              40,
              "kg starting range",
              "suggested-start",
              "Push hips back to a comfortable hamstring stretch.",
            ),
            option(
              "Romanian Deadlift",
              dumbbells,
              12.5,
              15,
              "kg each",
              "suggested-start",
              "Push hips back to a comfortable hamstring stretch.",
            ),
          ],
          { restSeconds: 90 },
        ),
        exercise(
          "friday-leg-curl",
          null,
          4,
          3,
          { min: 12, max: 15 },
          [
            option(
              "Seated Leg Curl Machine",
              "Leg machine",
              20,
              30,
              "kg starting range",
              "suggested-start",
              "Return the weight smoothly.",
            ),
            option(
              "Lying Leg Curl Machine",
              "Leg machine",
              20,
              30,
              "kg starting range",
              "suggested-start",
              "Return the weight smoothly.",
            ),
          ],
          { restSeconds: 75 },
        ),
        exercise(
          "friday-leg-extension",
          null,
          5,
          { min: 2, max: 3 },
          { min: 12, max: 15 },
          [
            option(
              "Leg Extension Machine",
              "Leg machine",
              20,
              30,
              "kg starting range",
              "suggested-start",
              "Pause briefly at the quad squeeze.",
            ),
          ],
          { restSeconds: 75 },
        ),
        exercise(
          "friday-calf-raise",
          null,
          6,
          3,
          { min: 12, max: 15 },
          [
            option(
              "Standing Calf Raise Machine",
              "Leg machine",
              20,
              35,
              "kg starting range",
              "suggested-start",
              "Full stretch at the bottom; pause one second at the top.",
            ),
            option(
              "Seated Calf Raise Machine",
              "Leg machine",
              20,
              35,
              "kg starting range",
              "suggested-start",
              "Full stretch at the bottom; pause one second at the top.",
            ),
          ],
          { restSeconds: 60 },
        ),
      ],
      cardioFinisher,
    },
    {
      weekday: 6,
      title: "Upper Body B",
      kind: "lifting",
      notes:
        "High-density variation. Only use progression loads when form remains crisp.",
      recoveryActivities: [],
      exercises: [
        exercise(
          "saturday-lat-pulldown",
          "A",
          1,
          3,
          { min: 10, max: 12 },
          [
            option(
              "Lat Pulldown",
              "Pulley machine",
              40,
              42.5,
              "kg",
              "progression-target",
              "Test a small increase only if 12 reps were crisp.",
            ),
          ],
          { transitionSeconds: 15 },
        ),
        exercise(
          "saturday-incline-db-press",
          "A",
          2,
          2,
          { min: 10, max: 12 },
          [
            option(
              "Incline Dumbbell Bench Press",
              dumbbells,
              12.5,
              15,
              "kg each",
              "progression-target",
              "Use 15 kg when form stays locked in.",
            ),
          ],
          { restSeconds: 90 },
        ),
        exercise(
          "saturday-flat-bench",
          "A",
          3,
          2,
          { min: 10, max: 12 },
          [
            option(
              "Barbell Bench Press",
              barbell,
              null,
              null,
              "choose at session",
              "choose-at-session",
              "No barbell starting load supplied.",
            ),
            option(
              "Flat Dumbbell Bench Press",
              dumbbells,
              12.5,
              15,
              "kg each",
              "progression-target",
              "Use a controlled press.",
            ),
          ],
          { restSeconds: 90 },
        ),
        exercise(
          "saturday-machine-row",
          "B",
          1,
          3,
          { min: 12, max: 15 },
          [
            option(
              "Plate-Loaded Machine Row",
              "Back machine",
              20,
              25,
              "kg",
              "progression-target",
              "Use a crisp scapular squeeze.",
            ),
          ],
          { transitionSeconds: 15 },
        ),
        exercise(
          "saturday-shoulder-press",
          "B",
          2,
          3,
          { min: 10, max: 12 },
          [
            option(
              "Seated Dumbbell Shoulder Press",
              dumbbells,
              12.5,
              12.5,
              "kg each",
              "baseline",
              "Strict overhead lockout.",
            ),
          ],
          { restSeconds: 90 },
        ),
        exercise(
          "saturday-lateral-raise",
          "C",
          1,
          { min: 2, max: 3 },
          { min: 12, max: 15 },
          [
            option(
              "Dumbbell Lateral Raise",
              dumbbells,
              5,
              5,
              "kg each",
              "baseline",
              "Use a high-rep, controlled cadence.",
            ),
          ],
          { transitionSeconds: 10 },
        ),
        exercise(
          "saturday-bicep-curl",
          "C",
          2,
          3,
          { min: 10, max: 12 },
          [
            option(
              "Alternating Dumbbell Bicep Curl",
              dumbbells,
              5,
              7.5,
              "kg each",
              "progression-target",
              "Progress toward 7.5 kg when 12 reps are clean.",
            ),
            option(
              "Incline Dumbbell Bicep Curl",
              dumbbells,
              5,
              7.5,
              "kg each",
              "progression-target",
              "Progress toward 7.5 kg when 12 reps are clean.",
            ),
          ],
          { transitionSeconds: 10 },
        ),
        exercise(
          "saturday-triceps",
          "C",
          3,
          { min: 2, max: 3 },
          12,
          [
            option(
              "Overhead Dumbbell Tricep Extension",
              dumbbell,
              12.5,
              15,
              "kg",
              "progression-target",
              "Use a full stretch and clean lockout.",
            ),
            option(
              "Skull Crusher",
              "EZ-bar / barbell",
              null,
              null,
              "choose at session",
              "choose-at-session",
              "No barbell starting load supplied.",
            ),
          ],
          { restSeconds: 90 },
        ),
      ],
      cardioFinisher,
    },
    {
      weekday: 7,
      title: "Full Rest",
      kind: "rest",
      notes:
        "Complete rest from gym workouts and cardio before the next training week.",
      recoveryActivities: [],
      exercises: [],
      cardioFinisher: [],
    },
  ],
};
