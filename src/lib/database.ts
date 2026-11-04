import { Pool } from "@neondatabase/serverless";

export type PgQueryable = Pick<Pool, "query">;

export type PgClient = PgQueryable & {
  release(error?: Error | boolean): void;
};

export type PgPool = PgQueryable & {
  connect(): Promise<PgClient>;
};

type DatabaseCache = typeof globalThis & {
  __gymTrainerPool?: Pool;
  __gymTrainerDatabaseUrl?: string;
};

const globalDatabase = globalThis as DatabaseCache;

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
  }
  return databaseUrl;
}

export function getDatabase(): Pool {
  const databaseUrl = getDatabaseUrl();
  if (
    globalDatabase.__gymTrainerPool &&
    globalDatabase.__gymTrainerDatabaseUrl === databaseUrl
  ) {
    return globalDatabase.__gymTrainerPool;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
  pool.on("error", (error: Error) => {
    console.error(
      JSON.stringify({
        event: "database_pool_error",
        errorName: error.name,
      }),
    );
  });

  globalDatabase.__gymTrainerPool = pool;
  globalDatabase.__gymTrainerDatabaseUrl = databaseUrl;
  return pool;
}
