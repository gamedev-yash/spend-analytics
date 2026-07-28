// The data contract every widget reads through. A provider answers declarative
// queries — "group spend by category, top 10" — instead of handing rows to the
// UI, so the same widget renders whether the numbers were aggregated in the
// browser (lib/adapters/client-csv-adapter) or by a database.
//
// Payloads must stay JSON-serializable: a server-backed provider posts them
// over the wire verbatim.

import type { ColumnMeta } from "@/lib/infer";
import type { Dataset } from "@/types/dataset";

export type QueryAggregation = "sum" | "avg" | "count" | "distinct";

export type QueryOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";

/**
 * Measure field meaning "every row in the group", i.e. SQL `COUNT(*)`. Only
 * `count` accepts it — the other aggregations need a column to read.
 */
export const COUNT_ALL = "*";

export interface QueryMeasure {
  /** Column id to aggregate, or COUNT_ALL. */
  field: string;
  aggregation: QueryAggregation;
  /** Key this measure lands on in each result row. */
  alias: string;
}

export interface QueryFilter {
  field: string;
  operator: QueryOperator;
  /** Scalar for every operator except `in`, which takes an array. */
  value: unknown;
}

export interface QuerySort {
  /** A measure alias or a dimension field. */
  field: string;
  direction: "asc" | "desc";
}

export interface QueryPayload {
  datasetId: string;
  /**
   * Grouping columns. Empty (or omitted) collapses the whole dataset into one
   * row — how a KPI asks for its scalar. Providers bucket `date` columns to the
   * month, since they own the schema and a trend has to stay readable at any
   * row grain.
   */
  dimensions?: string[];
  measures?: QueryMeasure[];
  filters?: QueryFilter[];
  /** Applied before `limit`, so the two together express Top-N. */
  sort?: QuerySort;
  limit?: number;
}

export interface QueryResult {
  /**
   * One row per group, keyed by dimension field and measure alias. A dimension
   * is `null` when the grouped column was empty for those rows; ascending sorts
   * put those groups last.
   */
  rows: Record<string, unknown>[];
  /** Rows matching `filters` before grouping — what a KPI reports as its row count. */
  totalMatchingRows?: number;
  executionTimeMs?: number;
}

/**
 * A source of datasets and aggregates. Implementations own where the rows live
 * and how the maths is done; callers only ever see QueryResult.
 */
export interface IDataProvider {
  /** Stable identifier for diagnostics, e.g. "client-csv". */
  id: string;
  getDatasets(): Promise<Dataset[]>;
  getDatasetMetadata(datasetId: string): Promise<ColumnMeta[]>;
  queryWidgetData(payload: QueryPayload): Promise<QueryResult>;
}
