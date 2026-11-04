import type { WorkoutExercise } from "./types";

export type WorkoutSessionInput = {
  title: string;
  date: string;
  notes: string;
  exercises: WorkoutExercise[];
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const USERNAME_HTML_PATTERN = "(?:[A-Za-z0-9_]|-){3,32}";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const username = value.trim();
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
    return null;
  }
  return username.toLowerCase();
}

export function isValidRegistrationPassword(
  value: unknown,
): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.toISOString().slice(0, 10) === value;
}

export function parseWorkoutSession(
  value: unknown,
): ValidationResult<WorkoutSessionInput> {
  if (!isRecord(value)) {
    return { ok: false, error: "The workout must be an object." };
  }

  const rawTitle = value.title;
  if (
    typeof rawTitle !== "string" ||
    rawTitle.trim().length === 0 ||
    rawTitle.trim().length > 80
  ) {
    return {
      ok: false,
      error: "Session name must be between 1 and 80 characters.",
    };
  }

  const rawDate = value.date;
  const sessionDate =
    rawDate === undefined || rawDate === ""
      ? new Date().toISOString().slice(0, 10)
      : rawDate;
  if (typeof sessionDate !== "string" || !isValidDate(sessionDate)) {
    return { ok: false, error: "Choose a valid session date." };
  }

  const rawNotes = value.notes ?? "";
  if (typeof rawNotes !== "string" || rawNotes.length > 500) {
    return { ok: false, error: "Notes must be 500 characters or fewer." };
  }

  const rawExercises = value.exercises ?? [];
  if (!Array.isArray(rawExercises)) {
    return { ok: false, error: "Exercises must be a list." };
  }
  if (rawExercises.length > 12) {
    return { ok: false, error: "A session can include at most 12 exercises." };
  }

  const exercises: WorkoutExercise[] = [];
  for (const rawExercise of rawExercises) {
    if (!isRecord(rawExercise)) {
      return { ok: false, error: "Each exercise must be an object." };
    }

    const rawName = rawExercise.name;
    if (
      typeof rawName !== "string" ||
      rawName.trim().length === 0 ||
      rawName.trim().length > 60
    ) {
      return {
        ok: false,
        error: "Exercise names must be between 1 and 60 characters.",
      };
    }

    const sets = rawExercise.sets;
    const reps = rawExercise.reps;
    if (typeof sets !== "number" || !Number.isInteger(sets) || sets < 1 || sets > 20) {
      return { ok: false, error: "Sets must be a whole number from 1 to 20." };
    }
    if (typeof reps !== "number" || !Number.isInteger(reps) || reps < 1 || reps > 100) {
      return { ok: false, error: "Reps must be a whole number from 1 to 100." };
    }

    const weightKg = rawExercise.weightKg;
    if (
      typeof weightKg !== "number" ||
      !Number.isFinite(weightKg) ||
      weightKg < 0 ||
      weightKg > 1000
    ) {
      return { ok: false, error: "Weight must be between 0 and 1,000 kg." };
    }

    exercises.push({
      name: rawName.trim(),
      sets,
      reps,
      weightKg: Math.round(weightKg * 100) / 100,
    });
  }

  return {
    ok: true,
    value: {
      title: rawTitle.trim(),
      date: sessionDate,
      notes: rawNotes.trim(),
      exercises,
    },
  };
}
