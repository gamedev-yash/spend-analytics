import type { ColumnProfile } from "@/types/dataset-profile";
import type { GeneratedDashboard } from "@/types/generated-dashboard";

// Sidebar filtering for a generated dashboard's stored, static row snapshot
// — plain in-memory array filtering (no provider, no cascading options),
// matching the simpler filter panels most fixed dashboards use rather than
// tail-spend's cascading one. Every widget already renders from whatever
// `rows` it's handed (see lib/generated-dashboard/compute.ts), so filtering
// is just narrowing that array before it reaches DashboardGrid.

/** Column name -> selected values (empty = all), plus an optional date range. */
export interface GeneratedFilterState {
  dimensions: Record<string, string[]>;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_GENERATED_FILTERS: GeneratedFilterState = {
  dimensions: {},
  dateFrom: "",
  dateTo: "",
};

export function hasActiveGeneratedFilters(filters: GeneratedFilterState): boolean {
  return (
    Object.values(filters.dimensions).some((values) => values.length > 0) ||
    filters.dateFrom !== "" ||
    filters.dateTo !== ""
  );
}

const MAX_FILTERABLE_DIMENSIONS = 3;

/**
 * Categorical columns worth offering as sidebar filters. Starts from the same
 * `candidates.dimensions` list the AI planner used to pick chart groupings
 * (so a filter never shows up for a column no widget would recognize), then
 * drops anything with too few or too many distinct values to make a sane
 * dropdown — capped at 3, matching the fixed "My Dashboards" builder's own
 * filter panel.
 */
export function filterableDimensionColumns(dashboard: GeneratedDashboard): ColumnProfile[] {
  const byName = new Map(dashboard.profile.columns.map((c) => [c.name, c]));
  return dashboard.profile.candidates.dimensions
    .map((name) => byName.get(name))
    .filter((c): c is ColumnProfile => !!c && c.distinctCount > 1 && c.distinctCount <= 60)
    .slice(0, MAX_FILTERABLE_DIMENSIONS);
}

/** The first AI-flagged temporal column with real min/max bounds — the one date-range filter, if any. */
export function temporalColumn(dashboard: GeneratedDashboard): ColumnProfile | null {
  const byName = new Map(dashboard.profile.columns.map((c) => [c.name, c]));
  for (const name of dashboard.profile.candidates.temporal) {
    const col = byName.get(name);
    if (col?.temporal?.minDate && col.temporal.maxDate) return col;
  }
  return null;
}

/** Distinct, sorted values a column actually takes across every row — the dropdown's option list. */
export function distinctValuesForColumn(rows: Record<string, unknown>[], column: string): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = row[column];
    if (raw === null || raw === undefined) continue;
    const value = String(raw).trim();
    if (value !== "") seen.add(value);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

/** Normalizes a profiled min/max date string to the `YYYY-MM-DD` shape `<input type="date">` needs. */
export function toDateInputValue(raw: string): string {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function parseRowDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Every active dimension selection AND the date range, ANDed together — a plain array filter over the dashboard's stored rows. */
export function applyGeneratedDashboardFilters(
  rows: Record<string, unknown>[],
  filters: GeneratedFilterState,
  dateColumn: string | null
): Record<string, unknown>[] {
  const activeDimensions = Object.entries(filters.dimensions).filter(([, values]) => values.length > 0);
  const hasDateFilter = dateColumn !== null && (filters.dateFrom !== "" || filters.dateTo !== "");
  if (activeDimensions.length === 0 && !hasDateFilter) return rows;

  const fromTime = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
  const toTime = filters.dateTo ? new Date(filters.dateTo).getTime() : null;

  return rows.filter((row) => {
    for (const [column, values] of activeDimensions) {
      const raw = row[column];
      const value = raw === null || raw === undefined ? "" : String(raw).trim();
      if (!values.includes(value)) return false;
    }
    if (hasDateFilter && dateColumn) {
      const date = parseRowDate(row[dateColumn]);
      if (!date) return false;
      const time = date.getTime();
      if (fromTime !== null && time < fromTime) return false;
      if (toTime !== null && time > toTime) return false;
    }
    return true;
  });
}
