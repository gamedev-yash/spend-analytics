"use client";

import { X } from "lucide-react";
import { FilterDropdown } from "@/components/filters/filter-dropdown";
import { usePaymentTerms } from "../provider";
import { formatMonthLabel } from "../constants";
import type { LinkedDimension } from "../types";

const DIMENSION_LABELS: Record<LinkedDimension, string> = {
  category: "Category",
  globalUltimate: "Supplier",
  paymentTerm: "Payment Term",
};

export function FilterPanel() {
  const {
    filters,
    selection,
    setEndMonth,
    setCategory,
    setSourceSystem,
    setPaymentTerm,
    clearSelection,
    endMonthOptions,
    categoryOptions,
    paymentTermOptions,
    sourceSystemOptions,
  } = usePaymentTerms();

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-50/60 px-5 py-6">
      <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-slate-400">
        Filters
      </h2>

      <div className="space-y-4">
        <FilterDropdown
          label="Date Range"
          // Every option here is a real, always-applicable month — there is no
          // "All" state for a fixed 12-month window — so the leading blank
          // placeholder option is suppressed entirely rather than worked around.
          includePlaceholderOption={false}
          options={endMonthOptions.map((m) => ({ value: m, label: formatMonthLabel(m) }))}
          value={filters.endMonth}
          onChange={(newValue) => setEndMonth(newValue)}
        />

        <FilterDropdown
          label="Category"
          placeholder="All Categories"
          options={categoryOptions}
          value={filters.categoryCode ?? ""}
          onChange={(newValue) => setCategory(newValue === "" ? null : newValue)}
        />

        <FilterDropdown
          label="Source System"
          placeholder="All Source Systems"
          options={sourceSystemOptions}
          value={filters.sourceSystemId ?? ""}
          onChange={(newValue) => setSourceSystem(newValue === "" ? null : newValue)}
        />

        <FilterDropdown
          label="Payment Terms"
          placeholder="All Payment Terms"
          options={paymentTermOptions}
          value={filters.paymentTermCode ?? ""}
          onChange={(newValue) => setPaymentTerm(newValue === "" ? null : newValue)}
        />
      </div>

      {selection && (
        <div className="mt-5 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm">
          <span className="truncate">
            Filtered by {DIMENSION_LABELS[selection.dimension]}: {selection.label}
          </span>
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selection"
            className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </aside>
  );
}
