// Display side of custom-dashboard widgets: the point shape they plot, the
// guards that decide whether a WidgetConfig can render at all, and the value
// formatters. The aggregation that produces the points now lives behind
// IDataProvider (lib/adapters/client-csv-adapter), reached via
// lib/widget-query + hooks/use-widget-query.

import type { Dataset } from "@/types/dataset";
import type { Aggregation, WidgetConfig } from "@/types/custom-dashboard";

export interface SeriesPoint {
  label: string;
  value: number;
  /** Rows behind this point — surfaced in the table widget. */
  count: number;
}

/** Column ids that actually exist on this dataset (guards deleted/renamed columns). */
export function resolveColumn(dataset: Dataset, columnId: string | undefined): string | undefined {
  if (!columnId) return undefined;
  return dataset.columns.some((c) => c.id === columnId) ? columnId : undefined;
}

/**
 * A stacked series point: one outer group holding a value per series key.
 *
 * The shape is display-side, so it lives here beside SeriesPoint. It is now
 * produced by lib/widget-query.stackedSeriesFromResult from a two-dimension
 * provider result rather than by a local pass over dataset.rows, so stacked
 * bars work against Azure SQL as well as an uploaded CSV.
 */
export interface StackedSeriesPoint {
  label: string;
  values: Record<string, number>;
  /** Sum of this point's segment values — the stack's rendered height. */
  total: number;
  count: number;
}

export interface StackedSeriesResult {
  points: StackedSeriesPoint[];
  /** Display/color order — real series ranked by contribution, "Other" last if present. */
  seriesKeys: string[];
  /**
   * True when the outer axis is a date, so points read chronologically and a
   * Top-N limit means "most recent N" rather than "largest N".
   */
  dateAxis?: boolean;
}

/**
 * Series keys beyond this count fold into a single "Other" bucket, mirroring the
 * categorical palette's own fixed-order-then-fold-to-neutral rule
 * (lib/chart-colors.ts colorForIndex folds at the same count) so a stack never
 * needs more distinguishable hues than the palette actually has.
 */
export const MAX_STACK_SERIES = 7;

export const OTHER_SERIES_KEY = "Other";

/** True when the widget has everything it needs to render real data. */
export function isWidgetRenderable(dataset: Dataset, config: WidgetConfig): boolean {
  const aggregation = config.aggregation ?? "sum";
  const needsMeasure = aggregation !== "count";
  const hasMeasure = resolveColumn(dataset, config.yAxisColumn) !== undefined;
  if (needsMeasure && !hasMeasure) return false;
  if (config.chartType === "kpi") return true;
  if (!resolveColumn(dataset, config.xAxisColumn)) return false;
  if (config.chartType === "stackedBar") {
    const series = resolveColumn(dataset, config.seriesColumn);
    return series !== undefined && series !== config.xAxisColumn;
  }
  return true;
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
  if (config.chartType === "stackedBar") {
    const series = resolveColumn(dataset, config.seriesColumn);
    if (!series) missing.push(config.seriesColumn ? `stack-by column "${config.seriesColumn}"` : "a stack-by column");
    else if (series === config.xAxisColumn) missing.push("a stack-by column different from the grouping column");
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
