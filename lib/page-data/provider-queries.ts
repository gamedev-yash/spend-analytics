// Shared plumbing for the core dashboards' provider loaders.
//
// The design in one line: push grouping to the provider, derive in JavaScript.
//
// A widget like the Pareto curve or the Strategic/Core/Tail split needs ranking
// and cumulative shares, which no single GROUP BY expresses. But it only needs
// them over ~160 supplier aggregates, not 10,000 PO lines. So every loader here
// issues a handful of grouped queries — each bounded well under the 1,000-row
// cap — and does the ranking, bucketing, and share maths on those small results.
// That keeps the heavy scan in the database and the cheap derivation where the
// existing mock-shaped code already lives.

import { COUNT_ALL, type IDataProvider, type QueryFilter, type QueryPayload } from "@/types/data-provider";

/** Warehouse datasets the core pages read. */
export const PO_ITEMS_DATASET = "fact_po_items";
export const INVOICES_DATASET = "fact_invoices";

/** Aliases the loaders read back off result rows. */
export const VALUE = "value";
export const ROWS = "rows";
export const SUPPLIERS = "suppliers";
export const PLANTS = "plants";
export const CATEGORIES = "categories";
export const DOCS = "docs";

export type ResultRow = Record<string, unknown>;

export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function toLabel(value: unknown, fallback = "(No value)"): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text === "" ? fallback : text;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** Sum a measure over result rows. */
export function sumOf(rows: ResultRow[], alias: string): number {
  return rows.reduce((total, row) => total + toNumber(row[alias]), 0);
}

export interface QueryRunner {
  run(payload: QueryPayload): Promise<ResultRow[]>;
  /** Rows matching the filters before grouping, from the last matching query. */
  runWithTotal(payload: QueryPayload): Promise<{ rows: ResultRow[]; total: number }>;
  /** Every payload issued, in order — surfaced for diagnostics and tests. */
  readonly issued: QueryPayload[];
}

/**
 * Thin wrapper that records what was asked. A loader failing halfway would leave
 * a page half-mock, so callers treat any rejection as "fall back wholesale".
 */
export function createRunner(provider: IDataProvider): QueryRunner {
  const issued: QueryPayload[] = [];
  return {
    issued,
    async run(payload) {
      issued.push(payload);
      const result = await provider.queryWidgetData(payload);
      return result.rows;
    },
    async runWithTotal(payload) {
      issued.push(payload);
      const result = await provider.queryWidgetData(payload);
      return { rows: result.rows, total: result.totalMatchingRows ?? result.rows.length };
    },
  };
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

interface GroupedQueryOptions {
  datasetId: string;
  dimensions?: string[];
  /** measure alias -> [field, aggregation] */
  measures: Record<string, [string, "sum" | "avg" | "count" | "distinct"]>;
  filters?: QueryFilter[];
  timeGrain?: "month" | "quarter" | "year";
  sortBy?: string;
  direction?: "asc" | "desc";
  limit?: number;
}

export function grouped(options: GroupedQueryOptions): QueryPayload {
  const payload: QueryPayload = {
    datasetId: options.datasetId,
    measures: Object.entries(options.measures).map(([alias, [field, aggregation]]) => ({
      field,
      aggregation,
      alias,
    })),
  };
  if (options.dimensions?.length) payload.dimensions = options.dimensions;
  if (options.filters?.length) payload.filters = options.filters;
  if (options.timeGrain) payload.timeGrain = options.timeGrain;
  if (options.sortBy) {
    payload.sort = { field: options.sortBy, direction: options.direction ?? "desc" };
  }
  if (options.limit !== undefined) payload.limit = options.limit;
  return payload;
}

/** Total row count with no grouping — the cheapest "does this dataset have data" probe. */
export function rowCountQuery(datasetId: string, filters?: QueryFilter[]): QueryPayload {
  return grouped({ datasetId, measures: { [ROWS]: [COUNT_ALL, "count"] }, filters });
}

export function inFilter(field: string, values: string[]): QueryFilter {
  return { field, operator: "in", value: values };
}

// ---------------------------------------------------------------------------
// Two-dimension results → nested maps
// ---------------------------------------------------------------------------

/**
 * Fold a two-dimension result into outer -> inner -> measure. Used wherever a
 * widget needs a breakdown inside each group (spend by supplier *and* category).
 */
export function nest(
  rows: ResultRow[],
  outerField: string,
  innerField: string,
  alias = VALUE
): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const outer = toLabel(row[outerField]);
    const inner = toLabel(row[innerField]);
    const bucket = out.get(outer) ?? {};
    bucket[inner] = (bucket[inner] ?? 0) + toNumber(row[alias]);
    out.set(outer, bucket);
  }
  return out;
}
