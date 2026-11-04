import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
import { getDatabase } from "../src/lib/database";
import { importSqliteDatabase } from "./sqlite-importer";

loadEnvConfig(process.cwd());

function sourcePathFromArguments(): string {
  const sourceIndex = process.argv.indexOf("--source");
  if (sourceIndex >= 0) {
    const sourcePath = process.argv[sourceIndex + 1];
    if (!sourcePath || sourcePath.startsWith("--")) {
      throw new Error("Pass a path after --source.");
    }
    return resolve(sourcePath);
  }
  return resolve(
    process.env.GYM_TRAINER_SQLITE_SOURCE ?? "data/gym_trainer.sqlite3",
  );
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error(
      "Import is disabled by default. Review the destination, then rerun with --confirm.",
    );
  }

  const sourcePath = sourcePathFromArguments();
  const database = getDatabase();
  try {
    const counts = await importSqliteDatabase(sourcePath, database);
    console.log(
      `Imported ${counts.accounts} accounts, ${counts.sessions} workouts, and ${counts.exercises} exercises.`,
    );
    console.log(
      "The SQLite source was opened read-only. Sign in again to create new hosted login sessions.",
    );
  } finally {
    await database.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("The SQLite import failed.");
  }
  process.exitCode = 1;
});
