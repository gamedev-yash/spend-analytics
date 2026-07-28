// Auto-layout engine for custom dashboards. Reads a dataset's inferred
// ColumnMeta and proposes a balanced starter grid (4–6 widgets) so a new
// dashboard renders useful insight immediately, with no manual setup:
//
//   • 2–3 KPI tiles from the most "measure-like" numeric columns
//   • Bar (Top N) + Donut when a groupable category column exists
//   • Line trend when a date column exists
//   • A detail table as the full-width closer
//
// Ranking is name-driven (spend/amount/value beat quantity beat counters)
// with cardinality guards so identifier columns never become chart axes.

import type { ColumnMeta } from "@/lib/infer";
import type { Dataset } from "@/context/DatasetsContext";
import type { WidgetConfig } from "@/types/custom-dashboard";
import { newId } from "@/lib/custom-dashboards-store";

/** Money-ish measures make the best headline KPIs and bar/donut values. */
const MONEY_RE = /(spend|amount|value|cost|price|revenue|savings|netwr|wrbtr|rmwwr|dmbtr|inr|usd|total)/i;
/** Secondary measures — real quantities, but weaker headlines than money. */
const QUANTITY_RE = /(qty|quantity|menge|count|volume|units|days)/i;
/** Numeric columns that are really identifiers or codes, never measures. */
const ID_LIKE_RE = /(^|_)(id|no|nr|num|number|code|key|zip|pin|year|gjahr|belnr|ebeln|ebelp|lifnr|matnr)($|_)/i;
/**
 * Columns where averaging is the meaningful default and summing is not:
 * rates and scores, plus durations (total "paid days" across invoices is a
 * nonsense figure; mean paid days is the actual KPI).
 */
const AVG_PREFERRED_RE = /(percent|pct|rate|ratio|share|score|margin|avg|average|mean|days|age|duration|cycle)/i;

/** Grouping columns are useful between these distinct-value bounds. */
const MIN_GROUP_CARDINALITY = 2;
const MAX_GROUP_CARDINALITY = 200;
/** Donuts stay readable only with few slices. */
const MAX_DONUT_CARDINALITY = 12;
/** Top-N cap applied to grouped bar charts. */
const DEFAULT_LIMIT = 10;

function score(column: ColumnMeta, patterns: Array<[RegExp, number]>): number {
  let total = 0;
  for (const [re, weight] of patterns) if (re.test(column.name)) total += weight;
  return total;
}

/** Numeric columns ranked as measures — money first, identifiers excluded. */
function rankMeasures(columns: ColumnMeta[]): ColumnMeta[] {
  return columns
    .filter((c) => c.type === "number" && !ID_LIKE_RE.test(c.name))
    .map((c) => ({
      column: c,
      rank: score(c, [
        [MONEY_RE, 100],
        [QUANTITY_RE, 40],
        [AVG_PREFERRED_RE, 10],
      ]),
    }))
    .sort((a, b) => b.rank - a.rank)
    .map((entry) => entry.column);
}

/** Category columns ranked as grouping dimensions — mid-cardinality first. */
function rankDimensions(columns: ColumnMeta[]): ColumnMeta[] {
  return columns
    .filter(
      (c) =>
        c.type === "category" &&
        c.distinctCount >= MIN_GROUP_CARDINALITY &&
        c.distinctCount <= MAX_GROUP_CARDINALITY
    )
    .map((c) => ({
      column: c,
      // Prefer name-like dimensions over raw codes, then lower cardinality.
      rank:
        score(c, [
          [/(name|description|category|group|type|segment|vendor|supplier|plant|region|country|status|action)/i, 50],
        ]) -
        c.distinctCount / 100,
    }))
    .sort((a, b) => b.rank - a.rank)
    .map((entry) => entry.column);
}

function rankDates(columns: ColumnMeta[]): ColumnMeta[] {
  return columns
    .filter((c) => c.type === "date")
    .sort((a, b) => score(b, [[/(invoice|po|order|doc|posting)/i, 10]]) - score(a, [[/(invoice|po|order|doc|posting)/i, 10]]));
}

/** Rates, scores, and durations average; money and countable quantities sum. */
function defaultAggregation(column: ColumnMeta): "sum" | "avg" {
  return AVG_PREFERRED_RE.test(column.name) ? "avg" : "sum";
}

function titleCase(columnName: string): string {
  return columnName
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function widget(config: Omit<WidgetConfig, "id">): WidgetConfig {
  return { id: newId("w"), ...config };
}

/**
 * Propose a starter widget layout for a dataset. Returns 4–6 widgets when the
 * columns allow it, degrading gracefully (a row-count KPI plus a table) for
 * datasets with no usable measures or dimensions.
 */
export function suggestWidgets(columns: ColumnMeta[]): WidgetConfig[] {
  const measures = rankMeasures(columns);
  const dimensions = rankDimensions(columns);
  const dates = rankDates(columns);

  const widgets: WidgetConfig[] = [];

  // --- KPI row: up to 3 measures, or a row count when there are none --------
  for (const measure of measures.slice(0, 3)) {
    const aggregation = defaultAggregation(measure);
    widgets.push(
      widget({
        title: `${aggregation === "avg" ? "Avg" : "Total"} ${titleCase(measure.name)}`,
        chartType: "kpi",
        yAxisColumn: measure.id,
        aggregation,
        gridSpan: 1,
      })
    );
  }
  if (widgets.length === 0) {
    widgets.push(
      widget({ title: "Total Records", chartType: "kpi", aggregation: "count", gridSpan: 1 })
    );
  }

  const primaryMeasure = measures[0];
  const primaryDimension = dimensions[0];

  // --- Bar: Top N by the primary measure ------------------------------------
  if (primaryDimension) {
    widgets.push(
      widget({
        title: primaryMeasure
          ? `Top ${DEFAULT_LIMIT} ${titleCase(primaryDimension.name)} by ${titleCase(primaryMeasure.name)}`
          : `Top ${DEFAULT_LIMIT} ${titleCase(primaryDimension.name)} by Record Count`,
        chartType: "bar",
        xAxisColumn: primaryDimension.id,
        yAxisColumn: primaryMeasure?.id,
        aggregation: primaryMeasure ? defaultAggregation(primaryMeasure) : "count",
        limit: DEFAULT_LIMIT,
        gridSpan: 1,
      })
    );
  }

  // --- Donut: composition on a low-cardinality dimension --------------------
  const donutDimension =
    dimensions.find((d) => d.distinctCount <= MAX_DONUT_CARDINALITY && d.id !== primaryDimension?.id) ??
    (primaryDimension && primaryDimension.distinctCount <= MAX_DONUT_CARDINALITY
      ? primaryDimension
      : undefined);
  if (donutDimension) {
    widgets.push(
      widget({
        title: `${titleCase(primaryMeasure?.name ?? "Records")} by ${titleCase(donutDimension.name)}`,
        chartType: "donut",
        xAxisColumn: donutDimension.id,
        yAxisColumn: primaryMeasure?.id,
        aggregation: primaryMeasure ? defaultAggregation(primaryMeasure) : "count",
        limit: MAX_DONUT_CARDINALITY,
        gridSpan: 1,
      })
    );
  }

  // --- Line: trend over the primary date column -----------------------------
  if (dates[0]) {
    widgets.push(
      widget({
        title: `${titleCase(primaryMeasure?.name ?? "Records")} Trend`,
        chartType: "line",
        xAxisColumn: dates[0].id,
        yAxisColumn: primaryMeasure?.id,
        aggregation: primaryMeasure ? defaultAggregation(primaryMeasure) : "count",
        gridSpan: 2,
      })
    );
  }

  // --- Table: full-width detail closer, if we still have room ---------------
  if (widgets.length < 6 && (primaryDimension || measures.length > 0)) {
    widgets.push(
      widget({
        title: primaryDimension
          ? `${titleCase(primaryDimension.name)} Detail`
          : "Dataset Detail",
        chartType: "table",
        xAxisColumn: primaryDimension?.id,
        yAxisColumn: primaryMeasure?.id,
        aggregation: primaryMeasure ? defaultAggregation(primaryMeasure) : "count",
        limit: 25,
        gridSpan: 2,
      })
    );
  }

  return widgets.slice(0, 6);
}

/** Convenience wrapper for a whole dataset. */
export function suggestWidgetsForDataset(dataset: Dataset): WidgetConfig[] {
  return suggestWidgets(dataset.columns);
}

/** A sensible blank widget for the "Add Widget" drawer, pre-filled from the data. */
export function defaultWidgetForDataset(dataset: Dataset): Omit<WidgetConfig, "id"> {
  const measures = rankMeasures(dataset.columns);
  const dimensions = rankDimensions(dataset.columns);
  return {
    title: "New widget",
    chartType: "bar",
    xAxisColumn: dimensions[0]?.id,
    yAxisColumn: measures[0]?.id,
    aggregation: measures[0] ? defaultAggregation(measures[0]) : "count",
    limit: DEFAULT_LIMIT,
    gridSpan: 1,
  };
}
