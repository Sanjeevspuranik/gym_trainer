import type { PgQueryable } from "./database";
import type {
  WorkoutRoutineSnapshot,
  WorkoutSession,
  WorkoutSessionExercise,
  WorkoutSetResult,
} from "./types";
import type { RoutineDay } from "./routine-plan";
import type { RoutineWorkoutStartInput } from "./routine-session";
import type { WorkoutSessionInput } from "./validation";

type SessionRow = {
  id: number;
  title: string;
  session_date: string | Date;
  notes: string;
  completed_at: string | Date | null;
  created_at: string | Date;
  routine_week_start: string | Date | null;
  routine_weekday: number | null;
  routine_snapshot: RoutineDay | null;
  cardio_completed_at: string | Date | null;
};

type ExerciseRow = {
  id: number;
  session_id: number;
  name: string;
  sets: number;
  reps: number;
  weight_kg: string | number;
  sort_order: number;
};

type SetResultRow = {
  session_exercise_id: number;
  session_id: number;
  set_number: number;
  target_reps: number;
  target_weight_kg: string | number;
  actual_reps: number | null;
  actual_weight_kg: string | number | null;
  completed_at: string | Date | null;
};

type CreatedSessionRow = SessionRow & {
  exercise_id: number | null;
  exercise_name: string | null;
  exercise_sets: number | null;
  exercise_reps: number | null;
  exercise_weight_kg: string | number | null;
  exercise_sort_order: number | null;
};

export type SessionCompletionResult =
  | { status: "updated"; session: WorkoutSession }
  | { status: "not-found" }
  | { status: "not-ready" };

function toIsoString(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeSession(
  session: SessionRow,
  exercises: ExerciseRow[],
  setResults: SetResultRow[],
): WorkoutSession {
  const setResultsByExercise = new Map<number, WorkoutSetResult[]>();
  for (const result of setResults) {
    const list = setResultsByExercise.get(result.session_exercise_id) ?? [];
    list.push({
      setNumber: result.set_number,
      targetReps: result.target_reps,
      targetWeightKg: Number(result.target_weight_kg),
      actualReps: result.actual_reps,
      actualWeightKg:
        result.actual_weight_kg === null
          ? null
          : Number(result.actual_weight_kg),
      completedAt: toIsoString(result.completed_at),
    });
    setResultsByExercise.set(result.session_exercise_id, list);
  }

  const routine: WorkoutRoutineSnapshot | null =
    session.routine_week_start !== null &&
    session.routine_weekday !== null &&
    session.routine_snapshot !== null
      ? {
          weekStart:
            session.routine_week_start instanceof Date
              ? session.routine_week_start.toISOString().slice(0, 10)
              : session.routine_week_start.slice(0, 10),
          weekday: session.routine_weekday,
          day: session.routine_snapshot,
          cardioCompleted: session.cardio_completed_at !== null,
        }
      : null;

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
    routine,
    exercises: exercises.map((exercise): WorkoutSessionExercise => ({
      id: exercise.id,
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      weightKg: Number(exercise.weight_kg),
      setResults: setResultsByExercise.get(exercise.id) ?? [],
    })),
  };
}

async function getUserSession(
  database: PgQueryable,
  userId: number,
  sessionId: number,
): Promise<WorkoutSession | null> {
  const sessionResult = await database.query<SessionRow>(
    `SELECT id, title, session_date::text AS session_date, notes,
            completed_at, created_at,
            routine_week_start::text AS routine_week_start,
            routine_weekday, routine_snapshot, cardio_completed_at
     FROM workout_sessions
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  );
  const session = sessionResult.rows[0];
  if (!session) {
    return null;
  }

  const exerciseResult = await database.query<ExerciseRow>(
    `SELECT id, session_id, name, sets, reps, weight_kg, sort_order
     FROM session_exercises
     WHERE session_id = $1
     ORDER BY sort_order, id`,
    [sessionId],
  );
  const setResult = await database.query<SetResultRow>(
    `SELECT set_results.session_exercise_id, session_exercises.session_id,
            set_results.set_number, set_results.target_reps,
            set_results.target_weight_kg, set_results.actual_reps,
            set_results.actual_weight_kg, set_results.completed_at
     FROM session_set_results AS set_results
     JOIN session_exercises
       ON session_exercises.id = set_results.session_exercise_id
     JOIN workout_sessions
       ON workout_sessions.id = session_exercises.session_id
     WHERE workout_sessions.id = $1 AND workout_sessions.user_id = $2
     ORDER BY session_exercises.sort_order, set_results.set_number`,
    [sessionId, userId],
  );
  return serializeSession(session, exerciseResult.rows, setResult.rows);
}

export async function listUserSessions(
  database: PgQueryable,
  userId: number,
): Promise<WorkoutSession[]> {
  const sessionsResult = await database.query<SessionRow>(
    `SELECT id, title, session_date::text AS session_date, notes,
            completed_at, created_at,
            routine_week_start::text AS routine_week_start,
            routine_weekday, routine_snapshot, cardio_completed_at
     FROM workout_sessions
     WHERE user_id = $1
     ORDER BY session_date DESC, id DESC`,
    [userId],
  );
  if (sessionsResult.rows.length === 0) {
    return [];
  }

  const exercisesResult = await database.query<ExerciseRow>(
    `SELECT session_exercises.id, session_exercises.session_id,
            session_exercises.name, session_exercises.sets,
            session_exercises.reps, session_exercises.weight_kg,
            session_exercises.sort_order
     FROM session_exercises
     JOIN workout_sessions
       ON workout_sessions.id = session_exercises.session_id
     WHERE workout_sessions.user_id = $1
     ORDER BY session_exercises.session_id,
              session_exercises.sort_order, session_exercises.id`,
    [userId],
  );
  const setResultsResult = await database.query<SetResultRow>(
    `SELECT set_results.session_exercise_id, session_exercises.session_id,
            set_results.set_number, set_results.target_reps,
            set_results.target_weight_kg, set_results.actual_reps,
            set_results.actual_weight_kg, set_results.completed_at
     FROM session_set_results AS set_results
     JOIN session_exercises
       ON session_exercises.id = set_results.session_exercise_id
     JOIN workout_sessions
       ON workout_sessions.id = session_exercises.session_id
     WHERE workout_sessions.user_id = $1
     ORDER BY session_exercises.session_id,
              session_exercises.sort_order, set_results.set_number`,
    [userId],
  );

  const exercisesBySession = new Map<number, ExerciseRow[]>();
  for (const exercise of exercisesResult.rows) {
    const list = exercisesBySession.get(exercise.session_id) ?? [];
    list.push(exercise);
    exercisesBySession.set(exercise.session_id, list);
  }
  const setResultsBySession = new Map<number, SetResultRow[]>();
  for (const setResult of setResultsResult.rows) {
    const list = setResultsBySession.get(setResult.session_id) ?? [];
    list.push(setResult);
    setResultsBySession.set(setResult.session_id, list);
  }

  return sessionsResult.rows.map((session) =>
    serializeSession(
      session,
      exercisesBySession.get(session.id) ?? [],
      setResultsBySession.get(session.id) ?? [],
    ),
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
       RETURNING id, title, session_date::text AS session_date, notes,
                 completed_at, created_at,
                 routine_week_start::text AS routine_week_start,
                 routine_weekday, routine_snapshot, cardio_completed_at
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
       RETURNING id, session_id, name, sets, reps, weight_kg, sort_order
     )
     SELECT new_session.id, new_session.title, new_session.session_date,
            new_session.notes, new_session.completed_at, new_session.created_at,
            new_session.routine_week_start, new_session.routine_weekday,
            new_session.routine_snapshot, new_session.cardio_completed_at,
            new_exercises.id AS exercise_id,
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
    if (row.exercise_id === null || row.exercise_name === null) {
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
      id: row.exercise_id,
      session_id: session.id,
      name: row.exercise_name,
      sets: row.exercise_sets,
      reps: row.exercise_reps,
      weight_kg: row.exercise_weight_kg,
      sort_order: row.exercise_sort_order,
    });
  }

  return serializeSession(session, exercises, []);
}

export async function createUserRoutineSession(
  database: PgQueryable,
  userId: number,
  input: RoutineWorkoutStartInput,
): Promise<WorkoutSession> {
  const preparedExercises = input.exercises.map(
    ({ routineExercise, option, weightKg }, index) => ({
      name: option.name,
      sets: routineExercise.sets.min,
      reps: routineExercise.reps.min,
      weight_kg: weightKg,
      sort_order: index,
      set_targets: Array.from(
        { length: routineExercise.sets.min },
        (_value, setIndex) => ({
          set_number: setIndex + 1,
          target_reps: routineExercise.reps.min,
          target_weight_kg: weightKg,
        }),
      ),
    }),
  );
  const result = await database.query<{ id: number }>(
    `WITH new_session AS (
       INSERT INTO workout_sessions
         (user_id, title, session_date, notes, created_at,
          routine_week_start, routine_weekday, routine_snapshot)
       VALUES ($1, $2, $3, '', NOW(), $4, $5, $6::jsonb)
       RETURNING id
     ),
     input_exercises AS (
       SELECT *
       FROM jsonb_to_recordset($7::jsonb) AS exercise(
         name TEXT,
         sets INTEGER,
         reps INTEGER,
         weight_kg NUMERIC,
         sort_order INTEGER,
         set_targets JSONB
       )
     ),
     new_exercises AS (
       INSERT INTO session_exercises
         (session_id, name, sets, reps, weight_kg, sort_order)
       SELECT new_session.id, input_exercises.name, input_exercises.sets,
              input_exercises.reps, input_exercises.weight_kg,
              input_exercises.sort_order
       FROM new_session
       CROSS JOIN input_exercises
       RETURNING id, sort_order
     ),
     new_set_results AS (
       INSERT INTO session_set_results
         (session_exercise_id, set_number, target_reps, target_weight_kg)
       SELECT new_exercises.id, set_target.set_number,
              set_target.target_reps, set_target.target_weight_kg
       FROM new_exercises
       JOIN input_exercises USING (sort_order)
       CROSS JOIN LATERAL jsonb_to_recordset(input_exercises.set_targets)
         AS set_target(
           set_number SMALLINT,
           target_reps SMALLINT,
           target_weight_kg NUMERIC
         )
       RETURNING session_exercise_id
     )
     SELECT new_session.id
     FROM new_session
     CROSS JOIN (SELECT COUNT(*) FROM new_set_results) AS inserted_sets`,
    [
      userId,
      input.day.title,
      input.sessionDate,
      input.weekStart,
      input.weekday,
      JSON.stringify(input.day),
      JSON.stringify(preparedExercises),
    ],
  );
  const sessionId = result.rows[0]?.id;
  if (!sessionId) {
    throw new Error("The planned workout could not be started.");
  }
  const session = await getUserSession(database, userId, sessionId);
  if (!session) {
    throw new Error("The planned workout could not be loaded.");
  }
  return session;
}

export async function updateUserSessionSetResult(
  database: PgQueryable,
  userId: number,
  sessionId: number,
  exerciseId: number,
  setNumber: number,
  actualReps: number,
  actualWeightKg: number,
  completed: boolean,
): Promise<WorkoutSession | null> {
  const result = await database.query<{ session_exercise_id: number }>(
    `UPDATE session_set_results AS set_result
     SET actual_reps = $5,
         actual_weight_kg = $6,
         completed_at = CASE WHEN $7 THEN NOW() ELSE NULL END,
         updated_at = NOW()
     FROM session_exercises AS exercise
     JOIN workout_sessions AS session
       ON session.id = exercise.session_id
     WHERE set_result.session_exercise_id = exercise.id
       AND exercise.id = $3
       AND exercise.session_id = $2
       AND set_result.set_number = $4
       AND session.user_id = $1
       AND session.completed_at IS NULL
     RETURNING set_result.session_exercise_id`,
    [
      userId,
      sessionId,
      exerciseId,
      setNumber,
      actualReps,
      actualWeightKg,
      completed,
    ],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return getUserSession(database, userId, sessionId);
}

export async function setUserSessionCardioCompletion(
  database: PgQueryable,
  userId: number,
  sessionId: number,
  completed: boolean,
): Promise<WorkoutSession | null> {
  const result = await database.query<{ id: number }>(
    `UPDATE workout_sessions
     SET cardio_completed_at = CASE WHEN $3 THEN NOW() ELSE NULL END
     WHERE id = $1
       AND user_id = $2
       AND routine_snapshot IS NOT NULL
       AND jsonb_array_length(routine_snapshot->'cardioFinisher') > 0
       AND completed_at IS NULL
     RETURNING id`,
    [sessionId, userId, completed],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return getUserSession(database, userId, sessionId);
}

export async function setUserSessionCompletion(
  database: PgQueryable,
  userId: number,
  sessionId: number,
  completed: boolean,
): Promise<SessionCompletionResult> {
  const result = await database.query<{ id: number }>(
    `UPDATE workout_sessions AS session
     SET completed_at = CASE WHEN $1 THEN NOW() ELSE NULL END
     WHERE session.id = $2
       AND session.user_id = $3
       AND (
         NOT $1
         OR session.routine_snapshot IS NULL
         OR (
           NOT EXISTS (
             SELECT 1
             FROM session_exercises AS exercise
             LEFT JOIN session_set_results AS set_result
               ON set_result.session_exercise_id = exercise.id
             WHERE exercise.session_id = session.id
               AND set_result.completed_at IS NULL
           )
           AND (
             jsonb_array_length(
               COALESCE(session.routine_snapshot->'cardioFinisher', '[]'::jsonb)
             ) = 0
             OR session.cardio_completed_at IS NOT NULL
           )
         )
       )
     RETURNING session.id`,
    [completed, sessionId, userId],
  );

  if (result.rows.length === 0) {
    const ownedSession = await database.query<{ id: number }>(
      "SELECT id FROM workout_sessions WHERE id = $1 AND user_id = $2",
      [sessionId, userId],
    );
    return ownedSession.rows.length === 0
      ? { status: "not-found" }
      : { status: "not-ready" };
  }

  const session = await getUserSession(database, userId, sessionId);
  if (!session) {
    return { status: "not-found" };
  }
  return { status: "updated", session };
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
