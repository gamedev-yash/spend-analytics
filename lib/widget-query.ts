// The translation layer between a widget's vocabulary (x-axis, y-axis, Top-N)
// and the provider contract. Everything that knows how a WidgetConfig becomes a
// QueryPayload — and how the returned rows become plottable points — lives here,
// so swapping the provider underneath never reaches a component.

import { toNumber } from "@/lib/infer";
import { resolveColumn, type SeriesPoint } from "@/lib/widget-data";
import {
  COUNT_ALL,
  type QueryFilter,
  type QueryMeasure,
  type QueryPayload,
  type QueryResult,
} from "@/types/data-provider";
import type { WidgetConfig } from "@/types/custom-dashboard";
import type { Dataset } from "@/types/dataset";

/** Result aliases the widgets read back. */
export const VALUE_ALIAS = "value";
export const ROW_COUNT_ALIAS = "count";

/** Label for the group of rows whose grouping column was empty. */
export const EMPTY_LABEL = "(No value)";

function isDateDimension(dataset: Dataset, columnId: string): boolean {
  return dataset.columns.find((c) => c.id === columnId)?.type === "date";
}

/**
 * Payload for one widget, or null when the config can't be answered — a missing
 * measure or grouping column, i.e. exactly the cases isWidgetRenderable rejects.
 */
export function buildWidgetPayload(
  dataset: Dataset,
  config: WidgetConfig,
  filters: QueryFilter[]
): QueryPayload | null {
  const aggregation = config.aggregation ?? "sum";
  // 'count' counts rows and ignores the measure column, so it asks for COUNT(*).
  const measureField =
    aggregation === "count" ? COUNT_ALL : resolveColumn(dataset, config.yAxisColumn);
  if (!measureField) return null;

  const measures: QueryMeasure[] = [
    { field: measureField, aggregation, alias: VALUE_ALIAS },
    // Rows behind each point, shown in the table widget and every tooltip.
    { field: COUNT_ALL, aggregation: "count", alias: ROW_COUNT_ALIAS },
  ];

  if (config.chartType === "kpi") {
    return { datasetId: dataset.id, measures, filters };
  }

  const dimension = resolveColumn(dataset, config.xAxisColumn);
  if (!dimension) return null;

  return {
    datasetId: dataset.id,
    dimensions: [dimension],
    measures,
    filters,
    // A trend has to read left-to-right in time, so on a date grouping the limit
    // means "most recent N": ask for the newest buckets first and flip them back
    // to chronological order in seriesFromResult. Every other grouping sorts by
    // value so the limit keeps the largest contributors.
    sort: isDateDimension(dataset, dimension)
      ? { field: dimension, direction: "desc" }
      : { field: VALUE_ALIAS, direction: "desc" },
    limit: config.limit,
  };
}

/** Count of rows matching `filters` — no grouping, one row out. */
export function buildRowCountPayload(datasetId: string, filters: QueryFilter[] = []): QueryPayload {
  return {
    datasetId,
    measures: [{ field: COUNT_ALL, aggregation: "count", alias: ROW_COUNT_ALIAS }],
    filters,
  };
}

/** Every distinct value of one column, ascending — the option list for a filter control. */
export function buildDistinctValuesPayload(datasetId: string, field: string): QueryPayload {
  return { datasetId, dimensions: [field], sort: { field, direction: "asc" } };
}

export function dimensionLabel(value: unknown): string {
  if (value === null || value === undefined) return EMPTY_LABEL;
  const text = String(value).trim();
  return text === "" ? EMPTY_LABEL : text;
}

export function seriesFromResult(result: QueryResult, payload: QueryPayload): SeriesPoint[] {
  const dimension = payload.dimensions?.[0];
  if (!dimension) return [];
  const points = result.rows.map((row) => ({
    label: dimensionLabel(row[dimension]),
    value: toNumber(row[VALUE_ALIAS]) ?? 0,
    count: toNumber(row[ROW_COUNT_ALIAS]) ?? 0,
  }));
  // Newest-first came back from a date grouping (see buildWidgetPayload) — put
  // the trend back in chronological order.
  if (payload.sort?.field === dimension && payload.sort.direction === "desc") points.reverse();
  return points;
}

export function kpiValueFromResult(result: QueryResult): number {
  return toNumber(result.rows[0]?.[VALUE_ALIAS]) ?? 0;
}

export function rowCountFromResult(result: QueryResult): number {
  return result.totalMatchingRows ?? toNumber(result.rows[0]?.[ROW_COUNT_ALIAS]) ?? 0;
}

/** Distinct values from a grouped result, dropping the empty group. */
export function distinctValuesFromResult(result: QueryResult, payload: QueryPayload): string[] {
  const dimension = payload.dimensions?.[0];
  if (!dimension) return [];
  return result.rows
    .map((row) => row[dimension])
    .filter((value): value is string => typeof value === "string" && value !== "");
}
