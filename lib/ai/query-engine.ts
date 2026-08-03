// A small, dashboard-agnostic query engine over plain row arrays — no
// "server-only" tag, since it runs both server-side (the 4 real dashboards,
// whose rows already live in server code) and client-side (custom CSV
// dashboards, whose rows live in the browser and never get uploaded to the
// server as raw data). Every dashboard's AI assistant calls the SAME engine
// through a query_data tool instead of being handed a fixed summary — the
// model asks a question, this runs the real computation, the model only ever
// sees the (small, capped) result of that computation, never raw rows en masse.

export type QueryOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";

export interface QueryFilter {
  field: string;
  op: QueryOp;
  value: string | number | boolean | (string | number)[];
}

export type QueryAggregation = "sum" | "avg" | "count" | "min" | "max" | "distinct";

export interface QuerySpec {
  /** Which table this dashboard exposes, when it has more than one. Ignored by single-table dashboards. */
  table?: string;
  filters?: QueryFilter[];
  /** Bucket rows by this field's value before aggregating. Omit for a single overall number or a row list. */
  groupBy?: string;
  /** Field to aggregate. Omit when aggregation is "count". */
  measure?: string;
  aggregation?: QueryAggregation;
  /** Sort the grouped result by its aggregated value. Default "desc". */
  sort?: "asc" | "desc";
  /** Caps: grouped results at 50 groups, row-level results at 50 rows, regardless of what's asked. */
  limit?: number;
  /** For an ungrouped, non-aggregated request — which fields to return per row (row-level lookup/filter). */
  select?: string[];
}

export type Row = Record<string, unknown>;

const HARD_CAP = 50;

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function matchesFilter(row: Row, filter: QueryFilter): boolean {
  const actual = row[filter.field];
  switch (filter.op) {
    case "eq":
      return String(actual ?? "").toLowerCase() === String(filter.value).toLowerCase();
    case "neq":
      return String(actual ?? "").toLowerCase() !== String(filter.value).toLowerCase();
    case "contains":
      return String(actual ?? "")
        .toLowerCase()
        .includes(String(filter.value).toLowerCase());
    case "in": {
      const values = Array.isArray(filter.value) ? filter.value : [filter.value];
      return values.some((v) => String(v).toLowerCase() === String(actual ?? "").toLowerCase());
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = coerceNumber(actual);
      const b = coerceNumber(filter.value);
      if (a === null || b === null) return false;
      if (filter.op === "gt") return a > b;
      if (filter.op === "gte") return a >= b;
      if (filter.op === "lt") return a < b;
      return a <= b;
    }
    default:
      return true;
  }
}

function aggregate(rows: Row[], measure: string | undefined, kind: QueryAggregation): number {
  if (kind === "count") return rows.length;
  if (kind === "distinct") {
    if (!measure) return 0;
    return new Set(rows.map((r) => String(r[measure] ?? ""))).size;
  }
  const values = rows.map((r) => coerceNumber(measure ? r[measure] : undefined)).filter((v): v is number => v !== null);
  if (values.length === 0) return 0;
  if (kind === "sum") return values.reduce((s, v) => s + v, 0);
  if (kind === "avg") return values.reduce((s, v) => s + v, 0) / values.length;
  if (kind === "min") return Math.min(...values);
  return Math.max(...values); // "max"
}

export interface QueryResult {
  matchedRows: number;
  /** Present when groupBy was set. */
  groups?: { group: string; value: number; rowCount: number }[];
  /** Present when no groupBy and an aggregation/measure was requested. */
  value?: number;
  /** Present when no groupBy, no aggregation — a row-level lookup/filter. */
  rows?: Row[];
  truncated: boolean;
}

/** Runs a QuerySpec against one table's rows. Never throws on bad input — degrades to a safe empty-ish result. */
export function runQuery(rows: Row[], spec: QuerySpec): QueryResult {
  const filtered = (spec.filters ?? []).reduce((acc, f) => acc.filter((r) => matchesFilter(r, f)), rows);
  const limit = Math.min(Math.max(1, spec.limit ?? 20), HARD_CAP);

  if (spec.groupBy) {
    const buckets = new Map<string, Row[]>();
    for (const row of filtered) {
      const key = String(row[spec.groupBy as string] ?? "(blank)");
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
    const kind: QueryAggregation = spec.aggregation ?? (spec.measure ? "sum" : "count");
    let groups = Array.from(buckets.entries()).map(([group, bucketRows]) => ({
      group,
      value: aggregate(bucketRows, spec.measure, kind),
      rowCount: bucketRows.length,
    }));
    groups = groups.sort((a, b) => (spec.sort === "asc" ? a.value - b.value : b.value - a.value));
    const truncated = groups.length > limit;
    groups = groups.slice(0, limit);
    return { matchedRows: filtered.length, groups, truncated };
  }

  if (spec.select && spec.select.length > 0) {
    const truncated = filtered.length > limit;
    const rowsOut = filtered.slice(0, limit).map((r) => {
      const picked: Row = {};
      for (const field of spec.select!) picked[field] = r[field];
      return picked;
    });
    return { matchedRows: filtered.length, rows: rowsOut, truncated };
  }

  if (spec.aggregation) {
    return { matchedRows: filtered.length, value: aggregate(filtered, spec.measure, spec.aggregation), truncated: false };
  }

  // No groupBy, no select, no aggregation — just the count of what matched.
  return { matchedRows: filtered.length, value: filtered.length, truncated: false };
}

export interface FieldSchema {
  field: string;
  type: "number" | "string" | "boolean" | "mixed";
  /** A few distinct example values, for string/enum-like fields with modest cardinality. */
  examples?: string[];
  distinctCount?: number;
}

/**
 * Compact schema description for the system prompt — field names, inferred
 * types, and a few example values. Never the rows themselves: this is what
 * lets the model write a sensible QuerySpec without ever seeing the data.
 */
export function describeSchema(rows: Row[], sampleSize = 200): FieldSchema[] {
  if (rows.length === 0) return [];
  const sample = rows.slice(0, sampleSize);
  const fields = Object.keys(sample[0]);
  return fields.map((field) => {
    const values = sample.map((r) => r[field]).filter((v) => v !== null && v !== undefined);
    const isNumber = values.every((v) => typeof v === "number" || (typeof v === "string" && coerceNumber(v) !== null));
    const isBoolean = values.every((v) => typeof v === "boolean");
    const type: FieldSchema["type"] = isBoolean ? "boolean" : isNumber ? "number" : "string";
    const distinct = new Set(values.map((v) => String(v)));
    const schema: FieldSchema = { field, type, distinctCount: distinct.size };
    if (type === "string" && distinct.size <= 30) {
      schema.examples = Array.from(distinct).slice(0, 8);
    }
    return schema;
  });
}
