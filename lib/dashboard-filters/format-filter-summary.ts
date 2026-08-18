// Shared formatting for the human-readable "what's currently filtered on
// this dashboard" string each dashboard's own filter component/provider
// publishes via context/DashboardActiveFiltersContext.tsx. Deliberately
// dumb string formatting, not a structured filter object — see that
// context file's top comment for why a plain-language summary (which the
// model translates into query_dashboard_data filters the same way it
// already does for typed-in filter phrases) is the safer design than
// hand-mapping six different filter-state shapes onto exact column ids.
//
// No "use client" here — pure functions, safe to import from either a
// client component or a plain unit test.

/** "Plant: Pune, Chennai" — or null when nothing is selected, so it drops out of the summary entirely. */
export function formatMultiSelectPart(label: string, selectedLabels: string[]): string | null {
  if (selectedLabels.length === 0) return null;
  return `${label}: ${selectedLabels.join(", ")}`;
}

/**
 * Resolves selected ids/codes to their display labels via an options list,
 * then formats. Drops any selected id that isn't in `options` (e.g. one a
 * cascading filter just pruned) rather than showing a raw code the model
 * has no schema column matching.
 */
export function formatMultiSelectPartFromOptions(
  label: string,
  selectedIds: string[],
  options: { value: string; label: string }[]
): string | null {
  if (selectedIds.length === 0) return null;
  const byId = new Map(options.map((o) => [o.value, o.label]));
  const labels = selectedIds.map((id) => byId.get(id)).filter((l): l is string => Boolean(l));
  return labels.length > 0 ? `${label}: ${labels.join(", ")}` : null;
}

/**
 * "Date: 2025-01-01 to 2025-06-30" — or null when the range still matches
 * the dashboard's own default window (i.e. nothing was actually changed).
 * Kept as raw ISO strings rather than a locale-formatted date: unambiguous,
 * and matches how every date value already reaches the model elsewhere
 * (SEMANTIC_METRIC_DICTIONARY, dashboard-context.ts's schema examples).
 */
export function formatDateRangePart(
  dateFrom: string,
  dateTo: string,
  defaultDateFrom: string,
  defaultDateTo: string
): string | null {
  if (dateFrom === defaultDateFrom && dateTo === defaultDateTo) return null;
  return `Date: ${dateFrom} to ${dateTo}`;
}

/** Joins whatever parts are non-null with " · "; null (not "") when every part was null, so callers can do a plain truthiness check. */
export function joinFilterSummaryParts(parts: (string | null)[]): string | null {
  const present = parts.filter((p): p is string => p !== null);
  return present.length > 0 ? present.join(" · ") : null;
}

/**
 * Spend Overview and Compliance share this exact shape — URL-param-driven
 * Plant (codes needing a label lookup) + Category (already display strings)
 * + a date range with its own default window — so one function covers both
 * rather than two copies drifting apart.
 */
export function buildPlantCategoryDateFilterSummary(params: {
  selectedPlantCodes: string[];
  plantOptions: { code: string; name: string }[];
  selectedCategories: string[];
  dateFrom: string;
  dateTo: string;
  defaultDateFrom: string;
  defaultDateTo: string;
  /** The `vendor` URL param — already a display name (or matching key), not a code needing a lookup. */
  vendorLabel?: string | null;
}): string | null {
  return joinFilterSummaryParts([
    formatMultiSelectPartFromOptions(
      "Plant",
      params.selectedPlantCodes,
      params.plantOptions.map((p) => ({ value: p.code, label: p.name }))
    ),
    formatMultiSelectPart("Category", params.selectedCategories),
    formatDateRangePart(params.dateFrom, params.dateTo, params.defaultDateFrom, params.defaultDateTo),
    params.vendorLabel?.trim() ? `Vendor: ${params.vendorLabel.trim()}` : null,
  ]);
}
