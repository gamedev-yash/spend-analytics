import type { Aggregation, WidgetSpec } from "@/types/generated-dashboard";

// Pure aggregation engine for AI-generated dashboards: turns a WidgetSpec +
// the dataset's raw rows into renderable numbers. No React, no fetch — this
// module only does math so it's trivially reusable by whatever renders the
// charts.

/**
 * One point along a chart's grouping dimension.
 *
 * `value` and `count` always mean the same thing regardless of series
 * shape: `value` is the widget's headline number for this label (for a
 * single measure, that measure's aggregate; for multiple measures/pivot
 * values, the sum across all of them — e.g. the total-line overlay on a
 * stacked bar), and `count` is how many source rows fed this label.
 *
 * `breakdown` is always populated and carries the per-series detail behind
 * `value`: one entry per measure item (SeriesSpec 'measures') or per pivot
 * value (SeriesSpec 'pivot'), in the order they were specified. A
 * single-measure widget still gets a one-element breakdown, so consumers
 * that only care about `value` can ignore it, and stacked/grouped renderers
 * can read `breakdown` for the segments.
 */
export interface SeriesPoint {
  label: string;
  value: number;
  count: number;
  breakdown: { key: string; value: number }[];
}

// ---------------------------------------------------------------------------
// Numeric / value coercion
// ---------------------------------------------------------------------------

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

/**
 * Tolerant numeric coercion: strips currency symbols ("₹1,200" -> 1200),
 * percent signs ("12%" -> 12), thousands separators, and stray whitespace;
 * understands accounting-style negatives in parens ("(1,234.56)" -> -1234.56).
 * Returns null for anything that still isn't a finite number.
 */
function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let str = String(raw).trim();
  if (str === "") return null;

  let negative = false;
  if (/^\(.*\)$/.test(str)) {
    negative = true;
    str = str.slice(1, -1).trim();
  }

  // Keep only digits, sign, decimal point, and exponent marker — drop
  // currency symbols, letters, commas, percent signs, whitespace, etc.
  str = str.replace(/[^0-9.+\-eE]/g, "");
  if (str === "" || str === "-" || str === "+" || str === ".") return null;

  const n = Number(str);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/** Very small date sniff: only strings shaped like a date are considered,
 * so a plain numeric column never gets misread as temporal. */
function tryParseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const str = String(raw).trim();
  if (!str) return null;
  const isoLike = /^\d{4}-\d{1,2}-\d{1,2}/.test(str);
  const slashLike = /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(str);
  const dashLike = /^\d{1,2}-\d{1,2}-\d{2,4}/.test(str);
  const monthNameLike = /^[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}/.test(str);
  if (!isoLike && !slashLike && !dashLike && !monthNameLike) return null;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthBucket(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Sniffs whether `column`'s first non-empty value across `rows` looks like a
 * date. Row-data-driven and profile-independent — shared by grouping (decides
 * whether to bucket by calendar month) and by rendering (decides axis
 * orientation and layout), so both stay in agreement. */
function sniffIsTemporal(rows: Record<string, unknown>[], column: string): boolean {
  for (const row of rows) {
    const raw = row[column];
    if (isEmpty(raw)) continue;
    return tryParseDate(raw) !== null;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** Aggregate the raw cell values of one column (already sliced to a group)
 * per the requested Aggregation. Missing/empty cells are skipped, never
 * thrown on. */
function aggregateColumn(rawValues: unknown[], aggregation: Aggregation): number {
  switch (aggregation) {
    case "count":
      return rawValues.filter((v) => !isEmpty(v)).length;
    case "distinct": {
      const seen = new Set<string>();
      for (const v of rawValues) {
        if (isEmpty(v)) continue;
        seen.add(String(v).trim().toLowerCase());
      }
      return seen.size;
    }
    case "sum":
    case "avg":
    case "min":
    case "max": {
      const nums: number[] = [];
      for (const v of rawValues) {
        const n = toNumber(v);
        if (n !== null) nums.push(n);
      }
      if (nums.length === 0) return 0;
      if (aggregation === "sum") return nums.reduce((a, b) => a + b, 0);
      if (aggregation === "avg") return nums.reduce((a, b) => a + b, 0) / nums.length;
      if (aggregation === "min") return Math.min(...nums);
      return Math.max(...nums);
    }
    default:
      return 0;
  }
}

function matchesPivotValue(raw: unknown, target: string): boolean {
  if (isEmpty(raw)) return false;
  return String(raw).trim().toLowerCase() === target.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

interface GroupedRows {
  order: string[];
  groups: Map<string, Record<string, unknown>[]>;
  isTemporal: boolean;
}

/**
 * Groups rows by `dimensionColumn`. Detects "temporal" grouping from the
 * first non-empty sample value (profile-independent, per the simplest rule:
 * if it parses as a date, treat the whole column as temporal for this
 * computation) — in which case rows are bucketed by calendar month
 * ("YYYY-MM") rather than by their raw string value.
 */
function groupByDimension(rows: Record<string, unknown>[], dimensionColumn: string): GroupedRows {
  const isTemporal = sniffIsTemporal(rows, dimensionColumn);

  const groups = new Map<string, Record<string, unknown>[]>();
  const order: string[] = [];
  for (const row of rows) {
    const raw = row[dimensionColumn];
    if (isEmpty(raw)) continue;

    let key: string;
    if (isTemporal) {
      const date = tryParseDate(raw);
      if (!date) continue; // unparsable value in an otherwise-temporal column: skip
      key = monthBucket(date);
    } else {
      key = String(raw).trim();
    }

    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
      order.push(key);
    }
    bucket.push(row);
  }

  return { order, groups, isTemporal };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes chart-ready series data for any non-'kpi' widget kind. Handles
 * both SeriesSpec forms:
 *  - 'measures': one point per dimension value, breakdown = one entry per
 *    measure item, aggregated over that group's rows.
 *  - 'pivot': one point per dimension value, breakdown = one entry per
 *    `values` entry, aggregating `measure` over the rows in that group whose
 *    pivot column matches that value — this is what turns a long-format
 *    dataset into a stacked/grouped chart.
 *
 * Sorting/limiting: `sort` is honored when provided; otherwise temporal
 * dimensions default to chronological order and categorical ones to
 * value-desc. Regardless of display sort, `limit` selects most-recent-N for
 * temporal dimensions and top-N by value otherwise, per the task spec.
 */
/**
 * Whether `widget.dimension` reads as a date column, by the same ground
 * truth `computeWidgetSeries` uses to decide monthly bucketing. Renderers
 * use this — not `colSpan` — to decide axis orientation: `colSpan` can be
 * bumped to full width by DashboardGrid's gap-filling pack step for reasons
 * that have nothing to do with whether the data is a time series, so it
 * isn't a safe proxy for that decision.
 */
export function isTemporalDimension(widget: WidgetSpec, rows: Record<string, unknown>[]): boolean {
  return widget.dimension !== undefined && sniffIsTemporal(rows, widget.dimension);
}

export function computeWidgetSeries(
  widget: WidgetSpec,
  rows: Record<string, unknown>[]
): SeriesPoint[] {
  if (widget.kind === "kpi" || !widget.dimension) return [];

  const { order, groups, isTemporal } = groupByDimension(rows, widget.dimension);

  let points: SeriesPoint[] = order.map((key) => {
    const groupRows = groups.get(key)!;

    if (widget.series.type === "pivot") {
      const { dimension: pivotColumn, values, measure } = widget.series;
      const breakdown = values.map((pivotValue) => {
        const cellRows = groupRows.filter((r) => matchesPivotValue(r[pivotColumn], pivotValue));
        return {
          key: pivotValue,
          value: aggregateColumn(
            cellRows.map((r) => r[measure.column]),
            measure.aggregation
          ),
        };
      });
      const value = breakdown.reduce((sum, b) => sum + b.value, 0);
      return { label: key, value, count: groupRows.length, breakdown };
    }

    // 'measures'
    const breakdown = widget.series.items.map((item) => ({
      key: item.label || item.column,
      value: aggregateColumn(
        groupRows.map((r) => r[item.column]),
        item.aggregation
      ),
    }));
    const value = breakdown.reduce((sum, b) => sum + b.value, 0);
    return { label: key, value, count: groupRows.length, breakdown };
  });

  const limit =
    typeof widget.limit === "number" && Number.isFinite(widget.limit) && widget.limit > 0
      ? Math.floor(widget.limit)
      : points.length;

  // Selection (which points survive), independent of eventual display order.
  if (isTemporal) {
    points = [...points].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    points = points.slice(Math.max(0, points.length - limit));
  } else {
    points = [...points].sort((a, b) => b.value - a.value).slice(0, limit);
  }

  // Display order.
  const sort = widget.sort ?? (isTemporal ? "temporal" : "value-desc");
  switch (sort) {
    case "value-asc":
      points.sort((a, b) => a.value - b.value);
      break;
    case "label-asc":
      points.sort((a, b) => a.label.localeCompare(b.label));
      break;
    case "temporal":
      points.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
      break;
    case "value-desc":
    default:
      points.sort((a, b) => b.value - a.value);
      break;
  }

  return points;
}

/**
 * Computes the single headline number for a 'kpi' widget, aggregated over
 * every given row (no grouping dimension). For 'measures' series with more
 * than one item, sums each item's aggregate. For 'pivot' series, restricts to
 * rows whose pivot column matches one of `values` first (e.g. only the
 * "Total Inventory" rows of a long-format `Metric` column) and aggregates the
 * measure over just that subset — without this filter every pivoted KPI on
 * the same measure column collapses to the same grand total.
 */
export function computeKpiValue(widget: WidgetSpec, rows: Record<string, unknown>[]): number {
  if (widget.series.type === "pivot") {
    const { dimension: pivotColumn, values, measure } = widget.series;
    const matchingRows = rows.filter((r) =>
      values.some((pivotValue) => matchesPivotValue(r[pivotColumn], pivotValue))
    );
    return aggregateColumn(
      matchingRows.map((r) => r[measure.column]),
      measure.aggregation
    );
  }

  const items = widget.series.items;
  if (!items || items.length === 0) return 0;
  return items.reduce(
    (sum, item) =>
      sum +
      aggregateColumn(
        rows.map((r) => r[item.column]),
        item.aggregation
      ),
    0
  );
}
