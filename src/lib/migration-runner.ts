import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type MigrationQueryResult<Row> = {
  rows: Row[];
};

export type MigrationClient = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<MigrationQueryResult<Row>>;
};

const MIGRATIONS_TABLE = "gym_trainer_migrations";

export async function applyMigrations(
  client: MigrationClient,
  migrationsDirectory: string,
): Promise<string[]> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
       version TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
  const files = (await readdir(migrationsDirectory))
    .filter((file) => /^\d{4}_[a-z0-9_-]+\.sql$/.test(file))
    .sort();
  const appliedVersions: string[] = [];

  for (const file of files) {
    const version = file.slice(0, file.length - ".sql".length);
    const existing = await client.query<{ version: string }>(
      `SELECT version FROM ${MIGRATIONS_TABLE} WHERE version = $1`,
      [version],
    );
    if (existing.rows.length > 0) {
      continue;
    }

    const migrationSql = await readFile(join(migrationsDirectory, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(migrationSql);
      await client.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (version) VALUES ($1)`,
        [version],
      );
      await client.query("COMMIT");
      appliedVersions.push(version);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          JSON.stringify({
            event: "database_migration_rollback_failed",
            errorName:
              rollbackError instanceof Error
                ? rollbackError.name
                : "UnknownError",
          }),
        );
      }
      throw error;
    }
  }

  return appliedVersions;
}
