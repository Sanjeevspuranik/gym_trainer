import type { PgQueryable } from "./database";
import { DEFAULT_WEEKLY_ROUTINE } from "./routine-plan";
import type { WeeklyRoutine } from "./routine-plan";

type SeededRoutineRow = {
  user_id: number;
};

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

export type UserRoutineForWeek = {
  routine_json: WeeklyRoutine;
  is_override: boolean;
};

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
