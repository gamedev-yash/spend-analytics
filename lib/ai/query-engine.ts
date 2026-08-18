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

// Every date column in these row tables (po_date, invoice_date, paid_date, ...)
// is stored as a plain "YYYY-MM-DD" string, never a Date. Number("2024-10-01")
// is NaN, so without this, every gte/lte/gt/lt filter and every min/max
// aggregation on a date field silently matched nothing, regardless of the
// actual dates — a bug that made any time-bounded question ("spend last
// quarter") return "no records" 100% of the time. Guarded by the date-shaped
// regex so an ordinary string value never gets swept up by Date.parse's
// otherwise-permissive parsing.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?$/;

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    if (ISO_DATE_RE.test(v)) {
      const t = Date.parse(v);
      if (Number.isFinite(t)) return t;
    }
    return null;
  }
  return null;
}

// The model sometimes encodes a date filter bound as a bare/quoted 8-digit
// "YYYYMMDD" integer (e.g. 20241001) instead of an ISO string — the tool
// schema's value type allows either. Compared directly against an ISO date's
// epoch-millis form (~1.7e12), an 8-digit int is nowhere close on the number
// line, so gte/lte would silently fail every row instead of falling back
// safely. Only reached once matchesFilter has confirmed the field's own
// stored value is an ISO date string — a plain numeric measure never enters
// this path, so a real 8-digit quantity is never misread as a date.
function asYyyymmdd(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const digits = String(Math.trunc(n));
  if (digits.length !== 8) return null;
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
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
      // Ground truth for "is this a date comparison" is the field's own
      // stored value, not the filter's — so whichever encoding the model
      // picked for the bound (ISO string or YYYYMMDD int), it's reinterpreted
      // to match what the real column actually is.
      const isDateField = typeof actual === "string" && ISO_DATE_RE.test(actual);
      const filterIsIsoString = typeof filter.value === "string" && ISO_DATE_RE.test(filter.value);
      const b =
        isDateField && !filterIsIsoString
          ? asYyyymmdd(filter.value) ?? coerceNumber(filter.value)
          : coerceNumber(filter.value);
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

function aggregate(rows: Row[], measure: string | undefined, kind: QueryAggregation): number | string {
  if (kind === "count") return rows.length;
  if (kind === "distinct") {
    if (!measure) return 0;
    return new Set(rows.map((r) => String(r[measure] ?? ""))).size;
  }
  if (kind === "min" || kind === "max") {
    // Compare using the coerced number (so a date column compares correctly)
    // but return the row's original value, so the model sees "2024-10-01",
    // not the epoch-millis number that comparison used internally.
    let best: { raw: unknown; num: number } | null = null;
    for (const row of rows) {
      const raw = measure ? row[measure] : undefined;
      const num = coerceNumber(raw);
      if (num === null) continue;
      if (best === null || (kind === "min" ? num < best.num : num > best.num)) best = { raw, num };
    }
    if (best === null) return 0;
    return typeof best.raw === "number" || typeof best.raw === "string" ? best.raw : best.num;
  }
  const values = rows.map((r) => coerceNumber(measure ? r[measure] : undefined)).filter((v): v is number => v !== null);
  if (values.length === 0) return 0;
  if (kind === "sum") return values.reduce((s, v) => s + v, 0);
  return values.reduce((s, v) => s + v, 0) / values.length; // "avg"
}

export interface QueryResult {
  matchedRows: number;
  /** Present when groupBy was set. value is a string when the measure is a date field (min/max). */
  groups?: { group: string; value: number | string; rowCount: number }[];
  /** Present when no groupBy and an aggregation/measure was requested. String when the measure is a date field (min/max). */
  value?: number | string;
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
    // .value may be a date string (min/max on a date field) — sort on its
    // coerced numeric form (epoch millis for a date, itself for a number)
    // rather than assuming it's already a number.
    groups = groups.sort((a, b) => {
      const av = coerceNumber(a.value) ?? 0;
      const bv = coerceNumber(b.value) ?? 0;
      return spec.sort === "asc" ? av - bv : bv - av;
    });
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
