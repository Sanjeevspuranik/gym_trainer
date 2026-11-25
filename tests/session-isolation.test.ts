import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createPgConfig } from "@electric-sql/pglite/node-postgres";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import {
  checkAuthRateLimit,
  type RateLimitResult,
} from "../src/lib/rate-limit";
import { applyMigrations } from "../src/lib/migration-runner";
import {
  createUserSession,
  createUserRoutineSession,
  deleteUserSession,
  listUserSessions,
  setUserSessionCardioCompletion,
  setUserSessionCompletion,
  updateUserSessionSetResult,
} from "../src/lib/session-store";
import { importSqliteDatabase } from "../scripts/sqlite-importer";
import { createUserWithSession } from "../src/lib/auth-store";
import { DEFAULT_WEEKLY_ROUTINE } from "../src/lib/routine-plan";
import {
  deleteUserRoutineWeekOverride,
  getUserRoutineForWeek,
  saveUserRoutineWeekOverride,
  upgradeLegacyChestRoutines,
  seedDefaultRoutinesForExistingUsers,
} from "../src/lib/routine-store";
import { parseWeeklyRoutine } from "../src/lib/routine-validation";
import { parseRoutineWorkoutStart } from "../src/lib/routine-session";
import {
  parseWorkoutSession,
  USERNAME_HTML_PATTERN,
} from "../src/lib/validation";
import {
  isRoutineWeekStart,
  routineDateForWeekday,
  routineWeekDates,
  routineWeekStart,
  shiftLocalDate,
} from "../src/lib/routine-dates";

async function createTestDatabase(): Promise<{
  pool: Pool;
  database: PGlite;
  close: () => Promise<void>;
}> {
  const database = new PGlite();
  await database.waitReady;
  const pool = new Pool(createPgConfig(database));
  const client = await pool.connect();
  try {
    await applyMigrations(
      client,
      resolve(process.cwd(), "db", "migrations"),
    );
  } finally {
    client.release();
  }
  return {
    pool,
    database,
    close: async () => {
      await pool.end();
      await database.close();
    },
  };
}

test("database migrations are tracked and safe to rerun", async () => {
  const { pool, close } = await createTestDatabase();
  const client = await pool.connect();
  try {
    assert.deepEqual(
      await applyMigrations(client, resolve(process.cwd(), "db", "migrations")),
      [],
    );
    const result = await client.query<{ version: string }>(
      "SELECT version FROM gym_trainer_migrations ORDER BY version",
    );
    assert.deepEqual(result.rows.map((row) => row.version), [
      "0001_initial",
      "0002_routines_and_set_results",
      "0003_routine_workout_tracking",
    ]);
  } finally {
    client.release();
    await close();
  }
});

test("account creation and its login session are atomic", async () => {
  const { pool, database, close } = await createTestDatabase();
  try {
    const account = await createUserWithSession(pool, {
      username: "new_account",
      passwordSalt: "test-salt",
      passwordHash: "test-hash",
      tokenHash: "a".repeat(64),
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    assert.deepEqual(account, { id: 1, username: "new_account" });

    const sessions = await pool.query<{ user_id: number }>(
      "SELECT user_id FROM auth_sessions WHERE token_hash = $1",
      ["a".repeat(64)],
    );
    assert.deepEqual(sessions.rows, [{ user_id: 1 }]);

    const routine = await pool.query<{
      user_id: number;
      routine_json: typeof DEFAULT_WEEKLY_ROUTINE;
    }>(
      "SELECT user_id, routine_json FROM user_routine_plans WHERE user_id = $1",
      [account.id],
    );
    assert.equal(routine.rows[0]?.user_id, account.id);
    assert.deepEqual(routine.rows[0]?.routine_json, DEFAULT_WEEKLY_ROUTINE);

    await assert.rejects(
      createUserWithSession(pool, {
        username: "new_account",
        passwordSalt: "other-salt",
        passwordHash: "other-hash",
        tokenHash: "b".repeat(64),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const counts = await database.query<{
      user_count: number;
      session_count: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::INTEGER FROM users WHERE username = $1) AS user_count,
         (SELECT COUNT(*)::INTEGER FROM auth_sessions WHERE token_hash = $2) AS session_count`,
      ["new_account", "b".repeat(64)],
    );
    assert.deepEqual(counts.rows[0], { user_count: 1, session_count: 0 });
  } finally {
    await close();
  }
});

test("existing accounts receive the default routine without overwriting edits", async () => {
  const { pool, close } = await createTestDatabase();
  try {
    const aliceId = await insertUser(pool, "routine_alice");
    const bobId = await insertUser(pool, "routine_bob");
    assert.equal(await seedDefaultRoutinesForExistingUsers(pool), 2);

    const initial = await pool.query<{
      user_id: number;
      routine_json: typeof DEFAULT_WEEKLY_ROUTINE;
    }>(
      "SELECT user_id, routine_json FROM user_routine_plans ORDER BY user_id",
    );
    assert.deepEqual(
      initial.rows.map((row) => row.user_id),
      [aliceId, bobId],
    );
    assert.ok(
      initial.rows.every(
        (row) => row.routine_json.days.length === 7,
      ),
    );

    await pool.query(
      `UPDATE user_routine_plans
       SET routine_json = jsonb_set(routine_json, '{name}', '"My edited routine"')
       WHERE user_id = $1`,
      [aliceId],
    );
    assert.equal(await seedDefaultRoutinesForExistingUsers(pool), 0);

    const preserved = await pool.query<{ routine_json: { name: string } }>(
      "SELECT routine_json FROM user_routine_plans WHERE user_id = $1",
      [aliceId],
    );
    assert.equal(preserved.rows[0]?.routine_json.name, "My edited routine");
  } finally {
    await close();
  }
});

test("legacy base routines receive only the chest updates and preserve week overrides", async () => {
  const { pool, close } = await createTestDatabase();
  try {
    const userId = await insertUser(pool, "chest_upgrade_user");
    const legacy = structuredClone(DEFAULT_WEEKLY_ROUTINE);
    legacy.version = 1;
    const tuesday = legacy.days.find((day) => day.weekday === 2);
    const saturday = legacy.days.find((day) => day.weekday === 6);
    const newTuesday = DEFAULT_WEEKLY_ROUTINE.days.find(
      (day) => day.weekday === 2,
    );
    const newSaturday = DEFAULT_WEEKLY_ROUTINE.days.find(
      (day) => day.weekday === 6,
    );
    assert.ok(tuesday);
    assert.ok(saturday);
    assert.ok(newTuesday);
    assert.ok(newSaturday);
    const newTuesdayChestKeys = new Set([
      "tuesday-incline-db-press",
      "tuesday-flat-db-press",
      "tuesday-db-flyes",
      "tuesday-db-pullover-finisher",
    ]);
    tuesday.notes = "Keep my existing push-day notes.";
    tuesday.exercises = [
      { ...newTuesday.exercises[0]!, key: "tuesday-bench-press" },
      { ...newTuesday.exercises[1]!, key: "tuesday-incline-press" },
      ...newTuesday.exercises.filter(
        (exercise) => !newTuesdayChestKeys.has(exercise.key),
      ),
    ];
    const oldSaturdayFlat = {
      ...newSaturday.exercises.find(
        (exercise) => exercise.key === "saturday-neutral-grip-flat-db-press",
      )!,
      key: "saturday-flat-bench",
      options: [
        {
          ...newSaturday.exercises.find(
            (exercise) =>
              exercise.key === "saturday-neutral-grip-flat-db-press",
          )!.options[0]!,
          name: "Flat Dumbbell Bench Press",
        },
      ],
    };
    saturday.exercises = saturday.exercises.map((exercise) =>
      exercise.key === "saturday-neutral-grip-flat-db-press"
        ? oldSaturdayFlat
        : exercise,
    );
    const thursday = legacy.days.find((day) => day.weekday === 4);
    assert.ok(thursday);
    thursday.notes = "Keep this unrelated day unchanged.";

    await pool.query(
      `INSERT INTO user_routine_plans (user_id, routine_json)
       VALUES ($1, $2::jsonb)`,
      [userId, JSON.stringify(legacy)],
    );
    const weeklyOverride = structuredClone(legacy);
    weeklyOverride.days[1]!.title = "My saved custom week";
    await pool.query(
      `INSERT INTO routine_week_overrides (user_id, week_start, routine_json)
       VALUES ($1, '2026-11-23', $2::jsonb)`,
      [userId, JSON.stringify(weeklyOverride)],
    );

    assert.equal(await upgradeLegacyChestRoutines(pool), 2);
    assert.equal(await upgradeLegacyChestRoutines(pool), 0);

    const upgraded = await pool.query<{
      routine_json: typeof DEFAULT_WEEKLY_ROUTINE;
    }>(
      "SELECT routine_json FROM user_routine_plans WHERE user_id = $1",
      [userId],
    );
    const routine = upgraded.rows[0]?.routine_json;
    assert.ok(routine);
    assert.equal(routine.version, 2);
    assert.equal(
      routine.days.find((day) => day.weekday === 2)?.notes,
      "Keep my existing push-day notes.",
    );
    assert.equal(
      routine.days.find((day) => day.weekday === 4)?.notes,
      "Keep this unrelated day unchanged.",
    );
    assert.deepEqual(
      routine.days
        .find((day) => day.weekday === 2)
        ?.exercises.map((exercise) => exercise.key),
      newTuesday.exercises.map((exercise) => exercise.key),
    );
    assert.equal(
      routine.days
        .find((day) => day.weekday === 6)
        ?.exercises.find(
          (exercise) =>
            exercise.key === "saturday-neutral-grip-flat-db-press",
        )?.options[0]?.name,
      "Neutral-Grip Flat Dumbbell Press",
    );

    const preservedOverride = await pool.query<{
      routine_json: typeof DEFAULT_WEEKLY_ROUTINE;
    }>(
      `SELECT routine_json
       FROM routine_week_overrides
       WHERE user_id = $1 AND week_start = '2026-11-23'`,
      [userId],
    );
    assert.equal(preservedOverride.rows[0]?.routine_json.version, 2);
    assert.equal(
      preservedOverride.rows[0]?.routine_json.days[1]?.title,
      "My saved custom week",
    );
    assert.deepEqual(
      preservedOverride.rows[0]?.routine_json.days[1]?.exercises.map(
        (exercise) => exercise.key,
      ),
      newTuesday.exercises.map((exercise) => exercise.key),
    );
  } finally {
    await close();
  }
});

test("routine data covers the full week and cardio only on the supplied lifting days", () => {
  assert.deepEqual(
    DEFAULT_WEEKLY_ROUTINE.days.map((day) => day.weekday),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.deepEqual(
    DEFAULT_WEEKLY_ROUTINE.days
      .filter((day) => day.cardioFinisher.length > 0)
      .map((day) => day.weekday),
    [1, 2, 4, 5, 6],
  );
  assert.deepEqual(
    DEFAULT_WEEKLY_ROUTINE.days.find((day) => day.weekday === 3)?.kind,
    "active-recovery",
  );
  assert.deepEqual(
    DEFAULT_WEEKLY_ROUTINE.days.find((day) => day.weekday === 7)?.kind,
    "rest",
  );
  assert.equal(DEFAULT_WEEKLY_ROUTINE.proteinTargetGrams.min, 120);
  assert.equal(DEFAULT_WEEKLY_ROUTINE.proteinTargetGrams.max, 150);
  assert.deepEqual(
    DEFAULT_WEEKLY_ROUTINE.days[0]?.cardioFinisher.map((segment) => [
      segment.durationMinutes,
      segment.speed,
      segment.inclinePercent,
    ]),
    [
      [15, 5, 13],
      [5, 7.5, 3],
    ],
  );
});

test("the requested chest exercises are updated on Monday, Tuesday, and Saturday only", () => {
  const monday = DEFAULT_WEEKLY_ROUTINE.days.find((day) => day.weekday === 1);
  const tuesday = DEFAULT_WEEKLY_ROUTINE.days.find((day) => day.weekday === 2);
  const saturday = DEFAULT_WEEKLY_ROUTINE.days.find((day) => day.weekday === 6);
  assert.ok(monday);
  assert.ok(tuesday);
  assert.ok(saturday);

  assert.deepEqual(
    monday.exercises
      .filter((exercise) =>
        ["monday-incline-db-press", "monday-flat-db-press"].includes(
          exercise.key,
        ),
      )
      .map((exercise) => [
        exercise.sets,
        exercise.reps,
        exercise.options[0]?.minWeightKg,
        exercise.options[0]?.maxWeightKg,
      ]),
    [
      [{ min: 2, max: 2 }, { min: 12, max: 12 }, 12.5, 12.5],
      [{ min: 2, max: 2 }, { min: 12, max: 12 }, 12.5, 12.5],
    ],
  );

  const tuesdayChest = tuesday.exercises.slice(0, 4);
  assert.deepEqual(
    tuesdayChest.map((exercise) => [
      exercise.key,
      exercise.sets,
      exercise.reps,
      exercise.options.map((option) => [
        option.name,
        option.minWeightKg,
        option.maxWeightKg,
        option.weightLabel,
      ]),
    ]),
    [
      [
        "tuesday-incline-db-press",
        { min: 3, max: 3 },
        { min: 10, max: 12 },
        [["Incline Dumbbell Bench Press", 12.5, 15, "kg each"]],
      ],
      [
        "tuesday-flat-db-press",
        { min: 3, max: 3 },
        { min: 10, max: 12 },
        [
          ["Flat Dumbbell Bench Press", 12.5, 12.5, "kg each"],
          ["Dumbbell Squeeze Press", 12.5, 12.5, "kg each"],
        ],
      ],
      [
        "tuesday-db-flyes",
        { min: 3, max: 3 },
        { min: 12, max: 15 },
        [
          ["Incline Dumbbell Flyes", 7.5, 10, "kg each"],
          ["Flat Dumbbell Flyes", 7.5, 10, "kg each"],
        ],
      ],
      [
        "tuesday-db-pullover-finisher",
        { min: 2, max: 2 },
        { min: 12, max: 15 },
        [
          ["Dumbbell Pullover", 12.5, 12.5, "kg"],
          ["Svend-Style Dumbbell Press", 12.5, 12.5, "kg"],
        ],
      ],
    ],
  );
  assert.equal(tuesday.exercises[4]?.key, "tuesday-shoulder-press");
  assert.equal(tuesday.exercises[5]?.key, "tuesday-lateral-raise");
  assert.equal(tuesday.exercises[6]?.key, "tuesday-triceps");

  assert.equal(
    saturday.exercises.find(
      (exercise) => exercise.key === "saturday-incline-db-press",
    )?.options[0]?.minWeightKg,
    15,
  );
  assert.equal(
    saturday.exercises.find(
      (exercise) =>
        exercise.key === "saturday-incline-db-press",
    )?.options[0]?.maxWeightKg,
    15,
  );
  const neutralGrip = saturday.exercises.find(
    (exercise) =>
      exercise.key === "saturday-neutral-grip-flat-db-press",
  );
  assert.equal(neutralGrip?.reps.min, 12);
  assert.equal(neutralGrip?.reps.max, 12);
  assert.equal(neutralGrip?.options[0]?.minWeightKg, 12.5);
  assert.equal(neutralGrip?.options[0]?.maxWeightKg, 15);
});

test("routine week dates use local Monday-based calendar weeks", () => {
  assert.equal(routineWeekStart("2026-11-26"), "2026-11-23");
  assert.equal(routineWeekStart("2026-11-29"), "2026-11-23");
  assert.equal(routineWeekStart("2027-01-03"), "2026-12-28");
  assert.equal(isRoutineWeekStart("2026-11-23"), true);
  assert.equal(isRoutineWeekStart("2026-11-24"), false);
  assert.equal(isRoutineWeekStart("2026-02-30"), false);
  assert.deepEqual(routineWeekDates("2026-11-23"), [
    "2026-11-23",
    "2026-11-24",
    "2026-11-25",
    "2026-11-26",
    "2026-11-27",
    "2026-11-28",
    "2026-11-29",
  ]);
  assert.equal(routineDateForWeekday("2026-11-23", 7), "2026-11-29");
  assert.equal(shiftLocalDate("2026-12-31", 1), "2027-01-01");
});

test("weekly routine validation accepts the supplied plan and rejects invalid edits", () => {
  const valid = parseWeeklyRoutine(DEFAULT_WEEKLY_ROUTINE);
  assert.equal(valid.ok, true);

  const duplicateDay = structuredClone(DEFAULT_WEEKLY_ROUTINE);
  duplicateDay.days[1]!.weekday = 1;
  assert.deepEqual(parseWeeklyRoutine(duplicateDay), {
    ok: false,
    error: "Each weekday must appear exactly once.",
  });

  const invalidRange = structuredClone(DEFAULT_WEEKLY_ROUTINE);
  invalidRange.days[0]!.exercises[0]!.sets = { min: 4, max: 2 };
  assert.deepEqual(parseWeeklyRoutine(invalidRange), {
    ok: false,
    error: "One or more routine days are invalid.",
  });

  const invalidRecoveryDay = structuredClone(DEFAULT_WEEKLY_ROUTINE);
  invalidRecoveryDay.days[2]!.exercises = [
    structuredClone(DEFAULT_WEEKLY_ROUTINE.days[0]!.exercises[0]!),
  ];
  assert.deepEqual(parseWeeklyRoutine(invalidRecoveryDay), {
    ok: false,
    error: "One or more routine days are invalid.",
  });
});

test("week overrides are private, replaceable, and removable to restore the baseline", async () => {
  const { pool, close } = await createTestDatabase();
  try {
    const aliceId = await insertUser(pool, "week_alice");
    const bobId = await insertUser(pool, "week_bob");
    await seedDefaultRoutinesForExistingUsers(pool);

    const defaultPlan = await getUserRoutineForWeek(
      pool,
      aliceId,
      "2026-11-23",
    );
    assert.equal(defaultPlan?.is_override, false);
    assert.deepEqual(defaultPlan?.routine_json, DEFAULT_WEEKLY_ROUTINE);

    const editedPlan = structuredClone(DEFAULT_WEEKLY_ROUTINE);
    editedPlan.days[0]!.title = "Edited Monday";
    await saveUserRoutineWeekOverride(
      pool,
      aliceId,
      "2026-11-23",
      editedPlan,
    );

    const aliceOverride = await getUserRoutineForWeek(
      pool,
      aliceId,
      "2026-11-23",
    );
    assert.equal(aliceOverride?.is_override, true);
    assert.equal(aliceOverride?.routine_json.days[0]?.title, "Edited Monday");

    const bobRoutine = await getUserRoutineForWeek(
      pool,
      bobId,
      "2026-11-23",
    );
    assert.equal(bobRoutine?.is_override, false);
    assert.equal(bobRoutine?.routine_json.days[0]?.title, "Upper Body A");
    assert.equal(
      await deleteUserRoutineWeekOverride(pool, bobId, "2026-11-23"),
      false,
    );

    assert.equal(
      await deleteUserRoutineWeekOverride(pool, aliceId, "2026-11-23"),
      true,
    );
    const restored = await getUserRoutineForWeek(
      pool,
      aliceId,
      "2026-11-23",
    );
    assert.equal(restored?.is_override, false);
    assert.deepEqual(restored?.routine_json, DEFAULT_WEEKLY_ROUTINE);
  } finally {
    await close();
  }
});

test("routine workouts snapshot their plan and require sets and cardio before finishing", async () => {
  const { pool, database, close } = await createTestDatabase();
  try {
    const aliceId = await insertUser(pool, "routine_workout_alice");
    const bobId = await insertUser(pool, "routine_workout_bob");
    const monday = DEFAULT_WEEKLY_ROUTINE.days.find((day) => day.weekday === 1);
    assert.ok(monday);
    const exerciseChoices = monday.exercises.map((exercise) => {
      const option = exercise.options[0];
      assert.ok(option);
      return {
        exerciseKey: exercise.key,
        optionIndex: 0,
        weightKg: option.minWeightKg ?? option.maxWeightKg ?? 0,
      };
    });
    const startValidation = parseRoutineWorkoutStart(
      { date: "2026-11-23", exerciseChoices },
      "2026-11-23",
      DEFAULT_WEEKLY_ROUTINE,
    );
    assert.equal(startValidation.ok, true);
    if (!startValidation.ok) {
      return;
    }

    const session = await createUserRoutineSession(
      pool,
      aliceId,
      startValidation.value,
    );
    assert.equal(session.routine?.weekStart, "2026-11-23");
    assert.equal(session.routine?.weekday, 1);
    assert.equal(session.routine?.cardioCompleted, false);
    assert.equal(session.exercises.length, monday.exercises.length);
    assert.equal(
      session.exercises.reduce(
        (total, exercise) => total + exercise.setResults.length,
        0,
      ),
      monday.exercises.reduce(
        (total, exercise) => total + exercise.sets.min,
        0,
      ),
    );

    const firstExercise = session.exercises[0];
    const firstSet = firstExercise?.setResults[0];
    assert.ok(firstExercise);
    assert.ok(firstSet);
    assert.equal(
      await updateUserSessionSetResult(
        pool,
        bobId,
        session.id,
        firstExercise.id,
        firstSet.setNumber,
        firstSet.targetReps,
        firstSet.targetWeightKg,
        true,
      ),
      null,
    );
    assert.equal(
      await setUserSessionCardioCompletion(pool, bobId, session.id, true),
      null,
    );
    assert.deepEqual(
      await setUserSessionCompletion(pool, aliceId, session.id, true),
      { status: "not-ready" },
    );

    const savedSet = await updateUserSessionSetResult(
      pool,
      aliceId,
      session.id,
      firstExercise.id,
      firstSet.setNumber,
      firstSet.targetReps + 1,
      firstSet.targetWeightKg,
      true,
    );
    assert.equal(savedSet?.exercises[0]?.setResults[0]?.actualReps, firstSet.targetReps + 1);

    await database.query(
      `UPDATE session_set_results
       SET actual_reps = target_reps,
           actual_weight_kg = target_weight_kg,
           completed_at = NOW()
       WHERE session_exercise_id IN (
         SELECT id FROM session_exercises WHERE session_id = $1
       )`,
      [session.id],
    );
    assert.deepEqual(
      await setUserSessionCompletion(pool, aliceId, session.id, true),
      { status: "not-ready" },
    );
    const cardioComplete = await setUserSessionCardioCompletion(
      pool,
      aliceId,
      session.id,
      true,
    );
    assert.equal(cardioComplete?.routine?.cardioCompleted, true);
    const finished = await setUserSessionCompletion(
      pool,
      aliceId,
      session.id,
      true,
    );
    assert.equal(finished.status, "updated");
    if (finished.status === "updated") {
      assert.equal(finished.session.completed, true);
    }
  } finally {
    await close();
  }
});

test("routine workout start rejects dates outside the selected week and unplanned loads", () => {
  const monday = DEFAULT_WEEKLY_ROUTINE.days.find((day) => day.weekday === 1);
  assert.ok(monday);
  const exerciseChoices = monday.exercises.map((exercise) => ({
    exerciseKey: exercise.key,
    optionIndex: 0,
    weightKg: exercise.options[0]?.minWeightKg ?? 0,
  }));

  const outsideWeek = parseRoutineWorkoutStart(
    { date: "2026-12-01", exerciseChoices },
    "2026-11-23",
    DEFAULT_WEEKLY_ROUTINE,
  );
  assert.equal(outsideWeek.ok, false);

  const tooHeavy = exerciseChoices.map((choice, index) =>
    index === 0 ? { ...choice, weightKg: 1000 } : choice,
  );
  const invalidLoad = parseRoutineWorkoutStart(
    { date: "2026-11-23", exerciseChoices: tooHeavy },
    "2026-11-23",
    DEFAULT_WEEKLY_ROUTINE,
  );
  assert.equal(invalidLoad.ok, false);
});

test("week overrides are Monday-based and completed set results belong to a session exercise", async () => {
  const { pool, database, close } = await createTestDatabase();
  try {
    const userId = await insertUser(pool, "week_owner");
    const monday = await pool.query<{ week_start: string }>(
      `INSERT INTO routine_week_overrides (user_id, week_start, routine_json)
       VALUES ($1, '2026-11-23', $2::jsonb)
       RETURNING week_start::text AS week_start`,
      [userId, JSON.stringify(DEFAULT_WEEKLY_ROUTINE)],
    );
    assert.equal(monday.rows[0]?.week_start, "2026-11-23");

    const session = await createUserSession(pool, userId, {
      title: "Set result test",
      date: "2026-11-26",
      notes: "",
      exercises: [{ name: "Bench press", sets: 2, reps: 8, weightKg: 12.5 }],
    });
    const exercise = await pool.query<{ id: number }>(
      "SELECT id FROM session_exercises WHERE session_id = $1",
      [session.id],
    );
    const exerciseId = exercise.rows[0]?.id;
    assert.ok(exerciseId);
    const set = await pool.query<{
      set_number: number;
      actual_reps: number;
      actual_weight_kg: string;
      completed_at: Date;
    }>(
      `INSERT INTO session_set_results
         (session_exercise_id, set_number, actual_reps, actual_weight_kg, completed_at)
       VALUES ($1, 1, 8, 12.5, NOW())
       RETURNING set_number, actual_reps, actual_weight_kg, completed_at`,
      [exerciseId],
    );
    assert.equal(set.rows[0]?.set_number, 1);
    assert.equal(set.rows[0]?.actual_reps, 8);
    assert.equal(Number(set.rows[0]?.actual_weight_kg), 12.5);
    assert.ok(set.rows[0]?.completed_at);

    await assert.rejects(
      database.query(
        `INSERT INTO routine_week_overrides (user_id, week_start, routine_json)
         VALUES ($1, '2026-11-24', $2::jsonb)`,
        [userId, JSON.stringify(DEFAULT_WEEKLY_ROUTINE)],
      ),
    );
  } finally {
    await close();
  }
});

test("SQLite import preserves account and workout data without changing the source", async () => {
  const { pool, close } = await createTestDatabase();
  const directory = await mkdtemp(join(tmpdir(), "gym-trainer-import-"));
  const sourcePath = join(directory, "legacy.sqlite3");
  const source = new Database(sourcePath);
  try {
    source.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE workout_sessions (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        session_date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        completed_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE session_exercises (
        id INTEGER PRIMARY KEY,
        session_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sets INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        weight_kg REAL NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
    source
      .prepare(
        `INSERT INTO users
         (id, username, password_salt, password_hash, created_at)
         VALUES (4, 'imported_user', 'salt', 'hash', '2026-01-02T03:04:05.000Z')`,
      )
      .run();
    source
      .prepare(
        `INSERT INTO workout_sessions
         (id, user_id, title, session_date, notes, completed_at, created_at)
         VALUES (9, 4, 'Imported workout', '2026-11-04', 'Keep the tempo',
                 '2026-11-04T10:00:00.000Z', '2026-11-04T09:00:00.000Z')`,
      )
      .run();
    source
      .prepare(
        `INSERT INTO session_exercises
         (id, session_id, name, sets, reps, weight_kg, sort_order)
         VALUES (12, 9, 'Deadlift', 3, 5, 80.5, 0)`,
      )
      .run();
    source.close();

    const result = await importSqliteDatabase(sourcePath, pool);
    assert.deepEqual(result, { accounts: 1, sessions: 1, exercises: 1 });
    const user = await pool.query<{
      id: number;
      username: string;
      password_hash: string;
    }>("SELECT id, username, password_hash FROM users WHERE id = $1", [4]);
    assert.deepEqual(user.rows[0], {
      id: 4,
      username: "imported_user",
      password_hash: "hash",
    });

    const session = await pool.query<{
      id: number;
      title: string;
      notes: string;
      completed_at: Date | null;
    }>(
      `SELECT id, title, notes, completed_at
       FROM workout_sessions WHERE id = $1 AND user_id = $2`,
      [9, 4],
    );
    assert.equal(session.rows[0]?.title, "Imported workout");
    assert.equal(session.rows[0]?.notes, "Keep the tempo");
    assert.equal(
      session.rows[0]?.completed_at?.toISOString(),
      "2026-11-04T10:00:00.000Z",
    );
    assert.equal(
      (await listUserSessions(pool, 4))[0]?.exercises[0]?.weightKg,
      80.5,
    );

    const readOnlySource = new Database(sourcePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      assert.deepEqual(
        readOnlySource.prepare("SELECT COUNT(*) AS count FROM users").get(),
        { count: 1 },
      );
    } finally {
      readOnlySource.close();
    }

    const nextUser = await insertUser(pool, "new_user");
    assert.equal(nextUser, 5);
    const nextSession = await createUserSession(pool, 4, {
      title: "After import",
      date: "2026-11-05",
      notes: "",
      exercises: [
        { name: "Row", sets: 2, reps: 10, weightKg: 20 },
      ],
    });
    assert.equal(nextSession.id, 10);
  } finally {
    if (source.open) {
      source.close();
    }
    await close();
    await rm(directory, { recursive: true, force: true });
  }
});

async function insertUser(pool: Pool, username: string): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO users (username, password_salt, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [username, "test-salt", "test-hash"],
  );
  const user = result.rows[0];
  assert.ok(user);
  return user.id;
}

test("workout sessions are isolated to the owning user", async () => {
  const { pool, close } = await createTestDatabase();
  try {
    const aliceId = await insertUser(pool, "alice");
    const bobId = await insertUser(pool, "bob");
    const input = {
      title: "Upper body",
      date: "2026-11-04",
      notes: "",
      exercises: [
        { name: "Bench press", sets: 3, reps: 8, weightKg: 50 },
      ],
    };
    const aliceSession = await createUserSession(pool, aliceId, input);

    assert.equal((await listUserSessions(pool, bobId)).length, 0);
    assert.deepEqual(
      await setUserSessionCompletion(pool, bobId, aliceSession.id, true),
      { status: "not-found" },
    );
    assert.equal(
      await deleteUserSession(pool, bobId, aliceSession.id),
      false,
    );

    const aliceSessions = await listUserSessions(pool, aliceId);
    assert.equal(aliceSessions.length, 1);
    assert.equal(aliceSessions[0].title, "Upper body");
    assert.equal(aliceSessions[0].exercises[0].name, "Bench press");
    assert.equal(aliceSessions[0].completed, false);

    const completed = await setUserSessionCompletion(
      pool,
      aliceId,
      aliceSession.id,
      true,
    );
    assert.equal(completed.status, "updated");
    if (completed.status === "updated") {
      assert.equal(completed.session.completed, true);
    }
  } finally {
    await close();
  }
});

test("workout and exercise writes roll back together", async () => {
  const { pool, database, close } = await createTestDatabase();
  try {
    const userId = await insertUser(pool, "rollback_user");
    await assert.rejects(
      createUserSession(pool, userId, {
        title: "Invalid workout",
        date: "2026-11-04",
        notes: "",
        exercises: [
          { name: "Squat", sets: 3, reps: 8, weightKg: 1_001 },
        ],
      }),
    );
    const result = await database.query<{ count: number }>(
      "SELECT COUNT(*)::INTEGER AS count FROM workout_sessions WHERE user_id = $1",
      [userId],
    );
    assert.equal(result.rows[0]?.count, 0);
  } finally {
    await close();
  }
});

test("authentication rate limits are shared across server instances", async () => {
  const { pool, close } = await createTestDatabase();
  const previousSecret = process.env.AUTH_RATE_LIMIT_SECRET;
  process.env.AUTH_RATE_LIMIT_SECRET = "test-rate-limit-secret-with-32-chars";
  try {
    const policy = {
      scope: "login",
      limit: 2,
      windowSeconds: 60,
    } as const;
    const request = new NextRequest("https://gym.test/api/auth/login", {
      headers: { "x-vercel-forwarded-for": "203.0.113.1" },
    });
    const attempts: RateLimitResult[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      attempts.push(
        await checkAuthRateLimit(request, policy, "alice", pool),
      );
    }

    assert.deepEqual(
      attempts.map((attempt) => attempt.allowed),
      [true, true, false],
    );

    const otherProcessRequest = new NextRequest(
      "https://gym.test/api/auth/login",
      { headers: { "x-vercel-forwarded-for": "203.0.113.2" } },
    );
    const sameAccount = await checkAuthRateLimit(
      otherProcessRequest,
      policy,
      "alice",
      pool,
    );
    assert.equal(sameAccount.allowed, false);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.AUTH_RATE_LIMIT_SECRET;
    } else {
      process.env.AUTH_RATE_LIMIT_SECRET = previousSecret;
    }
    await close();
  }
});

test("session payload validation rejects invalid dates and unsafe ranges", () => {
  const valid = parseWorkoutSession({
    title: "Leg day",
    date: "2026-11-04",
    notes: "Controlled tempo",
    exercises: [{ name: "Squat", sets: 4, reps: 6, weightKg: 80.25 }],
  });
  assert.equal(valid.ok, true);

  const invalidDate = parseWorkoutSession({
    title: "Leg day",
    date: "2026-02-30",
    exercises: [],
  });
  assert.equal(invalidDate.ok, false);

  const invalidWeight = parseWorkoutSession({
    title: "Leg day",
    date: "2026-11-04",
    exercises: [{ name: "Squat", sets: 4, reps: 6, weightKg: 1001 }],
  });
  assert.equal(invalidWeight.ok, false);
});

test("username input pattern compiles in Unicode sets mode and matches server rules", () => {
  const pattern = new RegExp(`^(?:${USERNAME_HTML_PATTERN})$`, "v");
  assert.equal(pattern.test("gym_user-1"), true);
  assert.equal(pattern.test("ab"), false);
  assert.equal(pattern.test("not valid"), false);
  assert.equal(pattern.test(`${"a".repeat(33)}`), false);
});
