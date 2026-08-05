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

import { createRequire } from "node:module";
import { join } from "node:path";
import { STATEMENT_TIMEOUT_MS, type BuiltQuery } from "@/lib/server/query-builder";

/**
 * Loader for the optional driver.
 *
 * `await import("mssql")` cannot be used here: the bundler constant-folds the
 * specifier, tries to resolve it at build time, and emits a "Module not found"
 * warning on every compile when the driver is not installed — even though the
 * import only ever runs inside a try/catch. A require obtained from
 * `node:module` is opaque to that analysis, so resolution happens where it
 * belongs: at runtime, on the machine that has (or has not) installed it.
 *
 * Resolved from the project root rather than `import.meta.url`, which is not
 * dependable across Next's server output formats.
 */
const requireOptional = createRequire(join(process.cwd(), "next.config.ts"));

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

/**
 * The writable connection string, for the few application tables the app itself
 * inserts into (dbo.snapshots). Never falls back to the read-only credential —
 * a db_datareader login would fail the INSERT with a confusing permission error
 * instead of this actionable one.
 */
export function resolveWritableConnectionString(): string | null {
  return process.env.AZURE_SQL_CONNECTION_STRING || null;
}

// One pool per connection string (read-only and writable credentials each get
// their own). Cached as the promise so concurrent requests share a single
// connect() rather than racing to open their own.
const poolPromises = new Map<string, Promise<MssqlPool>>();

async function getPool(connectionString: string): Promise<MssqlPool> {
  const cached = poolPromises.get(connectionString);
  if (cached) return cached;
  // Kept in a variable so nothing can fold this into a static specifier and
  // reintroduce the build-time resolution (see requireOptional above).
  const specifier = "mssql";
  const created = (async () => {
    let driver: MssqlModule;
    try {
      driver = requireOptional(specifier) as MssqlModule;
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
    poolPromises.delete(connectionString);
    throw err;
  });
  poolPromises.set(connectionString, created);
  return created;
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

export interface SqlParameter {
  /** Placeholder name without the leading @, e.g. "id". */
  name: string;
  value: unknown;
}

/**
 * Run one parameterized statement outside the query-builder path — the
 * application tables (dbo.snapshots), not the star schema. The SQL text must be
 * a literal owned by server code; only values travel as parameters.
 *
 * `write: true` uses the writable credential (AZURE_SQL_CONNECTION_STRING) and
 * refuses to run without it, so an INSERT never lands on the db_datareader
 * login just because it happened to be the one configured.
 */
export async function executeSql(
  sql: string,
  parameters: SqlParameter[],
  options: { write?: boolean } = {}
): Promise<Record<string, unknown>[][]> {
  const connectionString = options.write
    ? resolveWritableConnectionString()
    : resolveConnectionString();
  if (!connectionString) {
    throw new SqlUnavailableError(
      options.write
        ? "Saving needs the writable Azure SQL credential. Set AZURE_SQL_CONNECTION_STRING in the server environment."
        : "No Azure SQL connection string is configured."
    );
  }

  const pool = await getPool(connectionString);
  const request = pool.request();
  for (const parameter of parameters) request.input(parameter.name, parameter.value);
  const { recordsets } = await request.query(sql);
  return recordsets;
}

/** Drop every pool — for tests and graceful shutdown. */
export async function closePool(): Promise<void> {
  const pending = [...poolPromises.values()];
  poolPromises.clear();
  for (const promise of pending) {
    const pool = await promise.catch(() => null);
    await pool?.close();
  }
}
