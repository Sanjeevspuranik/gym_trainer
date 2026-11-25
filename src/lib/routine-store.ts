import type { PgQueryable } from "./database";
import { DEFAULT_WEEKLY_ROUTINE } from "./routine-plan";
import type { WeeklyRoutine } from "./routine-plan";

type SeededRoutineRow = {
  user_id: number;
};

type StoredRoutineRow = SeededRoutineRow & {
  routine_json: WeeklyRoutine;
};

type StoredRoutineOverrideRow = StoredRoutineRow & {
  week_start: string;
};

export type UserRoutineForWeek = {
  routine_json: WeeklyRoutine;
  is_override: boolean;
};

const LEGACY_TUESDAY_CHEST_KEYS = new Set([
  "tuesday-bench-press",
  "tuesday-incline-press",
]);

const UPDATED_TUESDAY_CHEST_KEYS = new Set([
  "tuesday-incline-db-press",
  "tuesday-flat-db-press",
  "tuesday-db-flyes",
  "tuesday-db-pullover-finisher",
]);

function upgradeLegacyRoutine(routine: WeeklyRoutine): WeeklyRoutine {
  if (routine.version !== 1) {
    return routine;
  }

  const updatedDays = routine.days.map((day) => {
    if (day.weekday === 2) {
      const oldPositions = day.exercises
        .map((exercise, index) =>
          LEGACY_TUESDAY_CHEST_KEYS.has(exercise.key) ? index : -1,
        )
        .filter((index) => index >= 0);
      if (oldPositions.length === 0) {
        return day;
      }

      const insertAt = Math.min(...oldPositions);
      const retainedExercises = day.exercises.filter(
        (exercise) => !LEGACY_TUESDAY_CHEST_KEYS.has(exercise.key),
      );
      const newChestExercises = DEFAULT_WEEKLY_ROUTINE.days
        .find((defaultDay) => defaultDay.weekday === 2)!
        .exercises.filter((exercise) =>
          UPDATED_TUESDAY_CHEST_KEYS.has(exercise.key),
        );
      retainedExercises.splice(insertAt, 0, ...newChestExercises);
      return {
        ...day,
        exercises: retainedExercises.map((exercise, index) => ({
          ...exercise,
          order: index + 1,
        })),
      };
    }

    if (day.weekday === 6) {
      const updatedSaturdayExercises = DEFAULT_WEEKLY_ROUTINE.days.find(
        (defaultDay) => defaultDay.weekday === 6,
      )!.exercises;
      const updatedByKey = new Map(
        updatedSaturdayExercises.map((exercise) => [exercise.key, exercise]),
      );
      return {
        ...day,
        exercises: day.exercises.map((exercise) => {
          if (exercise.key === "saturday-incline-db-press") {
            return updatedByKey.get(exercise.key) ?? exercise;
          }
          if (exercise.key === "saturday-flat-bench") {
            const updated = updatedByKey.get(
              "saturday-neutral-grip-flat-db-press",
            );
            return updated
              ? { ...updated, order: exercise.order, block: exercise.block }
              : exercise;
          }
          return exercise;
        }),
      };
    }
    return day;
  });

  return {
    ...routine,
    version: DEFAULT_WEEKLY_ROUTINE.version,
    days: updatedDays,
  };
}

export async function seedDefaultRoutinesForExistingUsers(
  database: PgQueryable,
): Promise<number> {
  const result = await database.query<SeededRoutineRow>(
    `INSERT INTO user_routine_plans (user_id, routine_json)
     SELECT users.id, $1::jsonb
     FROM users
     ON CONFLICT (user_id) DO NOTHING
     RETURNING user_id`,
    [JSON.stringify(DEFAULT_WEEKLY_ROUTINE)],
  );
  return result.rows.length;
}

export async function upgradeLegacyChestRoutines(
  database: PgQueryable,
): Promise<number> {
  const [legacyRoutines, legacyOverrides] = await Promise.all([
    database.query<StoredRoutineRow>(
      `SELECT user_id, routine_json
       FROM user_routine_plans
       WHERE routine_json->>'version' = '1'`,
    ),
    database.query<StoredRoutineOverrideRow>(
      `SELECT user_id, week_start::text AS week_start, routine_json
       FROM routine_week_overrides
       WHERE routine_json->>'version' = '1'`,
    ),
  ]);
  let upgradedCount = 0;
  for (const row of legacyRoutines.rows) {
    const updatedRoutine = upgradeLegacyRoutine(row.routine_json);
    await database.query(
      `UPDATE user_routine_plans
       SET routine_json = $2::jsonb, updated_at = NOW()
       WHERE user_id = $1 AND routine_json->>'version' = '1'`,
      [row.user_id, JSON.stringify(updatedRoutine)],
    );
    upgradedCount += 1;
  }
  for (const row of legacyOverrides.rows) {
    const updatedRoutine = upgradeLegacyRoutine(row.routine_json);
    await database.query(
      `UPDATE routine_week_overrides
       SET routine_json = $3::jsonb, updated_at = NOW()
       WHERE user_id = $1
         AND week_start = $2::date
         AND routine_json->>'version' = '1'`,
      [row.user_id, row.week_start, JSON.stringify(updatedRoutine)],
    );
    upgradedCount += 1;
  }
  return upgradedCount;
}

export async function getUserRoutineForWeek(
  database: PgQueryable,
  userId: number,
  weekStart: string,
): Promise<UserRoutineForWeek | null> {
  const result = await database.query<UserRoutineForWeek>(
    `SELECT COALESCE(week_override.routine_json, routine.routine_json)
         AS routine_json,
            week_override.user_id IS NOT NULL AS is_override
     FROM user_routine_plans AS routine
     LEFT JOIN routine_week_overrides AS week_override
       ON week_override.user_id = routine.user_id
      AND week_override.week_start = $2::date
     WHERE routine.user_id = $1`,
    [userId, weekStart],
  );
  return result.rows[0] ?? null;
}

export async function saveUserRoutineWeekOverride(
  database: PgQueryable,
  userId: number,
  weekStart: string,
  routine: WeeklyRoutine,
): Promise<WeeklyRoutine> {
  const result = await database.query<{ routine_json: WeeklyRoutine }>(
    `INSERT INTO routine_week_overrides
       (user_id, week_start, routine_json, created_at, updated_at)
     VALUES ($1, $2::date, $3::jsonb, NOW(), NOW())
     ON CONFLICT (user_id, week_start)
     DO UPDATE SET routine_json = EXCLUDED.routine_json,
                   updated_at = NOW()
     RETURNING routine_json`,
    [userId, weekStart, JSON.stringify(routine)],
  );
  const saved = result.rows[0];
  if (!saved) {
    throw new Error("The weekly routine could not be saved.");
  }
  return saved.routine_json;
}

export async function deleteUserRoutineWeekOverride(
  database: PgQueryable,
  userId: number,
  weekStart: string,
): Promise<boolean> {
  const result = await database.query<{ user_id: number }>(
    `DELETE FROM routine_week_overrides
     WHERE user_id = $1 AND week_start = $2::date
     RETURNING user_id`,
    [userId, weekStart],
  );
  return result.rows.length > 0;
}
