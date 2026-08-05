import "server-only";

// Cloud snapshots: saved dashboard view states in dbo.snapshots (db/schema.sql).
//
// Same safety model as the query engine — SQL text is a literal in this file,
// every client-supplied value is a bound parameter, and anything outside the
// validated shape is a 400 before it reaches the driver. The statement builders
// are exported separately from the executing functions so tests can pin the SQL
// and the validation without a database.

import { randomUUID } from "node:crypto";
import { executeSql, type SqlParameter } from "@/lib/server/sql-client";

/** Column caps mirror db/schema.sql. */
const NAME_MAX = 255;
const DASHBOARD_ID_MAX = 100;
const CREATED_BY_MAX = 100;
/** Serialized snapshot_data cap — NVARCHAR(MAX) takes far more, but a view state this large is a bug. */
const DATA_MAX_CHARS = 500_000;

/** Timeline page size caps. */
const DEFAULT_LIMIT = 50;
const LIMIT_MAX = 200;

export class SnapshotValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "SnapshotValidationError";
  }
}

export interface SnapshotRecord {
  id: string;
  name: string;
  dashboardId: string;
  /** ISO timestamp, from the database's DEFAULT GETDATE(). */
  createdAt: string;
  createdBy: string;
  /** The saved view state, parsed back from snapshot_data. */
  data: unknown;
}

export interface NewSnapshot {
  name: string;
  dashboardId: string;
  createdBy: string;
  /** Already serialized — what lands in snapshot_data. */
  dataJson: string;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SnapshotValidationError(`\`${field}\` must be a non-empty string.`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new SnapshotValidationError(`\`${field}\` must be at most ${max} characters, got ${text.length}.`);
  }
  return text;
}

/** Shape-validate a POST body into an insertable snapshot. Throws 400s. */
export function validateNewSnapshot(body: unknown): NewSnapshot {
  if (typeof body !== "object" || body === null) {
    throw new SnapshotValidationError("Request body must be a JSON object.");
  }
  const raw = body as Record<string, unknown>;

  const name = requireText(raw.name, "name", NAME_MAX);
  const dashboardId = requireText(raw.dashboardId, "dashboardId", DASHBOARD_ID_MAX);
  const createdBy =
    raw.createdBy === undefined || raw.createdBy === null
      ? "local-user"
      : requireText(raw.createdBy, "createdBy", CREATED_BY_MAX);

  if (raw.data === undefined || raw.data === null) {
    throw new SnapshotValidationError("`data` is required — the view state this snapshot preserves.");
  }
  let dataJson: string;
  try {
    dataJson = JSON.stringify(raw.data);
  } catch {
    throw new SnapshotValidationError("`data` must be JSON-serializable.");
  }
  if (typeof dataJson !== "string") {
    throw new SnapshotValidationError("`data` must be JSON-serializable.");
  }
  if (dataJson.length > DATA_MAX_CHARS) {
    throw new SnapshotValidationError(
      `\`data\` serializes to ${dataJson.length.toLocaleString()} characters; the limit is ${DATA_MAX_CHARS.toLocaleString()}.`
    );
  }

  return { name, dashboardId, createdBy, dataJson };
}

export interface BuiltStatement {
  sql: string;
  parameters: SqlParameter[];
}

/**
 * INSERT with OUTPUT, so the row comes back carrying the database-assigned
 * created_at — the client never has to guess the server clock.
 */
export function buildInsertStatement(snapshot: NewSnapshot, id: string): BuiltStatement {
  return {
    sql: [
      "INSERT INTO dbo.snapshots (id, name, dashboard_id, created_by, snapshot_data)",
      "OUTPUT INSERTED.id, INSERTED.name, INSERTED.dashboard_id, INSERTED.created_at, INSERTED.created_by, INSERTED.snapshot_data",
      "VALUES (@id, @name, @dashboardId, @createdBy, @data)",
    ].join("\n"),
    parameters: [
      { name: "id", value: id },
      { name: "name", value: snapshot.name },
      { name: "dashboardId", value: snapshot.dashboardId },
      { name: "createdBy", value: snapshot.createdBy },
      { name: "data", value: snapshot.dataJson },
    ],
  };
}

/** Timeline read: newest first, optionally narrowed to one dashboard. */
export function buildListStatement(dashboardId?: string, limit = DEFAULT_LIMIT): BuiltStatement {
  if (!Number.isInteger(limit) || limit < 1 || limit > LIMIT_MAX) {
    throw new SnapshotValidationError(`\`limit\` must be an integer between 1 and ${LIMIT_MAX}.`);
  }
  const parameters: SqlParameter[] = [{ name: "limit", value: limit }];
  const where: string[] = [];
  if (dashboardId !== undefined) {
    // Same cap as the column, so an over-long filter is a 400, not a scan.
    where.push("dashboard_id = @dashboardId");
    parameters.push({ name: "dashboardId", value: requireText(dashboardId, "dashboardId", DASHBOARD_ID_MAX) });
  }
  return {
    sql: [
      "SELECT TOP (@limit) id, name, dashboard_id, created_at, created_by, snapshot_data",
      "FROM dbo.snapshots",
      ...(where.length > 0 ? [`WHERE ${where.join(" AND ")}`] : []),
      "ORDER BY created_at DESC",
    ].join("\n"),
    parameters,
  };
}

function toRecord(row: Record<string, unknown>): SnapshotRecord {
  const raw = row.snapshot_data;
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      // A row written outside this API could hold non-JSON; surface it verbatim.
    }
  }
  const createdAt = row.created_at;
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    dashboardId: String(row.dashboard_id ?? ""),
    createdAt:
      createdAt instanceof Date ? createdAt.toISOString() : String(createdAt ?? ""),
    createdBy: String(row.created_by ?? ""),
    data,
  };
}

/** Insert one snapshot and return it as stored (id minted here, never trusted from the client). */
export async function createSnapshot(body: unknown): Promise<SnapshotRecord> {
  const snapshot = validateNewSnapshot(body);
  const { sql, parameters } = buildInsertStatement(snapshot, randomUUID());
  const recordsets = await executeSql(sql, parameters, { write: true });
  const row = recordsets[0]?.[0];
  if (!row) throw new Error("Insert returned no row.");
  return toRecord(row);
}

/** Newest-first snapshot list, optionally for one dashboard. */
export async function listSnapshots(dashboardId?: string, limit?: number): Promise<SnapshotRecord[]> {
  const { sql, parameters } = buildListStatement(dashboardId, limit ?? DEFAULT_LIMIT);
  const recordsets = await executeSql(sql, parameters);
  return (recordsets[0] ?? []).map(toRecord);
}
