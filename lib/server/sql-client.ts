import "server-only";

// Azure SQL execution for built queries.
//
// SECURITY: the connection must authenticate as a reader. The builder only ever
// emits SELECTs, but that is a property of our code, not a permission — the
// enforceable control is the login. Point AZURE_SQL_READONLY_CONNECTION_STRING
// at a user granted db_datareader and nothing else; add
// `ApplicationIntent=ReadOnly` to route to a geo-replica where one exists.
// AZURE_SQL_CONNECTION_STRING (the seed script's writable credential) is only a
// fallback, and using it is logged.

import { STATEMENT_TIMEOUT_MS, type BuiltQuery } from "@/lib/server/query-builder";

/** Minimal surface of the `mssql` driver this module uses. */
interface MssqlRequest {
  input(name: string, value: unknown): MssqlRequest;
  query(sql: string): Promise<{ recordsets: Record<string, unknown>[][] }>;
}

interface MssqlPool {
  request(): MssqlRequest;
  close(): Promise<void>;
}

interface MssqlModule {
  connect(config: unknown): Promise<MssqlPool>;
}

export class SqlUnavailableError extends Error {
  readonly status = 503;

  constructor(message: string) {
    super(message);
    this.name = "SqlUnavailableError";
  }
}

/** The read-only connection string, or null when the API should serve samples. */
export function resolveConnectionString(): string | null {
  const readOnly = process.env.AZURE_SQL_READONLY_CONNECTION_STRING;
  if (readOnly) return readOnly;
  const writable = process.env.AZURE_SQL_CONNECTION_STRING;
  if (writable) {
    console.warn(
      "sql-client: using AZURE_SQL_CONNECTION_STRING. Set AZURE_SQL_READONLY_CONNECTION_STRING to a db_datareader login for the query API."
    );
    return writable;
  }
  return null;
}

export function isDatabaseConfigured(): boolean {
  return resolveConnectionString() !== null;
}

// One pool per process. Cached as the promise so concurrent requests share a
// single connect() rather than racing to open their own.
let poolPromise: Promise<MssqlPool> | null = null;

async function getPool(connectionString: string): Promise<MssqlPool> {
  if (poolPromise) return poolPromise;
  // Resolved at runtime: `mssql` is an optional peer, so a missing driver must
  // not break the sample-data path (nor `tsc`).
  const specifier = "mssql";
  poolPromise = (async () => {
    let driver: MssqlModule;
    try {
      driver = (await import(specifier)) as MssqlModule;
    } catch {
      throw new SqlUnavailableError(
        "A connection string is set but the `mssql` driver is not installed. Run `npm i mssql`, or unset the connection string to serve the bundled sample data."
      );
    }
    return driver.connect({
      connectionString,
      requestTimeout: STATEMENT_TIMEOUT_MS,
      connectionTimeout: 15_000,
      pool: { min: 0, max: 8, idleTimeoutMillis: 30_000 },
      options: { encrypt: true, trustServerCertificate: false },
    });
  })().catch((err: unknown) => {
    // Never cache a failed connect, or the process can never recover.
    poolPromise = null;
    throw err;
  });
  return poolPromise;
}

export interface SqlQueryOutcome {
  rows: Record<string, unknown>[];
  totalMatchingRows: number;
}

/**
 * Run a built query. The grouped SELECT and its COUNT go as one batch, so both
 * see the same snapshot and cost one round trip.
 */
export async function executeQuery(built: BuiltQuery): Promise<SqlQueryOutcome> {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new SqlUnavailableError("No Azure SQL connection string is configured.");
  }

  const pool = await getPool(connectionString);
  const request = pool.request();
  for (const parameter of built.parameters) request.input(parameter.name, parameter.value);

  const { recordsets } = await request.query(`${built.sql};\n${built.countSql};`);
  const rows = recordsets[0] ?? [];
  const totalRow = recordsets[1]?.[0];
  const total = totalRow ? Number(totalRow.totalMatchingRows ?? 0) : rows.length;

  return { rows, totalMatchingRows: Number.isFinite(total) ? total : rows.length };
}

/** Drop the pool — for tests and graceful shutdown. */
export async function closePool(): Promise<void> {
  const pending = poolPromise;
  poolPromise = null;
  if (pending) {
    const pool = await pending.catch(() => null);
    await pool?.close();
  }
}
