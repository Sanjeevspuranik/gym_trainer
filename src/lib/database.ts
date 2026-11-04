import { neon } from "@neondatabase/serverless";

export type PgQueryResult<Row> = {
  rows: Row[];
  rowCount: number | null;
};

export type PgQueryable = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    queryText: string,
    values?: unknown[],
  ): Promise<PgQueryResult<Row>>;
};

export type PgClient = PgQueryable & {
  release(error?: Error | boolean): void;
};

export type PgPool = PgQueryable & {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
};

type DatabaseCache = typeof globalThis & {
  __gymTrainerHttpDatabase?: PgQueryable;
  __gymTrainerHttpDatabaseUrl?: string;
};

const globalDatabase = globalThis as DatabaseCache;

function validateDatabaseUrl(
  value: string | undefined,
  variableName: string,
): string {
  if (!value) {
    throw new Error(`${variableName} is required to connect to PostgreSQL.`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL connection URL.`);
  }
  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error(`${variableName} must use the postgres or postgresql protocol.`);
  }
  return value;
}

export function getDatabaseUrl(): string {
  return validateDatabaseUrl(process.env.DATABASE_URL, "DATABASE_URL");
}

export function getMigrationDatabaseUrl(): string {
  return validateDatabaseUrl(
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    "DATABASE_URL_UNPOOLED or DATABASE_URL",
  );
}

export function getDatabase(): PgQueryable {
  const databaseUrl = getDatabaseUrl();
  if (
    globalDatabase.__gymTrainerHttpDatabase &&
    globalDatabase.__gymTrainerHttpDatabaseUrl === databaseUrl
  ) {
    return globalDatabase.__gymTrainerHttpDatabase;
  }

  const sql = neon(databaseUrl, { fullResults: true });
  const database: PgQueryable = {
    async query<Row extends Record<string, unknown>>(
      queryText: string,
      values?: unknown[],
    ): Promise<PgQueryResult<Row>> {
      const result = await sql.query(queryText, values);
      return {
        rows: result.rows as Row[],
        rowCount: result.rowCount,
      };
    },
  };
  globalDatabase.__gymTrainerHttpDatabase = database;
  globalDatabase.__gymTrainerHttpDatabaseUrl = databaseUrl;
  return database;
}
