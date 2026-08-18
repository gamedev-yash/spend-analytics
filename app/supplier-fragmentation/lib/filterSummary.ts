// Pure summary-string builder for fragmentationStore.tsx's
// useSetDashboardActiveFilterSummary call — split out for unit testing (see
// tests/dashboard-filter-summary.test.ts). See
// context/DashboardActiveFiltersContext.tsx for why this is a plain-language
// string, not a structured filter object.

import {
  formatMultiSelectPart,
  formatMultiSelectPartFromOptions,
  formatDateRangePart,
  joinFilterSummaryParts,
} from "@/lib/dashboard-filters/format-filter-summary";
import type { GlobalFilters } from "./types";

export function buildSupplierFragmentationFilterSummary(params: {
  filters: GlobalFilters;
  plantOptions: { code: string; name: string }[];
  /** fragmentationStore.tsx's crossFilterLabel — "" (not null) when nothing is chart-selected. */
  crossFilterLabel: string;
  defaultDateFrom: string;
  defaultDateTo: string;
}): string | null {
  const { filters } = params;
  return joinFilterSummaryParts([
    formatMultiSelectPartFromOptions(
      "Plant",
      filters.plants,
      params.plantOptions.map((p) => ({ value: p.code, label: p.name }))
    ),
    // l1s are already display names (payload.l1Options), unlike plants above.
    formatMultiSelectPart("Category", filters.l1s),
    params.crossFilterLabel ? `Chart selection: ${params.crossFilterLabel}` : null,
    formatDateRangePart(filters.dateFrom, filters.dateTo, params.defaultDateFrom, params.defaultDateTo),
  ]);
}
