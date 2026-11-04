import type { PgQueryable } from "./database";
import type { WorkoutSession } from "./types";
import type { WorkoutSessionInput } from "./validation";

type SessionRow = {
  id: number;
  title: string;
  session_date: string | Date;
  notes: string;
  completed_at: string | Date | null;
  created_at: string | Date;
};

type ExerciseRow = {
  session_id: number;
  name: string;
  sets: number;
  reps: number;
  weight_kg: string | number;
  sort_order: number;
};

type CreatedSessionRow = SessionRow & {
  exercise_name: string | null;
  exercise_sets: number | null;
  exercise_reps: number | null;
  exercise_weight_kg: string | number | null;
  exercise_sort_order: number | null;
};

function toIsoString(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeSession(
  session: SessionRow,
  exercises: ExerciseRow[],
): WorkoutSession {
  return {
    id: session.id,
    title: session.title,
    date:
      session.session_date instanceof Date
        ? session.session_date.toISOString().slice(0, 10)
        : session.session_date.slice(0, 10),
    notes: session.notes,
    completed: session.completed_at !== null,
    completedAt: toIsoString(session.completed_at),
    createdAt: toIsoString(session.created_at) ?? "",
    exercises: exercises.map((exercise) => ({
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      weightKg: Number(exercise.weight_kg),
    })),
  };
}

async function getUserSession(
  database: PgQueryable,
  userId: number,
  sessionId: number,
): Promise<WorkoutSession | null> {
  const sessionResult = await database.query<SessionRow>(
    `SELECT id, title, session_date, notes, completed_at, created_at
     FROM workout_sessions
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  );
  const session = sessionResult.rows[0];
  if (!session) {
    return null;
  }

  const exerciseResult = await database.query<ExerciseRow>(
    `SELECT session_id, name, sets, reps, weight_kg, sort_order
     FROM session_exercises
     WHERE session_id = $1
     ORDER BY sort_order, id`,
    [sessionId],
  );
  return serializeSession(session, exerciseResult.rows);
}

export async function listUserSessions(
  database: PgQueryable,
  userId: number,
): Promise<WorkoutSession[]> {
  const sessionsResult = await database.query<SessionRow>(
    `SELECT id, title, session_date, notes, completed_at, created_at
     FROM workout_sessions
     WHERE user_id = $1
     ORDER BY session_date DESC, id DESC`,
    [userId],
  );
  if (sessionsResult.rows.length === 0) {
    return [];
  }

  const exercisesResult = await database.query<ExerciseRow>(
    `SELECT session_exercises.session_id, session_exercises.name,
            session_exercises.sets, session_exercises.reps,
            session_exercises.weight_kg, session_exercises.sort_order
     FROM session_exercises
     JOIN workout_sessions
       ON workout_sessions.id = session_exercises.session_id
     WHERE workout_sessions.user_id = $1
     ORDER BY session_exercises.session_id,
              session_exercises.sort_order, session_exercises.id`,
    [userId],
  );

  const exercisesBySession = new Map<number, ExerciseRow[]>();
  for (const exercise of exercisesResult.rows) {
    const list = exercisesBySession.get(exercise.session_id) ?? [];
    list.push(exercise);
    exercisesBySession.set(exercise.session_id, list);
  }

  return sessionsResult.rows.map((session) =>
    serializeSession(session, exercisesBySession.get(session.id) ?? []),
  );
}

export async function createUserSession(
  database: PgQueryable,
  userId: number,
  input: WorkoutSessionInput,
): Promise<WorkoutSession> {
  const result = await database.query<CreatedSessionRow>(
    `WITH new_session AS (
       INSERT INTO workout_sessions
         (user_id, title, session_date, notes, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, session_date, notes, completed_at, created_at
     ),
     new_exercises AS (
       INSERT INTO session_exercises
         (session_id, name, sets, reps, weight_kg, sort_order)
       SELECT new_session.id, exercise.name, exercise.sets, exercise.reps,
              exercise.weight_kg, exercise.sort_order
       FROM new_session
       CROSS JOIN jsonb_to_recordset($6::jsonb) AS exercise(
         name TEXT,
         sets INTEGER,
         reps INTEGER,
         weight_kg NUMERIC,
         sort_order INTEGER
       )
       RETURNING session_id, name, sets, reps, weight_kg, sort_order
     )
     SELECT new_session.id, new_session.title, new_session.session_date,
            new_session.notes, new_session.completed_at, new_session.created_at,
            new_exercises.name AS exercise_name,
            new_exercises.sets AS exercise_sets,
            new_exercises.reps AS exercise_reps,
            new_exercises.weight_kg AS exercise_weight_kg,
            new_exercises.sort_order AS exercise_sort_order
     FROM new_session
     LEFT JOIN new_exercises ON new_exercises.session_id = new_session.id
     ORDER BY new_exercises.sort_order`,
    [
      userId,
      input.title,
      input.date,
      input.notes,
      new Date().toISOString(),
      JSON.stringify(
        input.exercises.map((exercise, index) => ({
          name: exercise.name,
          sets: exercise.sets,
          reps: exercise.reps,
          weight_kg: exercise.weightKg,
          sort_order: index,
        })),
      ),
    ],
  );
  const session = result.rows[0];
  if (!session) {
    throw new Error("The new workout session could not be created.");
  }

  const exercises: ExerciseRow[] = [];
  for (const row of result.rows) {
    if (row.exercise_name === null) {
      continue;
    }
    if (
      row.exercise_sets === null ||
      row.exercise_reps === null ||
      row.exercise_weight_kg === null ||
      row.exercise_sort_order === null
    ) {
      throw new Error("The new workout exercise could not be loaded.");
    }
    exercises.push({
      session_id: session.id,
      name: row.exercise_name,
      sets: row.exercise_sets,
      reps: row.exercise_reps,
      weight_kg: row.exercise_weight_kg,
      sort_order: row.exercise_sort_order,
    });
  }

  return serializeSession(session, exercises);
}

export async function setUserSessionCompletion(
  database: PgQueryable,
  userId: number,
  sessionId: number,
  completed: boolean,
): Promise<WorkoutSession | null> {
  const result = await database.query<{ id: number }>(
    `UPDATE workout_sessions
     SET completed_at = $1
     WHERE id = $2 AND user_id = $3
     RETURNING id`,
    [completed ? new Date().toISOString() : null, sessionId, userId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return getUserSession(database, userId, sessionId);
}

export async function deleteUserSession(
  database: PgQueryable,
  userId: number,
  sessionId: number,
): Promise<boolean> {
  const result = await database.query<{ id: number }>(
    "DELETE FROM workout_sessions WHERE id = $1 AND user_id = $2 RETURNING id",
    [sessionId, userId],
  );
  return result.rows.length > 0;
}
