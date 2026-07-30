"use client";

// Natural-language → WidgetConfig, plus the deterministic chart-permutation
// engine behind the assistant's "Quick Chart Permutations" tab and the
// dashboard's AI suggestion chips.
//
// The two halves are deliberately different: permutations are computed
// locally from column relationships (instant, free, always available), while
// prompt parsing calls /api/assistant so Claude can resolve free text like
// "top 10 vendors by net spend" against the real column names. Whatever the
// model returns is re-validated here against the dataset before the caller
// sees it — a widget naming a column that doesn't exist never escapes.

import type { ColumnMeta } from "@/lib/infer";
import { newId } from "@/lib/custom-dashboards-store";
import { normalizeKey } from "@/lib/dataset-rows";
import {
  needsMeasure,
  needsSeriesColumn,
  needsXAxis,
  type Aggregation,
  type ChartType,
  type WidgetConfig,
} from "@/types/custom-dashboard";
import type {
  AssistantRequest,
  AssistantResponse,
  ColumnStats,
  DatasetContext,
} from "@/types/assistant";
import type { Dataset } from "@/context/DatasetsContext";
import { toNumber } from "@/lib/infer";

// ---------------------------------------------------------------------------
// Column classification (shared by both halves)
// ---------------------------------------------------------------------------

const MONEY_RE = /(spend|amount|value|cost|price|revenue|savings|netwr|wrbtr|rmwwr|dmbtr|inr|usd|total)/i;
const AVG_PREFERRED_RE = /(percent|pct|rate|ratio|share|score|margin|avg|average|mean|days|age|duration|cycle)/i;
const ID_LIKE_RE = /(^|_)(id|no|nr|num|number|code|key|zip|pin|year|gjahr|belnr|ebeln|ebelp|lifnr|matnr)($|_)/i;
const NAME_LIKE_RE = /(name|description|category|group|type|segment|vendor|supplier|plant|region|country|status|action)/i;

/** Grouping dimensions stay readable between these distinct-value bounds. */
const MIN_GROUP_CARDINALITY = 2;
const MAX_GROUP_CARDINALITY = 200;
/** Pies/donuts stay legible only with few slices. */
const MAX_SLICE_CARDINALITY = 12;
const DEFAULT_LIMIT = 10;

/** Numeric columns that are real measures — identifiers excluded. */
function measureColumns(columns: ColumnMeta[]): ColumnMeta[] {
  return columns
    .filter((c) => c.type === "number" && !ID_LIKE_RE.test(c.name))
    .sort((a, b) => Number(MONEY_RE.test(b.name)) - Number(MONEY_RE.test(a.name)));
}

/** Category columns usable as a grouping axis, best first. */
function dimensionColumns(columns: ColumnMeta[]): ColumnMeta[] {
  return columns
    .filter(
      (c) =>
        c.type === "category" &&
        c.distinctCount >= MIN_GROUP_CARDINALITY &&
        c.distinctCount <= MAX_GROUP_CARDINALITY
    )
    .sort(
      (a, b) =>
        Number(NAME_LIKE_RE.test(b.name)) - Number(NAME_LIKE_RE.test(a.name)) ||
        a.distinctCount - b.distinctCount
    );
}

function dateColumns(columns: ColumnMeta[]): ColumnMeta[] {
  return columns.filter((c) => c.type === "date");
}

/** Rates and durations average; money and countable quantities sum. */
function defaultAggregation(column: ColumnMeta): Aggregation {
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

// ---------------------------------------------------------------------------
// Permutation engine
// ---------------------------------------------------------------------------

/**
 * Top natural chart permutations for a dataset, derived from column
 * relationships: Category × Measure → bar + donut, Date × Measure → line,
 * Measure → KPI, Category → count bar. Returns at most 6, best first, each a
 * ready-to-add WidgetConfig with its own id.
 */
export function generatePermutationSuggestions(columns: ColumnMeta[]): WidgetConfig[] {
  const measures = measureColumns(columns);
  const dimensions = dimensionColumns(columns);
  const dates = dateColumns(columns);

  const measure = measures[0];
  const dimension = dimensions[0];
  const date = dates[0];
  const widgets: Omit<WidgetConfig, "id">[] = [];

  // Category × Measure — the two highest-signal procurement views.
  if (dimension && measure) {
    const aggregation = defaultAggregation(measure);
    widgets.push({
      title: `Top ${DEFAULT_LIMIT} ${titleCase(dimension.name)} by ${titleCase(measure.name)}`,
      chartType: "bar",
      xAxisColumn: dimension.id,
      yAxisColumn: measure.id,
      aggregation,
      limit: DEFAULT_LIMIT,
      gridSpan: 1,
    });
    const sliceDim =
      dimensions.find((d) => d.distinctCount <= MAX_SLICE_CARDINALITY) ??
      (dimension.distinctCount <= MAX_SLICE_CARDINALITY ? dimension : undefined);
    if (sliceDim) {
      widgets.push({
        title: `${titleCase(measure.name)} by ${titleCase(sliceDim.name)}`,
        chartType: "donut",
        xAxisColumn: sliceDim.id,
        yAxisColumn: measure.id,
        aggregation,
        limit: MAX_SLICE_CARDINALITY,
        gridSpan: 1,
      });
    }
  }

  // Two dimensions × Measure — a stacked breakdown, when a low-cardinality
  // second dimension exists to stack by (date preferred as the outer axis,
  // same as the plain trend below, so a stack reads as "trend, split by").
  const seriesCandidate = dimensions.find(
    (d) => d.distinctCount <= MAX_SLICE_CARDINALITY && d.id !== dimension?.id
  );
  const stackOuter = date ?? dimensions.find((d) => d.id !== seriesCandidate?.id);
  if (measure && seriesCandidate && stackOuter && stackOuter.id !== seriesCandidate.id) {
    widgets.push({
      title: `${titleCase(measure.name)} by ${titleCase(stackOuter.name)}, Split by ${titleCase(seriesCandidate.name)}`,
      chartType: "stackedBar",
      xAxisColumn: stackOuter.id,
      yAxisColumn: measure.id,
      seriesColumn: seriesCandidate.id,
      aggregation: defaultAggregation(measure),
      limit: date && stackOuter.id === date.id ? undefined : DEFAULT_LIMIT,
      gridSpan: 2,
    });
  }

  // Date × Measure — the trend.
  if (date) {
    widgets.push({
      title: `${titleCase(measure?.name ?? "Records")} Trend`,
      chartType: "line",
      xAxisColumn: date.id,
      yAxisColumn: measure?.id,
      aggregation: measure ? defaultAggregation(measure) : "count",
      gridSpan: 2,
    });
  }

  // Headline KPIs for the top measures.
  for (const m of measures.slice(0, 2)) {
    const aggregation = defaultAggregation(m);
    widgets.push({
      title: `${aggregation === "avg" ? "Avg" : "Total"} ${titleCase(m.name)}`,
      chartType: "kpi",
      yAxisColumn: m.id,
      aggregation,
      gridSpan: 1,
    });
  }

  // Second dimension by record count — concentration/fragmentation view.
  const secondDimension = dimensions.find((d) => d.id !== dimension?.id);
  if (secondDimension) {
    widgets.push({
      title: `Record Count by ${titleCase(secondDimension.name)}`,
      chartType: "bar",
      xAxisColumn: secondDimension.id,
      aggregation: "count",
      limit: DEFAULT_LIMIT,
      gridSpan: 1,
    });
  }

  // Degenerate datasets still get something useful.
  if (widgets.length === 0) {
    widgets.push({ title: "Total Records", chartType: "kpi", aggregation: "count", gridSpan: 1 });
    if (dimension) {
      widgets.push({
        title: `${titleCase(dimension.name)} Detail`,
        chartType: "table",
        xAxisColumn: dimension.id,
        aggregation: "count",
        limit: 25,
        gridSpan: 2,
      });
    }
  }

  return widgets.slice(0, 6).map((w) => ({ id: newId("w"), ...w }));
}

// ---------------------------------------------------------------------------
// Dataset context for the API (columns + summary stats, never raw rows)
// ---------------------------------------------------------------------------

/** Distinct category values shown to the model as examples. */
const SAMPLE_VALUE_COUNT = 4;
/**
 * Above this cardinality a column is an identifier, not a dimension — sample
 * values from it (invoice numbers, row ids) teach the model nothing and just
 * push real cell values into the request. Cardinality alone is the signal.
 */
const MAX_SAMPLE_CARDINALITY = 50;
/** Stats scan is capped so a huge upload doesn't stall the UI thread. */
const STATS_SAMPLE_ROWS = 20_000;

/** Summary statistics per column: numeric min/max/sum/avg, category samples. */
export function buildColumnStats(dataset: Dataset): ColumnStats[] {
  const rows = dataset.rows.length > STATS_SAMPLE_ROWS ? dataset.rows.slice(0, STATS_SAMPLE_ROWS) : dataset.rows;
  return dataset.columns.map((column) => {
    if (column.type === "number") {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let sum = 0;
      let count = 0;
      for (const row of rows) {
        const value = toNumber(row[column.id]);
        if (value === null) continue;
        if (value < min) min = value;
        if (value > max) max = value;
        sum += value;
        count += 1;
      }
      if (count === 0) return { id: column.id };
      const round = (n: number) => Math.round(n * 100) / 100;
      return { id: column.id, min: round(min), max: round(max), sum: round(sum), avg: round(sum / count) };
    }

    // Identifier-like columns contribute no useful examples — their
    // distinctCount (already in ColumnMeta) tells the model what it needs.
    if (column.distinctCount > MAX_SAMPLE_CARDINALITY) return { id: column.id };

    const samples: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const raw = row[column.id];
      if (raw === null || raw === undefined) continue;
      const s = String(raw).trim();
      if (s === "" || seen.has(s)) continue;
      seen.add(s);
      samples.push(s.length > 40 ? `${s.slice(0, 39)}…` : s);
      if (samples.length >= SAMPLE_VALUE_COUNT) break;
    }
    return { id: column.id, sampleValues: samples };
  });
}

export function buildDatasetContext(dataset: Dataset): DatasetContext {
  return {
    name: dataset.name,
    rowCount: dataset.rows.length,
    columns: dataset.columns,
    stats: buildColumnStats(dataset),
  };
}

// ---------------------------------------------------------------------------
// Validation — nothing reaches a dashboard without matching real columns
// ---------------------------------------------------------------------------

/** Resolve a model-supplied column reference to a real column id, or undefined. */
function resolveColumn(columns: ColumnMeta[], candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  const exact = columns.find((c) => c.id === candidate);
  if (exact) return exact.id;
  const normalized = normalizeKey(candidate);
  return columns.find((c) => normalizeKey(c.id) === normalized)?.id;
}

/**
 * Coerce a model-proposed widget into one this dataset can actually render:
 * column references are resolved (tolerating case/underscore drift), and a
 * widget still missing something required is repaired from the dataset's own
 * best candidates rather than rejected outright.
 */
export function validateWidgetAgainstColumns(
  proposed: Omit<WidgetConfig, "id">,
  columns: ColumnMeta[]
): WidgetConfig | null {
  let chartType: ChartType = proposed.chartType;
  let aggregation: Aggregation = proposed.aggregation ?? "sum";

  let yAxisColumn = resolveColumn(columns, proposed.yAxisColumn);
  let xAxisColumn = resolveColumn(columns, proposed.xAxisColumn);

  // A measure is required unless we're counting rows.
  if (needsMeasure(aggregation)) {
    if (!yAxisColumn) {
      const fallback = measureColumns(columns)[0];
      if (fallback) yAxisColumn = fallback.id;
      else aggregation = "count";
    }
  } else {
    // count ignores the measure entirely — drop a stale reference.
    yAxisColumn = undefined;
  }

  if (needsXAxis(chartType)) {
    if (!xAxisColumn) {
      const preferDate = chartType === "line";
      const fallback = preferDate
        ? dateColumns(columns)[0] ?? dimensionColumns(columns)[0]
        : dimensionColumns(columns)[0] ?? dateColumns(columns)[0];
      if (!fallback) return null; // nothing groupable — can't render this form
      xAxisColumn = fallback.id;
    }
  } else {
    xAxisColumn = undefined;
  }

  // stackedBar needs a second, distinct grouping column. If the model didn't
  // name one or named the same column twice, degrade to a plain bar rather
  // than guessing a second dimension the request never asked for.
  let seriesColumn: string | undefined;
  if (needsSeriesColumn(chartType)) {
    const resolved = resolveColumn(columns, proposed.seriesColumn);
    if (resolved && resolved !== xAxisColumn) {
      seriesColumn = resolved;
    } else {
      const fallback = dimensionColumns(columns).find((d) => d.id !== xAxisColumn);
      if (fallback) seriesColumn = fallback.id;
      else chartType = "bar"; // no second dimension available anywhere — can't stack
    }
  }

  return {
    id: newId("w"),
    title: proposed.title?.trim() || "New widget",
    chartType,
    xAxisColumn,
    yAxisColumn,
    seriesColumn,
    aggregation,
    limit: proposed.limit && proposed.limit > 0 ? Math.floor(proposed.limit) : undefined,
    gridSpan: proposed.gridSpan === 2 ? 2 : chartType === "stackedBar" ? 2 : 1,
  };
}

// ---------------------------------------------------------------------------
// Natural-language parsing
// ---------------------------------------------------------------------------

export class AssistantError extends Error {}

async function callAssistant(payload: AssistantRequest): Promise<AssistantResponse> {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Assistant request failed (${response.status}).`;
    throw new AssistantError(message);
  }
  return data as AssistantResponse;
}

/**
 * A warehouse dataset carries no rows in the browser, so summary statistics are
 * meaningless for it. Naming it instead switches the route into warehouse mode,
 * where the model composes a real query against the metadata registry.
 */
function registryDatasetId(dataset: Dataset | null): string | null {
  return dataset?.source === "server" ? dataset.id : null;
}

/** Chat turn: prose answer, plus a widget when the user asked for one. */
export async function askAssistant(
  message: string,
  dataset: Dataset | null,
  history: AssistantRequest["history"] = [],
  otherDashboards: AssistantRequest["otherDashboards"] = []
): Promise<AssistantResponse & { validatedWidget: WidgetConfig | null }> {
  const serverDatasetId = registryDatasetId(dataset);
  const response = await callAssistant({
    mode: "chat",
    message,
    history,
    // A warehouse dataset gets named, not summarised — its rows aren't here to
    // compute statistics from. An uploaded CSV still sends its column context.
    dataset: serverDatasetId || !dataset ? null : buildDatasetContext(dataset),
    registryDatasetId: serverDatasetId,
    // Redirect targets are independent of where the data lives, so they travel
    // in either mode.
    otherDashboards,
  });
  const validatedWidget =
    response.widget && dataset
      ? validateWidgetAgainstColumns(response.widget, dataset.columns)
      : null;
  return { ...response, validatedWidget };
}

/**
 * Parse a prompt like "Show me a bar chart of top 10 vendors by net spend"
 * into a validated WidgetConfig. Returns null when the model couldn't produce
 * one that this dataset supports; throws AssistantError on transport/API
 * failures so the caller can surface the real reason.
 */
export async function parseUserPromptToWidget(
  prompt: string,
  columns: ColumnMeta[],
  dataset?: Dataset | null
): Promise<WidgetConfig | null> {
  const serverDatasetId = registryDatasetId(dataset ?? null);
  const context: DatasetContext = dataset
    ? buildDatasetContext(dataset)
    : { name: "active dataset", rowCount: 0, columns, stats: [] };

  const response = await callAssistant({
    mode: "parse",
    message: prompt,
    dataset: serverDatasetId ? null : context,
    registryDatasetId: serverDatasetId,
  });
  if (!response.widget) return null;
  return validateWidgetAgainstColumns(response.widget, columns);
}
