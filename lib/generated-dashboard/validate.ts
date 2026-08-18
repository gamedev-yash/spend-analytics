import type { DatasetProfile } from "@/types/dataset-profile";
import type { ChartKind, WidgetSpec, WidgetSpecDraft } from "@/types/generated-dashboard";
import { needsDimension } from "@/types/generated-dashboard";

// Gatekeeper between whatever the LLM returned and what actually renders.
// Never trust the model's output blindly: resolve every referenced column
// name against the real profile (tolerating typo-ish drift), enforce the
// cardinality/range rules the JSON Schema couldn't express, derive the one
// layout decision (colSpan) the model no longer makes, and drop any widget
// that can't be made renderable rather than let it blow up a chart.

const DEFAULT_LIMIT = 10;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const DONUT_MAX_LIMIT = 6;
// A heatmap row-count and a waterfall step-count both need to stay browsable
// the way a donut's slice-count does — a 100-row matrix or a 100-step bridge
// is unreadable regardless of how correct the underlying data is.
const HEATMAP_MAX_LIMIT = 15;
const WATERFALL_MAX_LIMIT = 15;
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

/** Real column name -> its profiled role, for deriveColSpan's temporal check. */
function buildColumnRoleLookup(profile: DatasetProfile): Map<string, string> {
  const roles = new Map<string, string>();
  for (const col of profile.columns) {
    roles.set(col.name, col.role);
  }
  return roles;
}

/** Resolve a possibly-drifted column name to the real column name in the profile. */
function resolveColumn(name: string | undefined, lookup: Map<string, string>): string | undefined {
  if (!name) return undefined;
  return lookup.get(normalize(name));
}

/**
 * Grid width is a layout decision, not a creative one — the model used to be
 * asked to pick from {3,4,6,8,12} and reliably produced gap-prone, arbitrary
 * combinations (an 8 pairs with nothing; a 4+6 pair never tiles). Deriving it
 * from `kind` and whether `dimension` is temporal removes the guesswork:
 *  - table/heatmap/pareto: always full — a real grid, or a wide combo chart,
 *    both need the room.
 *  - donut: always half, regardless of anything else — a pie's diameter is
 *    capped by its *height*, so extra width buys it zero additional pixels of
 *    chart; full width would just surround a small circle with dead space.
 *  - everything else: full when `dimension` is temporal (a long ordered time
 *    axis wants the room), half otherwise (categorical bar-like charts
 *    commonly flip to horizontal bars — see BarLikeWidget — which grow
 *    downward, not outward, so width past half is wasted there too).
 * Only 6 and 12 come out of this, so two half-width widgets always tile a
 * row exactly; DashboardGrid's packSectionColSpans handles the leftover case
 * of a lone half-width widget with nothing to pair with.
 */
function deriveColSpan(
  kind: ChartKind,
  dimension: string | undefined,
  columnRoles: Map<string, string>
): WidgetSpec["colSpan"] {
  if (kind === "kpi") return 3;
  if (kind === "table" || kind === "heatmap" || kind === "pareto") return 12;
  if (kind === "donut") return 6;
  const isTemporal = dimension !== undefined && columnRoles.get(dimension) === "temporal";
  return isTemporal ? 12 : 6;
}

function limitCapFor(kind: ChartKind): number {
  switch (kind) {
    case "donut":
      return DONUT_MAX_LIMIT;
    case "heatmap":
      return HEATMAP_MAX_LIMIT;
    case "waterfall":
      return WATERFALL_MAX_LIMIT;
    default:
      return MAX_LIMIT;
  }
}

function clampLimit(value: unknown, kind: ChartKind): number {
  const cap = limitCapFor(kind);
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < MIN_LIMIT) {
    return Math.min(DEFAULT_LIMIT, cap);
  }
  return Math.max(MIN_LIMIT, Math.min(Math.round(n), cap));
}

/**
 * Resolve + repair one widget against the profile, or return null if it
 * cannot be made renderable (missing dimension/measure column it depends on).
 */
function resolveWidget(
  widget: WidgetSpecDraft,
  lookup: Map<string, string>,
  columnRoles: Map<string, string>
): WidgetSpec | null {
  const kind: ChartKind = widget.kind;

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
    limit: clampLimit(widget.limit, kind),
    colSpan: deriveColSpan(kind, dimension, columnRoles),
  };
}

/**
 * Resolve every widget's column references against `profile`, repairing
 * minor drift (case/whitespace/underscores) and enforcing the
 * cardinality/range rules the JSON Schema can't express. Anything that
 * can't be resolved is dropped. The contract: everything returned is
 * guaranteed renderable against this profile.
 */
export function validateWidgets(widgets: WidgetSpecDraft[], profile: DatasetProfile): WidgetSpec[] {
  const lookup = buildColumnLookup(profile);
  const columnRoles = buildColumnRoleLookup(profile);
  const result: WidgetSpec[] = [];
  for (const widget of widgets) {
    const resolved = resolveWidget(widget, lookup, columnRoles);
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
