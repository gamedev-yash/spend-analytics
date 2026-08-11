// Pure summary-string builder for useTailSpendStore.ts's
// useSetDashboardActiveFilterSummary call — split out for unit testing (see
// tests/dashboard-filter-summary.test.ts). See
// context/DashboardActiveFiltersContext.tsx for why this is a plain-language
// string, not a structured filter object.
//
// Deliberately omits `plants` and `sourceSystems`: useTailSpendStore.ts's own
// TailSpendFilterState doc comments mark both "display-only, never affects
// computed numbers" (applyTailSpendFilters in reactiveFilters.ts never reads
// them) — telling the model to filter by them would make it try a concept
// that doesn't actually narrow this dashboard's own numbers.

import {
  formatMultiSelectPart,
  formatDateRangePart,
  joinFilterSummaryParts,
} from "@/lib/dashboard-filters/format-filter-summary";
import type { TailSpendFilterState } from "./useTailSpendStore";

const DEFAULT_PARETO_THRESHOLD = 80;

export function buildTailSpendFilterSummary(params: {
  filters: TailSpendFilterState;
  allBucketLabels: string[];
  dateMin: string;
  dateMax: string;
}): string | null {
  const { filters } = params;
  const allBucketsSelected = filters.selectedBuckets.size >= params.allBucketLabels.length;

  return joinFilterSummaryParts([
    formatMultiSelectPart("Category", filters.categories),
    formatMultiSelectPart("Supplier", filters.suppliers),
    filters.paretoThreshold !== DEFAULT_PARETO_THRESHOLD
      ? `Pareto threshold: ${filters.paretoThreshold}%`
      : null,
    allBucketsSelected ? null : `Invoice value buckets: ${[...filters.selectedBuckets].join(", ")}`,
    formatDateRangePart(filters.dateFrom, filters.dateTo, params.dateMin, params.dateMax),
  ]);
}
