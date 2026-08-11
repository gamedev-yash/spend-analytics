// Pure summary-string builder for provider.tsx's useSetDashboardActiveFilterSummary
// call — split out so it's unit-testable (tests/dashboard-filter-summary.test.ts)
// without mounting the provider's React tree. See
// context/DashboardActiveFiltersContext.tsx for why this is a plain-language
// string, not a structured filter object.

import {
  formatMultiSelectPartFromOptions,
  formatDateRangePart,
  joinFilterSummaryParts,
} from "@/lib/dashboard-filters/format-filter-summary";
import type { FilterOption } from "./selectors";
import type { FilterState } from "./types";

export function buildPaymentTermsFilterSummary(params: {
  filters: FilterState;
  defaultDateFrom: string;
  defaultDateTo: string;
  categoryOptions: FilterOption[];
  globalUltimateOptions: FilterOption[];
  sourceSystemOptions: FilterOption[];
  plantOptions: FilterOption[];
  paymentTermOptions: FilterOption[];
}): string | null {
  const { filters } = params;
  return joinFilterSummaryParts([
    formatMultiSelectPartFromOptions("Category", filters.categoryCodes, params.categoryOptions),
    formatMultiSelectPartFromOptions("Supplier Group", filters.globalUltimateIds, params.globalUltimateOptions),
    formatMultiSelectPartFromOptions("Source System", filters.sourceSystemIds, params.sourceSystemOptions),
    formatMultiSelectPartFromOptions("Plant", filters.plantIds, params.plantOptions),
    formatMultiSelectPartFromOptions("Payment Term", filters.paymentTermCodes, params.paymentTermOptions),
    formatDateRangePart(filters.dateFrom, filters.dateTo, params.defaultDateFrom, params.defaultDateTo),
  ]);
}
