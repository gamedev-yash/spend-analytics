// Pure summary-string builder for useTailSpendStore.ts's
// useSetDashboardActiveFilterSummary call — split out for unit testing (see
// tests/dashboard-filter-summary.test.ts). See
// context/DashboardActiveFiltersContext.tsx for why this is a plain-language
// string, not a structured filter object.
//
// Deliberately still omits `plants`: useTailSpendStore.ts's own
// TailSpendFilterState doc comments mark it "display-only, never affects
// computed numbers" (applyTailSpendFilters in reactiveFilters.ts never reads
// it) — telling the model to filter by it would make it try a concept that
// doesn't actually narrow this dashboard's own numbers.
//
// `sourceSystems` is display-only in that same sense too, but IS included
// here: page.tsx's own local activeFiltersSummary (shown in each widget's
// fullscreen header) already surfaces it, and an exported/AI-grounding
// summary that silently drops a filter the user can see selected on screen
// is a worse experience than one line the model can't act on.

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
    formatMultiSelectPart("Source System", filters.sourceSystems),
    filters.paretoThreshold !== DEFAULT_PARETO_THRESHOLD
      ? `Pareto threshold: ${filters.paretoThreshold}%`
      : null,
    allBucketsSelected ? null : `Invoice value buckets: ${[...filters.selectedBuckets].join(", ")}`,
    formatDateRangePart(filters.dateFrom, filters.dateTo, params.dateMin, params.dateMax),
  ]);
}
