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
import type { FilterState, LinkedSelection } from "./types";

export function buildPaymentTermsFilterSummary(params: {
  filters: FilterState;
  /** provider.tsx's state.selection — a widget click (e.g. a payment-term bar), not a filter-drawer filter. Previously never reached the assistant at all. */
  selection?: LinkedSelection | null;
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
    params.selection ? `Chart selection: ${params.selection.label}` : null,
  ]);
}
