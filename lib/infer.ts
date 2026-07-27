// Column type inference for uploaded CSV rows. Every column is classified as
// 'number' | 'date' | 'category' by sampling its non-empty values:
//   date     — >80% parse as a date string (ISO 8601, YYYY-MM-DD, MM/DD/YYYY) or Date
//   number   — >80% parse as a finite number (after stripping ₹/$/,/% noise)
//   category — everything else (free text, codes, discrete identifiers)

export type ColumnType = "number" | "date" | "category";

export interface ColumnMeta {
  id: string;
  name: string;
  type: ColumnType;
  distinctCount: number;
}

/** Share of non-empty values that must match for a type to win. */
const TYPE_THRESHOLD = 0.8;

/** Classification samples at most this many rows; distinctCount still scans all rows. */
const SAMPLE_SIZE = 2000;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/** Numeric coercion tolerant of currency/percent formatting ("₹1,200", "12%", " 42 "). */
export function toNumber(value: unknown): number | null {
  if (isEmpty(value)) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return null;
  const s = String(value).replace(/[₹$€£,%\s]/g, "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Date detection per spec: ISO 8601, YYYY-MM-DD (or YYYY/MM), MM/DD/YYYY (or DD-MM-YYYY). */
export function looksLikeDate(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== "string") return false;
  const s = value.trim();
  // ISO 8601 with optional time part: 2025-01-31 / 2025-01-31T10:00:00Z
  if (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?([T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) {
    return !Number.isNaN(Date.parse(s.replace(/\//g, "-")));
  }
  // MM/DD/YYYY, DD/MM/YYYY, MM-DD-YY and friends
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(s)) return true;
  return false;
}

function classify(values: unknown[]): ColumnType {
  const nonEmpty = values.filter((v) => !isEmpty(v));
  if (nonEmpty.length === 0) return "category";
  let numeric = 0;
  let dateish = 0;
  for (const v of nonEmpty) {
    if (looksLikeDate(v)) dateish += 1;
    else if (toNumber(v) !== null) numeric += 1;
  }
  if (dateish / nonEmpty.length > TYPE_THRESHOLD) return "date";
  if (numeric / nonEmpty.length > TYPE_THRESHOLD) return "number";
  return "category";
}

/**
 * Inspect raw parsed CSV rows (as produced by Papa.parse with header: true)
 * and infer per-column metadata. Column order follows the first row's keys,
 * with any keys that only appear in later rows appended afterwards.
 */
export function inferColumns(rows: Record<string, unknown>[]): ColumnMeta[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        ids.push(key);
      }
    }
  }

  const sample = rows.length > SAMPLE_SIZE ? rows.slice(0, SAMPLE_SIZE) : rows;

  return ids.map((id) => {
    const distinct = new Set<unknown>();
    for (const row of rows) {
      const v = row[id];
      if (!isEmpty(v)) distinct.add(typeof v === "object" ? String(v) : v);
    }
    return {
      id,
      name: id,
      type: classify(sample.map((row) => row[id])),
      distinctCount: distinct.size,
    };
  });
}
