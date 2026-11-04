import type { PgClient, PgPool } from "./database";
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
  database: PgClient,
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
  database: PgPool,
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
    serializeSession(
      session,
      exercisesBySession.get(session.id) ?? [],
    ),
  );
}

export async function createUserSession(
  database: PgPool,
  userId: number,
  input: WorkoutSessionInput,
): Promise<WorkoutSession> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query<SessionRow>(
      `INSERT INTO workout_sessions
         (user_id, title, session_date, notes, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, session_date, notes, completed_at, created_at`,
      [
        userId,
        input.title,
        input.date,
        input.notes,
        new Date().toISOString(),
      ],
    );
    const session = sessionResult.rows[0];
    if (!session) {
      throw new Error("The new workout session could not be created.");
    }

    if (input.exercises.length > 0) {
      const values: unknown[] = [];
      const rows = input.exercises.map((exercise, index) => {
        const parameter = index * 6;
        values.push(
          session.id,
          exercise.name,
          exercise.sets,
          exercise.reps,
          exercise.weightKg,
          index,
        );
        return `($${parameter + 1}, $${parameter + 2}, $${parameter + 3}, ` +
          `$${parameter + 4}, $${parameter + 5}, $${parameter + 6})`;
      });
      await client.query(
        `INSERT INTO session_exercises
           (session_id, name, sets, reps, weight_kg, sort_order)
         VALUES ${rows.join(", ")}`,
        values,
      );
    }

    const workout = await getUserSession(client, userId, session.id);
    if (!workout) {
      throw new Error("The new workout session could not be loaded.");
    }
    await client.query("COMMIT");
    return workout;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        JSON.stringify({
          event: "workout_create_rollback_failed",
          errorName:
            rollbackError instanceof Error
              ? rollbackError.name
              : "UnknownError",
        }),
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function setUserSessionCompletion(
  database: PgPool,
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

  const client = await database.connect();
  try {
    return await getUserSession(client, userId, sessionId);
  } finally {
    client.release();
  }
}

export async function deleteUserSession(
  database: PgPool,
  userId: number,
  sessionId: number,
): Promise<boolean> {
  const result = await database.query<{ id: number }>(
    "DELETE FROM workout_sessions WHERE id = $1 AND user_id = $2 RETURNING id",
    [sessionId, userId],
  );
  return result.rows.length > 0;
}
