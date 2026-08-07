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

// Pool sizing: min > 0 keeps a warm connection alive so a serverless instance
// reused across invocations doesn't pay connect latency on every cold start
// (see docs/ai-assistant-implementation.md §7, item 5). Overridable per
// environment since the right size depends on the App Service/Functions
// plan's concurrency, not something worth a redeploy to tune.
const DEFAULT_POOL_MIN = 1;
const DEFAULT_POOL_MAX = 8;
const POOL_IDLE_TIMEOUT_MS = 30_000;

function envPoolSize(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolvePoolConfig(): { min: number; max: number; idleTimeoutMillis: number } {
  const min = envPoolSize("AZURE_SQL_POOL_MIN", DEFAULT_POOL_MIN);
  const max = envPoolSize("AZURE_SQL_POOL_MAX", DEFAULT_POOL_MAX);
  // A misconfigured override (min > max) would make every connect() past the
  // first fail pool validation inside the driver — clamp rather than let a
  // bad env var take the database down.
  return { min, max: Math.max(min, max), idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS };
}

/** Trims a driver error down to a client-safe one-line message; logs the full detail. */
function describeSqlError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown database error.";
}

/**
 * mssql/tedious error names and socket-level codes that mean the network or
 * connection dropped rather than the query itself being wrong — worth
 * reporting as SqlUnavailableError (503, safe to retry or fall back) instead
 * of a bare 500 that looks like a code bug.
 */
const TRANSIENT_ERROR_NAMES = new Set(["ConnectionError", "TransactionError"]);
const TRANSIENT_ERROR_CODES = new Set([
  "ETIMEOUT",
  "ESOCKET",
  "ECONNCLOSED",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
]);

function isTransientDriverError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  return TRANSIENT_ERROR_NAMES.has(err.name) || (typeof code === "string" && TRANSIENT_ERROR_CODES.has(code));
}

// One pool per process. Cached as the promise (not the resolved pool) so
// concurrent requests made before the first connect() resolves all await the
// same in-flight promise rather than each racing to open their own — safe
// because nothing awaits between the `if (poolPromise)` check below and the
// assignment that follows it, so no request can observe the module between
// those two statements.
let poolPromise: Promise<MssqlPool> | null = null;

async function getPool(connectionString: string): Promise<MssqlPool> {
  if (poolPromise) return poolPromise;
  // Kept in a variable so nothing can fold this into a static specifier and
  // reintroduce the build-time resolution (see requireOptional above).
  const specifier = "mssql";
  poolPromise = (async () => {
    let driver: MssqlModule;
    try {
      driver = requireOptional(specifier) as MssqlModule;
    } catch {
      throw new SqlUnavailableError(
        "A connection string is set but the `mssql` driver is not installed. Run `npm i mssql`, or unset the connection string to serve the bundled sample data."
      );
    }
    try {
      return await driver.connect({
        connectionString,
        requestTimeout: STATEMENT_TIMEOUT_MS,
        connectionTimeout: 15_000,
        pool: resolvePoolConfig(),
        options: { encrypt: true, trustServerCertificate: false },
      });
    } catch (err) {
      const message = describeSqlError(err);
      console.error("sql-client: connect() failed —", message, err);
      throw new SqlUnavailableError(`Could not connect to Azure SQL: ${message}`);
    }
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

  // getPool already logs and wraps a failed connect as SqlUnavailableError —
  // nothing to add here, just let it propagate.
  const pool = await getPool(connectionString);

  try {
    const request = pool.request();
    for (const parameter of built.parameters) request.input(parameter.name, parameter.value);

    const { recordsets } = await request.query(`${built.sql};\n${built.countSql};`);
    const rows = recordsets[0] ?? [];
    const totalRow = recordsets[1]?.[0];
    const total = totalRow ? Number(totalRow.totalMatchingRows ?? 0) : rows.length;

    return { rows, totalMatchingRows: Number.isFinite(total) ? total : rows.length };
  } catch (err) {
    const message = describeSqlError(err);
    console.error("sql-client: query execution failed —", message, err);
    // A dropped connection or timed-out request mid-query is retryable —
    // surface it the same way a failed connect is, so callers (the query
    // engine, the assistant route) treat it as "unavailable", not "buggy".
    // Anything else (a genuine query-time error the builder didn't catch)
    // still becomes a clean Error rather than a raw driver exception, so it
    // reaches the caller's generic catch-all as a normal 500 with a readable
    // message instead of an unhandled rejection.
    if (isTransientDriverError(err)) {
      throw new SqlUnavailableError(`Azure SQL connection dropped mid-query: ${message}`);
    }
    throw new Error(`Azure SQL query failed: ${message}`);
  }
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
