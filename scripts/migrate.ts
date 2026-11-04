import { loadEnvConfig } from "@next/env";
import { Pool } from "@neondatabase/serverless";
import { resolve } from "node:path";
import { getMigrationDatabaseUrl } from "../src/lib/database";
import { applyMigrations } from "../src/lib/migration-runner";

loadEnvConfig(process.cwd());

const MIGRATION_LOCK_ID = 732_194_181;

async function main(): Promise<void> {
  const database = new Pool({
    connectionString: getMigrationDatabaseUrl(),
    max: 1,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
  const client = await database.connect();
  let lockAcquired = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    lockAcquired = true;
    const migrationsDirectory = resolve(process.cwd(), "db", "migrations");
    const applied = await applyMigrations(client, migrationsDirectory);
    if (applied.length === 0) {
      console.log("Database schema is up to date.");
    } else {
      console.log(`Applied database migrations: ${applied.join(", ")}`);
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "database_migration_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    process.exitCode = 1;
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [
          MIGRATION_LOCK_ID,
        ]);
      } catch {
        console.error(
          JSON.stringify({ event: "database_migration_unlock_failed" }),
        );
      }
    }
    client.release();
    await database.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "database_migration_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
});
