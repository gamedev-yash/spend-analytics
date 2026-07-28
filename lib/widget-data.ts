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
