// The translation layer between a widget's vocabulary (x-axis, y-axis, Top-N)
// and the provider contract. Everything that knows how a WidgetConfig becomes a
// QueryPayload — and how the returned rows become plottable points — lives here,
// so swapping the provider underneath never reaches a component.

import { toNumber } from "@/lib/infer";
import {
  MAX_STACK_SERIES,
  OTHER_SERIES_KEY,
  resolveColumn,
  type SeriesPoint,
  type StackedSeriesPoint,
  type StackedSeriesResult,
} from "@/lib/widget-data";
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

/**
 * Payload for a 'stackedBar': the outer grouping and the stack-by dimension in
 * one two-dimension query.
 *
 * The provider contract already takes `dimensions: string[]`, so a stacked
 * series needs no new capability — which is what lets stacked bars work against
 * Azure SQL rather than only over rows held in the browser.
 *
 * No `limit` goes on the payload: Top-N and the "Other" fold both apply to the
 * *outer* groups after segments are summed, so limiting the flat (group × series)
 * result would truncate segments rather than groups. `limitStackedPoints` applies
 * the cap afterwards.
 *
 * `sort` is set only on a date axis, and only as an ordering signal that survives
 * into stackedSeriesFromResult — which is how the mapper knows to read the axis
 * chronologically without needing the dataset's column metadata.
 */
export function buildStackedWidgetPayload(
  dataset: Dataset,
  config: WidgetConfig,
  filters: QueryFilter[]
): QueryPayload | null {
  const aggregation = config.aggregation ?? "sum";
  const measureField =
    aggregation === "count" ? COUNT_ALL : resolveColumn(dataset, config.yAxisColumn);
  if (!measureField) return null;

  const dimension = resolveColumn(dataset, config.xAxisColumn);
  const seriesDimension = resolveColumn(dataset, config.seriesColumn);
  if (!dimension || !seriesDimension || dimension === seriesDimension) return null;

  const payload: QueryPayload = {
    datasetId: dataset.id,
    dimensions: [dimension, seriesDimension],
    measures: [
      { field: measureField, aggregation, alias: VALUE_ALIAS },
      { field: COUNT_ALL, aggregation: "count", alias: ROW_COUNT_ALIAS },
    ],
    filters,
  };
  if (isDateDimension(dataset, dimension)) {
    payload.sort = { field: dimension, direction: "asc" };
  }
  return payload;
}

/**
 * Fold a two-dimension result into stacked points.
 *
 * Preserves the original client-side rules exactly: series keys are ranked by
 * total contribution, the top MAX_STACK_SERIES are kept and the remainder folds
 * into one "Other" bucket, absent segments are zero-filled so a missing key
 * renders as a zero-height segment rather than a gap, and a date axis orders
 * chronologically. Returns every group — `limitStackedPoints` applies Top-N.
 */
export function stackedSeriesFromResult(
  result: QueryResult,
  payload: QueryPayload
): StackedSeriesResult {
  const dimension = payload.dimensions?.[0];
  const seriesDimension = payload.dimensions?.[1];
  if (!dimension || !seriesDimension) return { points: [], seriesKeys: [] };

  // Nest by outer group, and rank series keys by their global contribution.
  const nested = new Map<string, Map<string, { value: number; count: number }>>();
  const globalRank = new Map<string, number>();
  for (const row of result.rows) {
    const groupKey = dimensionLabel(row[dimension]);
    const seriesKey = dimensionLabel(row[seriesDimension]);
    const value = toNumber(row[VALUE_ALIAS]) ?? 0;
    const count = toNumber(row[ROW_COUNT_ALIAS]) ?? 0;

    let inner = nested.get(groupKey);
    if (!inner) {
      inner = new Map<string, { value: number; count: number }>();
      nested.set(groupKey, inner);
    }
    const cell = inner.get(seriesKey);
    if (cell) {
      cell.value += value;
      cell.count += count;
    } else {
      inner.set(seriesKey, { value, count });
    }
    globalRank.set(seriesKey, (globalRank.get(seriesKey) ?? 0) + value);
  }

  const rankedKeys = [...globalRank.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  const keptKeys = rankedKeys.slice(0, MAX_STACK_SERIES);
  const keptSet = new Set(keptKeys);
  const hasOther = rankedKeys.length > keptKeys.length;
  const seriesKeys = hasOther ? [...keptKeys, OTHER_SERIES_KEY] : keptKeys;

  const points: StackedSeriesPoint[] = [...nested.entries()].map(([label, inner]) => {
    const values: Record<string, number> = {};
    let other = 0;
    let rowCount = 0;
    for (const [seriesKey, cell] of inner) {
      rowCount += cell.count;
      if (keptSet.has(seriesKey)) values[seriesKey] = (values[seriesKey] ?? 0) + cell.value;
      else other += cell.value;
    }
    if (hasOther) values[OTHER_SERIES_KEY] = other;
    const total = Object.values(values).reduce((sum, v) => sum + v, 0);
    // Zero-fill series absent from this group so every stacked Bar segment gets a
    // value at every point.
    for (const key of seriesKeys) values[key] ??= 0;
    return { label, values, total, count: rowCount };
  });

  // buildStackedWidgetPayload only sets `sort` on a date axis, so its presence is
  // the signal to read the axis chronologically rather than by contribution.
  const dateAxis = payload.sort?.field === dimension;
  if (dateAxis) points.sort((a, b) => a.label.localeCompare(b.label));
  else points.sort((a, b) => b.total - a.total);

  return { points, seriesKeys, dateAxis };
}

/**
 * Apply the widget's Top-N cap to a stacked result. On a date axis the limit
 * means "most recent N" (the tail of a chronological list); everywhere else it
 * keeps the largest contributors (the head of a list ranked by total).
 */
export function limitStackedPoints(
  stacked: StackedSeriesResult,
  limit: number | undefined
): StackedSeriesResult {
  if (!limit || stacked.points.length <= limit) return stacked;
  return {
    ...stacked,
    points: stacked.dateAxis ? stacked.points.slice(-limit) : stacked.points.slice(0, limit),
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
