import type { DashboardPlan, WidgetSpec } from "@/types/generated-dashboard";

// Splits a freshly-generated widget set into what the dashboard shows on
// arrival and what waits in the "Add Widget" catalog.
//
// The widget planner marks each spec `essential` (see
// lib/ai/skills/widget-planning.md), but a model's count is a suggestion, not
// a contract — it can mark twenty widgets essential or none at all. This
// module is the enforcement layer: it takes the model's intent as the primary
// signal and clamps the result into a range that actually renders as a
// coherent opening screen.

/**
 * Charts (non-KPI widgets) shown initially. Must stay in step with the range
 * the widget-planning skill asks the model to mark `essential` — the model
 * aims for it, this enforces it.
 */
const MIN_INITIAL_CHARTS = 4;
const MAX_INITIAL_CHARTS = 6;

/**
 * KPI tiles shown initially. Deliberately budgeted separately from charts: a
 * KPI row is structural (the planning skill mandates one), it's a single band
 * across the top rather than a chart slot, and counting four stat tiles
 * against the chart budget would leave the opening screen with almost no
 * actual charts.
 */
const MAX_INITIAL_KPIS = 6;

export interface WidgetSplit {
  /** Rendered immediately, in the planner's original order. */
  initial: WidgetSpec[];
  /** Generated but parked in the Add Widget catalog. */
  library: WidgetSpec[];
}

/** Priority order of `plan.sections`, as sectionId -> rank (0 = highest priority). */
function sectionRanks(plan: DashboardPlan): Map<string, number> {
  const ranks = new Map<string, number>();
  const sorted = [...(plan.sections ?? [])].sort((a, b) => a.priority - b.priority);
  sorted.forEach((section, index) => ranks.set(section.id, index));
  return ranks;
}

/**
 * Force every widget onto a section the plan actually declares. A widget whose
 * `sectionId` doesn't match one is invisible today — DashboardGrid only walks
 * `plan.sections` — so it would silently vanish from the dashboard, and worse,
 * adding it from the catalog would look like a no-op. Same repair-don't-drop
 * philosophy as validate.ts's column-name resolution: land it in the
 * highest-priority section rather than let it disappear.
 */
function normalizeSections(widgets: WidgetSpec[], plan: DashboardPlan): WidgetSpec[] {
  const ranks = sectionRanks(plan);
  if (ranks.size === 0) return widgets;
  const fallback = [...(plan.sections ?? [])].sort((a, b) => a.priority - b.priority)[0].id;
  return widgets.map((widget) =>
    ranks.has(widget.sectionId) ? widget : { ...widget, sectionId: fallback }
  );
}

/**
 * Round-robin across sections in priority order: the first widget of the
 * top-priority section, then the first of the next, and so on, before any
 * section's second widget.
 *
 * This is what keeps the opening screen from collapsing into one heading.
 * Taking the highest-ranked N widgets outright would fill the whole budget
 * from the top one or two sections, and DashboardGrid skips sections with no
 * widgets — so the narrative structure the planning stage produced would
 * simply not be visible.
 */
function spreadAcrossSections(widgets: WidgetSpec[], ranks: Map<string, number>): WidgetSpec[] {
  const buckets = new Map<string, WidgetSpec[]>();
  for (const widget of widgets) {
    const bucket = buckets.get(widget.sectionId);
    if (bucket) bucket.push(widget);
    else buckets.set(widget.sectionId, [widget]);
  }

  // Unknown sections sort last; normalizeSections should have removed them.
  const sectionIds = [...buckets.keys()].sort(
    (a, b) => (ranks.get(a) ?? Infinity) - (ranks.get(b) ?? Infinity)
  );
  const deepest = Math.max(0, ...[...buckets.values()].map((b) => b.length));

  const result: WidgetSpec[] = [];
  for (let round = 0; round < deepest; round++) {
    for (const sectionId of sectionIds) {
      const widget = buckets.get(sectionId)![round];
      if (widget) result.push(widget);
    }
  }
  return result;
}

/**
 * Split `widgets` into the dashboard's opening screen and its Add Widget
 * catalog, honoring each spec's `essential` flag but clamping the result to a
 * renderable size.
 *
 * Rules, in order:
 *  1. Every KPI widget leads the dashboard (capped at MAX_INITIAL_KPIS),
 *     independent of `essential` and of the chart budget — the KPI row is
 *     structural, not one of the "most relevant charts."
 *  2. Charts marked `essential` fill the initial set, spread across sections,
 *     up to MAX_INITIAL_CHARTS. Extras go to the catalog.
 *  3. If that leaves fewer than MIN_INITIAL_CHARTS, non-essential charts
 *     backfill by the same spread ordering — this is also the whole path when
 *     no widget declares `essential` at all (an older model response, or a
 *     hand-built spec set), which degrades to a pure priority split.
 *  4. Everything not picked becomes the catalog.
 */
export function splitInitialWidgets(plan: DashboardPlan, widgets: WidgetSpec[]): WidgetSplit {
  const normalized = normalizeSections(widgets, plan);
  const ranks = sectionRanks(plan);
  const order = new Map(normalized.map((widget, index) => [widget.id, index]));

  const kpis = normalized.filter((w) => w.kind === "kpi");
  const charts = normalized.filter((w) => w.kind !== "kpi");

  const orderedKpis = spreadAcrossSections(kpis, ranks);
  const initialKpis = orderedKpis.slice(0, MAX_INITIAL_KPIS);

  const essentialCharts = spreadAcrossSections(
    charts.filter((w) => w.essential === true),
    ranks
  );
  const otherCharts = spreadAcrossSections(
    charts.filter((w) => w.essential !== true),
    ranks
  );

  const initialCharts = essentialCharts.slice(0, MAX_INITIAL_CHARTS);
  if (initialCharts.length < MIN_INITIAL_CHARTS) {
    initialCharts.push(...otherCharts.slice(0, MIN_INITIAL_CHARTS - initialCharts.length));
  }

  // Restore the planner's original ordering — DashboardGrid sorts sections
  // itself, so this array's order only decides within-section placement, and
  // there the planner's narrative sequence beats the round-robin's.
  const initialIds = new Set([...initialKpis, ...initialCharts].map((w) => w.id));
  const initial = normalized.filter((w) => initialIds.has(w.id));
  const library = normalized
    .filter((w) => !initialIds.has(w.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { initial, library };
}
