// Aggregation layer behind custom-dashboard widgets: turns a WidgetConfig +
// dataset rows into either a single KPI scalar or a sorted series of
// {label, value} points. Date groupings bucket by month so trends stay
// readable regardless of row grain.

import { toNumber } from "@/lib/infer";
import type { Dataset, DatasetRow } from "@/context/DatasetsContext";
import type { Aggregation, WidgetConfig } from "@/types/custom-dashboard";

export interface SeriesPoint {
  label: string;
  value: number;
  /** Rows behind this point — surfaced in the table widget. */
  count: number;
}

const EMPTY_LABEL = "(No value)";

function cellLabel(value: unknown): string {
  if (value === null || value === undefined) return EMPTY_LABEL;
  const s = String(value).trim();
  return s === "" ? EMPTY_LABEL : s;
}

/** "2025-03-14" / "14/03/2025" → "2025-03"; non-dates pass through unchanged. */
function monthBucket(raw: string): string {
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString().slice(0, 7);
}

interface Accumulator {
  sum: number;
  count: number;
  distinct: Set<string>;
}

function newAccumulator(): Accumulator {
  return { sum: 0, count: 0, distinct: new Set<string>() };
}

function accumulate(acc: Accumulator, row: DatasetRow, measureColumn: string | undefined): void {
  acc.count += 1;
  if (!measureColumn) return;
  const raw = row[measureColumn];
  const numeric = toNumber(raw);
  if (numeric !== null) acc.sum += numeric;
  if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
    acc.distinct.add(String(raw).trim());
  }
}

function finalize(acc: Accumulator, aggregation: Aggregation): number {
  switch (aggregation) {
    case "sum":
      return acc.sum;
    case "avg":
      return acc.count > 0 ? acc.sum / acc.count : 0;
    case "count":
      return acc.count;
    case "distinct":
      return acc.distinct.size;
  }
}

/** Column ids that actually exist on this dataset (guards deleted/renamed columns). */
function resolveColumn(dataset: Dataset, columnId: string | undefined): string | undefined {
  if (!columnId) return undefined;
  return dataset.columns.some((c) => c.id === columnId) ? columnId : undefined;
}

/** Single scalar for a KPI tile. */
export function computeKpiValue(dataset: Dataset, config: WidgetConfig): number {
  const aggregation = config.aggregation ?? "sum";
  const measure = resolveColumn(dataset, config.yAxisColumn);
  const acc = newAccumulator();
  for (const row of dataset.rows) accumulate(acc, row, measure);
  return finalize(acc, aggregation);
}

/**
 * Grouped series for bar/line/pie/donut/table widgets.
 *
 * Date groupings bucket by month and sort chronologically (a trend must read
 * left-to-right in time); every other grouping sorts by value descending so
 * the Top-N `limit` keeps the largest contributors.
 */
export function computeSeries(dataset: Dataset, config: WidgetConfig): SeriesPoint[] {
  const groupColumn = resolveColumn(dataset, config.xAxisColumn);
  if (!groupColumn) return [];

  const aggregation = config.aggregation ?? "sum";
  const measure = resolveColumn(dataset, config.yAxisColumn);
  const isDate = dataset.columns.find((c) => c.id === groupColumn)?.type === "date";

  const groups = new Map<string, Accumulator>();
  for (const row of dataset.rows) {
    const raw = cellLabel(row[groupColumn]);
    const key = isDate && raw !== EMPTY_LABEL ? monthBucket(raw) : raw;
    let acc = groups.get(key);
    if (!acc) {
      acc = newAccumulator();
      groups.set(key, acc);
    }
    accumulate(acc, row, measure);
  }

  const points: SeriesPoint[] = Array.from(groups.entries()).map(([label, acc]) => ({
    label,
    value: finalize(acc, aggregation),
    count: acc.count,
  }));

  if (isDate) {
    points.sort((a, b) => a.label.localeCompare(b.label));
    // For trends the limit means "most recent N", not "largest N".
    return config.limit && points.length > config.limit ? points.slice(-config.limit) : points;
  }

  points.sort((a, b) => b.value - a.value);
  return config.limit ? points.slice(0, config.limit) : points;
}

/** True when the widget has everything it needs to render real data. */
export function isWidgetRenderable(dataset: Dataset, config: WidgetConfig): boolean {
  const aggregation = config.aggregation ?? "sum";
  const needsMeasure = aggregation !== "count";
  const hasMeasure = resolveColumn(dataset, config.yAxisColumn) !== undefined;
  if (needsMeasure && !hasMeasure) return false;
  if (config.chartType === "kpi") return true;
  return resolveColumn(dataset, config.xAxisColumn) !== undefined;
}

/** Human explanation of what a widget is missing, for the empty-state note. */
export function widgetIssue(dataset: Dataset, config: WidgetConfig): string | null {
  if (isWidgetRenderable(dataset, config)) return null;
  const missing: string[] = [];
  if (config.chartType !== "kpi" && !resolveColumn(dataset, config.xAxisColumn)) {
    missing.push(config.xAxisColumn ? `grouping column "${config.xAxisColumn}"` : "a grouping column");
  }
  if ((config.aggregation ?? "sum") !== "count" && !resolveColumn(dataset, config.yAxisColumn)) {
    missing.push(config.yAxisColumn ? `metric column "${config.yAxisColumn}"` : "a metric column");
  }
  return `This widget needs ${missing.join(" and ")}. Edit it to pick columns from this dataset.`;
}

/** Compact display form for aggregated values (₹ scale-aware, count-aware). */
export function formatWidgetValue(value: number, aggregation: Aggregation, columnName?: string): string {
  if (aggregation === "count" || aggregation === "distinct") {
    return Math.round(value).toLocaleString("en-IN");
  }
  const isMoney = columnName ? /(spend|amount|value|cost|price|revenue|savings|inr|usd|netwr|wrbtr)/i.test(columnName) : false;
  const abs = Math.abs(value);
  if (isMoney) {
    if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr`;
    if (abs >= 1_00_000) return `₹${(value / 1_00_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
    return `₹${Math.round(value).toLocaleString("en-IN")}`;
  }
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}M`;
  if (abs >= 10_000) return `${(value / 1_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}K`;
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Axis-tick form — always compact, never currency-prefixed. */
export function formatAxisValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${(value / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value * 100) / 100);
}
