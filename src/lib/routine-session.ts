import { isRoutineWeekStart, routineWeekStart, routineWeekday } from "./routine-dates";
import type {
  RoutineDay,
  RoutineExercise,
  RoutineExerciseOption,
  WeeklyRoutine,
} from "./routine-plan";

export type RoutineExerciseChoice = {
  exerciseKey: string;
  optionIndex: number;
  weightKg: number;
};

export type RoutineWorkoutStartInput = {
  weekStart: string;
  sessionDate: string;
  weekday: number;
  day: RoutineDay;
  exercises: Array<{
    routineExercise: RoutineExercise;
    option: RoutineExerciseOption;
    weightKg: number;
  }>;
};

export type RoutineStartValidationResult =
  | { ok: true; value: RoutineWorkoutStartInput }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.toISOString().slice(0, 10) === value;
}

export function parseRoutineWorkoutStart(
  value: unknown,
  weekStart: string,
  routine: WeeklyRoutine,
): RoutineStartValidationResult {
  if (!isRecord(value)) {
    return { ok: false, error: "Workout details must be an object." };
  }
  if (!isRoutineWeekStart(weekStart)) {
    return { ok: false, error: "Choose a valid Monday week start." };
  }

  const sessionDate = value.date;
  if (
    typeof sessionDate !== "string" ||
    !isValidDate(sessionDate) ||
    routineWeekStart(sessionDate) !== weekStart
  ) {
    return {
      ok: false,
      error: "Workout date must be in the selected routine week.",
    };
  }
  const weekday = routineWeekday(sessionDate);
  if (weekday === null) {
    return { ok: false, error: "Choose a valid workout date." };
  }

  const day = routine.days.find((routineDay) => routineDay.weekday === weekday);
  if (!day || day.kind !== "lifting" || day.exercises.length === 0) {
    return {
      ok: false,
      error: "There is no lifting workout planned for this day.",
    };
  }

  const rawChoices = value.exerciseChoices;
  if (!Array.isArray(rawChoices) || rawChoices.length !== day.exercises.length) {
    return {
      ok: false,
      error: "Select one option for every planned exercise.",
    };
  }

  const choices = new Map<string, RoutineExerciseChoice>();
  for (const rawChoice of rawChoices) {
    if (
      !isRecord(rawChoice) ||
      typeof rawChoice.exerciseKey !== "string" ||
      !Number.isInteger(rawChoice.optionIndex) ||
      typeof rawChoice.weightKg !== "number" ||
      !Number.isFinite(rawChoice.weightKg) ||
      rawChoice.weightKg < 0 ||
      rawChoice.weightKg > 1000 ||
      choices.has(rawChoice.exerciseKey)
    ) {
      return { ok: false, error: "One or more exercise selections are invalid." };
    }
    choices.set(rawChoice.exerciseKey, {
      exerciseKey: rawChoice.exerciseKey,
      optionIndex: rawChoice.optionIndex as number,
      weightKg: rawChoice.weightKg,
    });
  }

  const exercises: RoutineWorkoutStartInput["exercises"] = [];
  for (const routineExercise of day.exercises) {
    const choice = choices.get(routineExercise.key);
    if (!choice) {
      return {
        ok: false,
        error: "Select one option for every planned exercise.",
      };
    }
    const option = routineExercise.options[choice.optionIndex];
    if (!option) {
      return { ok: false, error: "One or more exercise options are invalid." };
    }
    if (
      option.minWeightKg !== null &&
      choice.weightKg < option.minWeightKg
    ) {
      return {
        ok: false,
        error: `Load for ${option.name} is below its planned range.`,
      };
    }
    if (
      option.maxWeightKg !== null &&
      choice.weightKg > option.maxWeightKg
    ) {
      return {
        ok: false,
        error: `Load for ${option.name} is above its planned range.`,
      };
    }
    if (
      option.loadBasis === "choose-at-session" &&
      option.minWeightKg === null &&
      choice.weightKg <= 0
    ) {
      return {
        ok: false,
        error: `Enter a starting load for ${option.name}.`,
      };
    }
    exercises.push({ routineExercise, option, weightKg: choice.weightKg });
  }

  return {
    ok: true,
    value: { weekStart, sessionDate, weekday, day, exercises },
  };
}
