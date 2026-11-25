import type {
  RoutineCardioSegment,
  RoutineDay,
  RoutineDayKind,
  RoutineExercise,
  RoutineExerciseOption,
  RoutineLoadBasis,
  RoutineWeekday,
  WeeklyRoutine,
} from "./routine-plan";

export type RoutineValidationResult =
  | { ok: true; value: WeeklyRoutine }
  | { ok: false; error: string };

const LOAD_BASES = new Set<RoutineLoadBasis>([
  "baseline",
  "suggested-start",
  "progression-target",
  "choose-at-session",
]);
const DAY_KINDS = new Set<RoutineDayKind>([
  "lifting",
  "active-recovery",
  "rest",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isFiniteInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function isText(value: unknown, minLength: number, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minLength &&
    value.length <= maxLength
  );
}

function parseTime(value: unknown): number | null {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return null;
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function parseRange(
  value: unknown,
  minValue: number,
  maxValue: number,
): { min: number; max: number } | null {
  if (!isRecord(value)) {
    return null;
  }
  const min = value.min;
  const max = value.max;
  if (
    !isIntegerInRange(min, minValue, maxValue) ||
    !isIntegerInRange(max, minValue, maxValue) ||
    min > max
  ) {
    return null;
  }
  return { min, max };
}

function parseOption(value: unknown): RoutineExerciseOption | null {
  if (!isRecord(value)) {
    return null;
  }
  const minWeightKg = value.minWeightKg;
  const maxWeightKg = value.maxWeightKg;
  const noWeightRange = minWeightKg === null && maxWeightKg === null;
  const validWeightRange =
    isFiniteInRange(minWeightKg, 0, 1000) &&
    isFiniteInRange(maxWeightKg, 0, 1000) &&
    minWeightKg <= maxWeightKg;
  if (!noWeightRange && !validWeightRange) {
    return null;
  }
  if (
    !isText(value.name, 1, 80) ||
    !isText(value.equipment, 1, 60) ||
    !isText(value.weightLabel, 1, 50) ||
    typeof value.loadBasis !== "string" ||
    !LOAD_BASES.has(value.loadBasis as RoutineLoadBasis) ||
    typeof value.notes !== "string" ||
    value.notes.length > 500
  ) {
    return null;
  }
  return {
    name: value.name.trim(),
    equipment: value.equipment.trim(),
    minWeightKg: noWeightRange ? null : minWeightKg as number,
    maxWeightKg: noWeightRange ? null : maxWeightKg as number,
    weightLabel: value.weightLabel.trim(),
    loadBasis: value.loadBasis as RoutineLoadBasis,
    notes: value.notes.trim(),
  };
}

function parseExercise(value: unknown): RoutineExercise | null {
  if (!isRecord(value)) {
    return null;
  }
  const sets = parseRange(value.sets, 1, 20);
  const reps = parseRange(value.reps, 1, 100);
  const block = value.block;
  if (
    !isText(value.key, 1, 80) ||
    (block !== null && block !== "A" && block !== "B" && block !== "C") ||
    !isIntegerInRange(value.order, 1, 100) ||
    !sets ||
    !reps ||
    !Array.isArray(value.options) ||
    value.options.length === 0 ||
    value.options.length > 5
  ) {
    return null;
  }

  const restSeconds = value.restSeconds;
  const transitionSeconds = value.transitionSeconds;
  if (
    (restSeconds !== null && !isIntegerInRange(restSeconds, 0, 600)) ||
    (transitionSeconds !== null &&
      !isIntegerInRange(transitionSeconds, 0, 600)) ||
    (value.tempo !== null &&
      (typeof value.tempo !== "string" || value.tempo.length > 100)) ||
    typeof value.notes !== "string" ||
    value.notes.length > 500
  ) {
    return null;
  }

  const options = value.options.map(parseOption);
  if (options.some((option) => option === null)) {
    return null;
  }
  return {
    key: value.key.trim(),
    block,
    order: value.order,
    sets,
    reps,
    restSeconds: restSeconds as number | null,
    transitionSeconds: transitionSeconds as number | null,
    tempo: value.tempo === null ? null : (value.tempo as string).trim(),
    notes: value.notes.trim(),
    options: options as RoutineExerciseOption[],
  };
}

function parseCardioSegment(value: unknown): RoutineCardioSegment | null {
  if (!isRecord(value)) {
    return null;
  }
  const speedUnit = value.speedUnit;
  if (
    !isIntegerInRange(value.durationMinutes, 1, 180) ||
    !isFiniteInRange(value.speed, 0, 30) ||
    !isFiniteInRange(value.inclinePercent, 0, 50) ||
    (speedUnit !== null && !isText(speedUnit, 1, 16))
  ) {
    return null;
  }
  return {
    durationMinutes: value.durationMinutes,
    speed: value.speed,
    speedUnit: speedUnit === null ? null : speedUnit.trim(),
    inclinePercent: value.inclinePercent,
  };
}

function parseDay(value: unknown): RoutineDay | null {
  if (!isRecord(value)) {
    return null;
  }
  const weekday = value.weekday;
  const kind = value.kind;
  if (
    !isIntegerInRange(weekday, 1, 7) ||
    typeof kind !== "string" ||
    !DAY_KINDS.has(kind as RoutineDayKind) ||
    !isText(value.title, 1, 80) ||
    typeof value.notes !== "string" ||
    value.notes.length > 500 ||
    !Array.isArray(value.recoveryActivities) ||
    value.recoveryActivities.length > 8 ||
    !value.recoveryActivities.every((activity) => isText(activity, 1, 120)) ||
    !Array.isArray(value.exercises) ||
    value.exercises.length > 20 ||
    !Array.isArray(value.cardioFinisher) ||
    value.cardioFinisher.length > 4
  ) {
    return null;
  }

  const exercises = value.exercises.map(parseExercise);
  const cardioFinisher = value.cardioFinisher.map(parseCardioSegment);
  const exerciseKeys = exercises.map((exercise) => exercise?.key);
  if (
    exercises.some((exercise) => exercise === null) ||
    new Set(exerciseKeys).size !== exerciseKeys.length ||
    cardioFinisher.some((segment) => segment === null) ||
    (kind !== "lifting" &&
      (exercises.length > 0 || cardioFinisher.length > 0))
  ) {
    return null;
  }

  return {
    weekday: weekday as RoutineWeekday,
    title: value.title.trim(),
    kind: kind as RoutineDayKind,
    notes: value.notes.trim(),
    recoveryActivities: value.recoveryActivities.map((activity: string) =>
      activity.trim(),
    ),
    exercises: exercises as RoutineExercise[],
    cardioFinisher: cardioFinisher as RoutineCardioSegment[],
  };
}

export function parseWeeklyRoutine(value: unknown): RoutineValidationResult {
  if (!isRecord(value) || value.version !== 1) {
    return { ok: false, error: "This routine version is not supported." };
  }
  if (
    !isText(value.name, 1, 80) ||
    !isText(value.equipmentRule, 1, 300) ||
    !isText(value.progressionRule, 1, 500)
  ) {
    return { ok: false, error: "Routine details are missing or too long." };
  }

  if (!isRecord(value.trainingWindow)) {
    return { ok: false, error: "Choose a valid training window." };
  }
  const startMinutes = parseTime(value.trainingWindow.start);
  const endMinutes = parseTime(value.trainingWindow.end);
  if (
    startMinutes === null ||
    endMinutes === null ||
    startMinutes >= endMinutes
  ) {
    return { ok: false, error: "Training window must be a valid same-day time range." };
  }

  const proteinTarget = parseRange(value.proteinTargetGrams, 0, 300);
  if (!proteinTarget) {
    return { ok: false, error: "Enter a valid daily protein target range." };
  }

  if (!Array.isArray(value.days) || value.days.length !== 7) {
    return { ok: false, error: "A weekly routine must include all seven days." };
  }
  const days = value.days.map(parseDay);
  if (days.some((day) => day === null)) {
    return { ok: false, error: "One or more routine days are invalid." };
  }
  const dayNumbers = days.map((day) => day?.weekday);
  if (new Set(dayNumbers).size !== 7) {
    return { ok: false, error: "Each weekday must appear exactly once." };
  }
  const sortedDays = (days as RoutineDay[]).sort(
    (left, right) => left.weekday - right.weekday,
  );

  return {
    ok: true,
    value: {
      version: 1,
      name: value.name.trim(),
      equipmentRule: value.equipmentRule.trim(),
      trainingWindow: {
        start: value.trainingWindow.start as string,
        end: value.trainingWindow.end as string,
      },
      proteinTargetGrams: proteinTarget,
      progressionRule: value.progressionRule.trim(),
      days: sortedDays,
    },
  };
}
