import Database from "better-sqlite3";
import type { PgPool } from "../src/lib/database";

type SqliteUser = {
  id: number;
  username: string;
  password_salt: string;
  password_hash: string;
  created_at: string;
};

type SqliteSession = {
  id: number;
  user_id: number;
  title: string;
  session_date: string;
  notes: string;
  completed_at: string | null;
  created_at: string;
};

type SqliteExercise = {
  id: number;
  session_id: number;
  name: string;
  sets: number;
  reps: number;
  weight_kg: number;
  sort_order: number;
};

type DestinationCounts = {
  user_count: number;
  session_count: number;
  exercise_count: number;
};

export class SqliteImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqliteImportError";
  }
}

function readLegacyData(sourcePath: string): {
  users: SqliteUser[];
  sessions: SqliteSession[];
  exercises: SqliteExercise[];
} {
  const source = new Database(sourcePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const users = source
      .prepare(
        `SELECT id, username, password_salt, password_hash, created_at
         FROM users ORDER BY id`,
      )
      .all() as SqliteUser[];
    const sessions = source
      .prepare(
        `SELECT id, user_id, title, session_date, notes, completed_at, created_at
         FROM workout_sessions ORDER BY id`,
      )
      .all() as SqliteSession[];
    const exercises = source
      .prepare(
        `SELECT id, session_id, name, sets, reps, weight_kg, sort_order
         FROM session_exercises ORDER BY id`,
      )
      .all() as SqliteExercise[];
    return { users, sessions, exercises };
  } finally {
    source.close();
  }
}

export async function importSqliteDatabase(
  sourcePath: string,
  database: PgPool,
): Promise<{ accounts: number; sessions: number; exercises: number }> {
  const legacyData = readLegacyData(sourcePath);
  const client = await database.connect();

  try {
    const schema = await client.query<{ migration_table: string | null }>(
      "SELECT to_regclass('public.gym_trainer_migrations') AS migration_table",
    );
    if (!schema.rows[0]?.migration_table) {
      throw new SqliteImportError(
        "Apply the Postgres migrations before importing SQLite data.",
      );
    }

    const migration = await client.query<{ version: string }>(
      "SELECT version FROM gym_trainer_migrations WHERE version = $1",
      ["0001_initial"],
    );
    if (migration.rows.length === 0) {
      throw new SqliteImportError(
        "The initial Postgres migration has not been applied.",
      );
    }

    const destinationCounts = await client.query<DestinationCounts>(
      `SELECT
         (SELECT COUNT(*)::INTEGER FROM users) AS user_count,
         (SELECT COUNT(*)::INTEGER FROM workout_sessions) AS session_count,
         (SELECT COUNT(*)::INTEGER FROM session_exercises) AS exercise_count`,
    );
    const counts = destinationCounts.rows[0];
    if (
      !counts ||
      counts.user_count > 0 ||
      counts.session_count > 0 ||
      counts.exercise_count > 0
    ) {
      throw new SqliteImportError(
        "The destination database is not empty. Import only into a fresh Postgres database.",
      );
    }

    await client.query("BEGIN");
    try {
      for (const user of legacyData.users) {
        await client.query(
          `INSERT INTO users
             (id, username, password_salt, password_hash, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            user.id,
            user.username.toLowerCase(),
            user.password_salt,
            user.password_hash,
            user.created_at,
          ],
        );
      }

      for (const session of legacyData.sessions) {
        await client.query(
          `INSERT INTO workout_sessions
             (id, user_id, title, session_date, notes, completed_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            session.id,
            session.user_id,
            session.title,
            session.session_date,
            session.notes,
            session.completed_at,
            session.created_at,
          ],
        );
      }

      for (const exercise of legacyData.exercises) {
        await client.query(
          `INSERT INTO session_exercises
             (id, session_id, name, sets, reps, weight_kg, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            exercise.id,
            exercise.session_id,
            exercise.name,
            exercise.sets,
            exercise.reps,
            exercise.weight_kg,
            exercise.sort_order,
          ],
        );
      }

      await client.query(
        `SELECT setval(
           pg_get_serial_sequence('users', 'id'),
           COALESCE(MAX(id), 1),
           COUNT(*) > 0
         ) FROM users`,
      );
      await client.query(
        `SELECT setval(
           pg_get_serial_sequence('workout_sessions', 'id'),
           COALESCE(MAX(id), 1),
           COUNT(*) > 0
         ) FROM workout_sessions`,
      );
      await client.query(
        `SELECT setval(
           pg_get_serial_sequence('session_exercises', 'id'),
           COALESCE(MAX(id), 1),
           COUNT(*) > 0
         ) FROM session_exercises`,
      );

      const importedCounts = await client.query<DestinationCounts>(
        `SELECT
           (SELECT COUNT(*)::INTEGER FROM users) AS user_count,
           (SELECT COUNT(*)::INTEGER FROM workout_sessions) AS session_count,
           (SELECT COUNT(*)::INTEGER FROM session_exercises) AS exercise_count`,
      );
      const imported = importedCounts.rows[0];
      if (
        !imported ||
        imported.user_count !== legacyData.users.length ||
        imported.session_count !== legacyData.sessions.length ||
        imported.exercise_count !== legacyData.exercises.length
      ) {
        throw new SqliteImportError(
          "Imported record counts do not match the SQLite source.",
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error(
          JSON.stringify({ event: "sqlite_import_rollback_failed" }),
        );
      }
      throw error;
    }

    return {
      accounts: legacyData.users.length,
      sessions: legacyData.sessions.length,
      exercises: legacyData.exercises.length,
    };
  } finally {
    client.release();
  }
}
