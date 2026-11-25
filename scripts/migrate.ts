import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { resolve } from "node:path";
import { getMigrationDatabaseUrl } from "../src/lib/database";
import { applyMigrations } from "../src/lib/migration-runner";
import { seedDefaultRoutinesForExistingUsers } from "../src/lib/routine-store";

loadEnvConfig(process.cwd());

const MIGRATION_LOCK_ID = 732_194_181;

function safeErrorDetails(error: unknown): {
  errorName: string;
  errorCode?: string;
} {
  let current: unknown = error;
  let errorName = "UnknownError";
  let errorCode: string | undefined;

  for (let depth = 0; depth < 4; depth += 1) {
    if (current instanceof Error) {
      if (errorName === "UnknownError") {
        errorName = current.name;
      }
      const currentError = current as Error & { code?: unknown };
      if (!errorCode && typeof currentError.code === "string") {
        errorCode = currentError.code;
      }
    } else if (typeof current === "object" && current !== null) {
      if (
        errorName === "UnknownError" &&
        "name" in current &&
        typeof current.name === "string"
      ) {
        errorName = current.name;
      }
      if (
        !errorCode &&
        "code" in current &&
        typeof current.code === "string"
      ) {
        errorCode = current.code;
      }
    }

    if (typeof current !== "object" || current === null) {
      break;
    }
    if ("sourceError" in current) {
      current = current.sourceError;
    } else if ("cause" in current) {
      current = current.cause;
    } else if ("error" in current) {
      current = current.error;
    } else {
      break;
    }
  }

  return { errorName, errorCode };
}

function logMigrationFailure(event: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event,
      ...safeErrorDetails(error),
    }),
  );
}

async function main(): Promise<void> {
  const database = new Pool({
    connectionString: getMigrationDatabaseUrl(),
    max: 1,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
  let client: PoolClient | undefined;
  let lockAcquired = false;
  try {
    client = await database.connect();
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    lockAcquired = true;
    const migrationsDirectory = resolve(process.cwd(), "db", "migrations");
    const applied = await applyMigrations(client, migrationsDirectory);
    if (applied.length === 0) {
      console.log("Database schema is up to date.");
    } else {
      console.log(`Applied database migrations: ${applied.join(", ")}`);
    }
    const seededRoutineCount = await seedDefaultRoutinesForExistingUsers(client);
    if (seededRoutineCount > 0) {
      console.log(
        `Seeded the default weekly routine for ${seededRoutineCount} existing account(s).`,
      );
    }
  } catch (error) {
    logMigrationFailure("database_migration_failed", error);
    process.exitCode = 1;
  } finally {
    if (lockAcquired && client) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [
          MIGRATION_LOCK_ID,
        ]);
      } catch {
        logMigrationFailure(
          "database_migration_unlock_failed",
          new Error("Unable to release migration lock."),
        );
      }
    }
    client?.release();
    try {
      await database.end();
    } catch (error) {
      logMigrationFailure("database_migration_pool_close_failed", error);
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  logMigrationFailure("database_migration_failed", error);
  process.exitCode = 1;
});
