// See app/payment-terms/filterSummary.ts — identical shape, plus this
// dashboard's own defining lens (the supplier-count-per-category threshold,
// which unlike the other filters has no "off" state, so it's only worth
// mentioning when the user has moved it off the default of 1 — see
// provider.tsx's RESET_FILTERS/initial-state literal for that default).

import {
  formatMultiSelectPartFromOptions,
  formatDateRangePart,
  joinFilterSummaryParts,
} from "@/lib/dashboard-filters/format-filter-summary";
import type { FilterOption } from "./selectors";
import type { FilterState, LinkedSelection } from "./types";

const DEFAULT_SUPPLIER_COUNT_THRESHOLD = 1;

export function buildSingleSourceRiskFilterSummary(params: {
  filters: FilterState;
  /** provider.tsx's state.selection — a widget click, not a filter-drawer filter. Previously never reached the assistant at all. */
  selection?: LinkedSelection | null;
  defaultDateFrom: string;
  defaultDateTo: string;
  categoryOptions: FilterOption[];
  globalUltimateOptions: FilterOption[];
  sourceSystemOptions: FilterOption[];
  plantOptions: FilterOption[];
}): string | null {
  const { filters } = params;
  return joinFilterSummaryParts([
    formatMultiSelectPartFromOptions("Category", filters.categoryCodes, params.categoryOptions),
    formatMultiSelectPartFromOptions("Supplier Group", filters.globalUltimateIds, params.globalUltimateOptions),
    formatMultiSelectPartFromOptions("Source System", filters.sourceSystemIds, params.sourceSystemOptions),
    formatMultiSelectPartFromOptions("Plant", filters.plantIds, params.plantOptions),
    filters.supplierCountPerCategory !== DEFAULT_SUPPLIER_COUNT_THRESHOLD
      ? `At-risk threshold: ≤${filters.supplierCountPerCategory} suppliers`
      : null,
    formatDateRangePart(filters.dateFrom, filters.dateTo, params.defaultDateFrom, params.defaultDateTo),
    params.selection ? `Chart selection: ${params.selection.label}` : null,
  ]);
}
