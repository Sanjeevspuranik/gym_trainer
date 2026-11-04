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
  deleteUserSession,
  listUserSessions,
  setUserSessionCompletion,
} from "../src/lib/session-store";
import { importSqliteDatabase } from "../scripts/sqlite-importer";
import { createUserWithSession } from "../src/lib/auth-store";
import {
  parseWorkoutSession,
  USERNAME_HTML_PATTERN,
} from "../src/lib/validation";

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
    assert.deepEqual(result.rows.map((row) => row.version), ["0001_initial"]);
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
    assert.equal(
      await setUserSessionCompletion(pool, bobId, aliceSession.id, true),
      null,
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
    assert.equal(completed?.completed, true);
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
