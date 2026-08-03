import type { DatasetProfile } from "@/types/dataset-profile";
import type { ChartKind, WidgetSpec } from "@/types/generated-dashboard";
import { needsDimension } from "@/types/generated-dashboard";

// Gatekeeper between whatever the LLM returned and what actually renders.
// Never trust the model's output blindly: resolve every referenced column
// name against the real profile (tolerating typo-ish drift), enforce the
// cardinality/range rules the JSON Schema couldn't express, and drop any
// widget that can't be made renderable rather than let it blow up a chart.

const ALLOWED_COL_SPANS = [3, 4, 6, 8, 12] as const;
type ColSpan = (typeof ALLOWED_COL_SPANS)[number];

const DEFAULT_LIMIT = 10;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const DONUT_MAX_LIMIT = 6;
const MAX_SERIES_ITEMS = 8;

/** lowercase + strip everything but letters/digits, so "Site Name", "site_name",
 * and " SiteName " all collapse to the same key for typo-tolerant matching. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildColumnLookup(profile: DatasetProfile): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const col of profile.columns) {
    lookup.set(normalize(col.name), col.name);
  }
  return lookup;
}

/** Resolve a possibly-drifted column name to the real column name in the profile. */
function resolveColumn(name: string | undefined, lookup: Map<string, string>): string | undefined {
  if (!name) return undefined;
  return lookup.get(normalize(name));
}

function clampColSpan(value: unknown): ColSpan {
  const n = typeof value === "number" ? value : Number(value);
  if (ALLOWED_COL_SPANS.includes(n as ColSpan)) return n as ColSpan;
  if (!Number.isFinite(n)) return 6;
  // Snap to the nearest allowed value.
  let best: ColSpan = ALLOWED_COL_SPANS[0];
  let bestDist = Infinity;
  for (const allowed of ALLOWED_COL_SPANS) {
    const dist = Math.abs(allowed - n);
    if (dist < bestDist) {
      bestDist = dist;
      best = allowed;
    }
  }
  return best;
}

function clampLimit(value: unknown, isDonut: boolean): number {
  const cap = isDonut ? DONUT_MAX_LIMIT : MAX_LIMIT;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < MIN_LIMIT) {
    return isDonut ? Math.min(DEFAULT_LIMIT, DONUT_MAX_LIMIT) : DEFAULT_LIMIT;
  }
  return Math.max(MIN_LIMIT, Math.min(Math.round(n), cap));
}

/**
 * Resolve + repair one widget against the profile, or return null if it
 * cannot be made renderable (missing dimension/measure column it depends on).
 */
function resolveWidget(widget: WidgetSpec, lookup: Map<string, string>): WidgetSpec | null {
  const kind: ChartKind = widget.kind;
  const isDonut = kind === "donut";

  // Resolve the dimension column, if this kind needs one.
  let dimension = widget.dimension;
  if (needsDimension(kind)) {
    const resolved = resolveColumn(widget.dimension, lookup);
    if (!resolved) return null;
    dimension = resolved;
  } else if (widget.dimension) {
    dimension = resolveColumn(widget.dimension, lookup) ?? undefined;
  }

  // Resolve the series (measures or pivot), dropping the widget if any
  // required column can't be found.
  let series: WidgetSpec["series"];
  if (widget.series?.type === "pivot") {
    const pivotDimension = resolveColumn(widget.series.dimension, lookup);
    const measureColumn = resolveColumn(widget.series.measure?.column, lookup);
    if (!pivotDimension || !measureColumn) return null;
    const values = Array.isArray(widget.series.values)
      ? widget.series.values.slice(0, MAX_SERIES_ITEMS)
      : [];
    if (values.length === 0) return null;
    series = {
      type: "pivot",
      dimension: pivotDimension,
      values,
      measure: { ...widget.series.measure, column: measureColumn },
    };
  } else if (widget.series?.type === "measures") {
    const items = (widget.series.items ?? [])
      .map((item) => {
        const column = resolveColumn(item.column, lookup);
        return column ? { ...item, column } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, MAX_SERIES_ITEMS);
    if (items.length === 0) return null;
    series = { type: "measures", items };
  } else {
    return null;
  }

  return {
    ...widget,
    dimension,
    series,
    limit: clampLimit(widget.limit, isDonut),
    colSpan: clampColSpan(widget.colSpan),
  };
}

/**
 * Resolve every widget's column references against `profile`, repairing
 * minor drift (case/whitespace/underscores) and enforcing the
 * cardinality/range rules the JSON Schema can't express. Anything that
 * can't be resolved is dropped. The contract: everything returned is
 * guaranteed renderable against this profile.
 */
export function validateWidgets(widgets: WidgetSpec[], profile: DatasetProfile): WidgetSpec[] {
  const lookup = buildColumnLookup(profile);
  const result: WidgetSpec[] = [];
  for (const widget of widgets) {
    const resolved = resolveWidget(widget, lookup);
    if (resolved) result.push(resolved);
  }
  return result;
}

/**
 * Short human explanation for why a widget couldn't be resolved against
 * `profile`, or null if it would in fact resolve fine. Intended for an
 * empty-state message where a rejected widget is worth surfacing.
 */
export function widgetIssue(widget: WidgetSpec, profile: DatasetProfile): string | null {
  const lookup = buildColumnLookup(profile);

  if (needsDimension(widget.kind) && !resolveColumn(widget.dimension, lookup)) {
    return widget.dimension
      ? `Column "${widget.dimension}" for "${widget.title}" was not found in the dataset.`
      : `"${widget.title}" needs a dimension column but none was specified.`;
  }

  if (widget.series?.type === "pivot") {
    if (!resolveColumn(widget.series.dimension, lookup)) {
      return `Pivot column "${widget.series.dimension}" for "${widget.title}" was not found in the dataset.`;
    }
    if (!resolveColumn(widget.series.measure?.column, lookup)) {
      return `Measure column "${widget.series.measure?.column}" for "${widget.title}" was not found in the dataset.`;
    }
    if (!widget.series.values || widget.series.values.length === 0) {
      return `"${widget.title}" has no pivot values to split by.`;
    }
  } else if (widget.series?.type === "measures") {
    const items = widget.series.items ?? [];
    if (items.length === 0) {
      return `"${widget.title}" has no measures configured.`;
    }
    const unresolved = items.find((item) => !resolveColumn(item.column, lookup));
    if (unresolved) {
      return `Measure column "${unresolved.column}" for "${widget.title}" was not found in the dataset.`;
    }
  } else {
    return `"${widget.title}" has no valid series configuration.`;
  }

  return null;
}
