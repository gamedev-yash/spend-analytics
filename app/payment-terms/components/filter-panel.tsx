"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { FilterGroup, FilterSelect } from "@/components/ui/filter-controls";
import { CustomizeViewDrawer } from "@/components/dashboard/customize-view-drawer";
import { useFilterSlot } from "@/context/FilterContext";
import { usePaymentTerms } from "../provider";
import { formatMonthLabel } from "../constants";
import { PT_WIDGET_GROUPS } from "./focusParams";
import { usePaymentTermsFocus } from "./usePaymentTermsFocus";
import type { LinkedDimension } from "../types";

const DIMENSION_LABELS: Record<LinkedDimension, string> = {
  category: "Category",
  globalUltimate: "Supplier",
  paymentTerm: "Payment Term",
};

/**
 * Registers this page's filter controls into the shell's sidebar Filter Drawer
 * (see context/FilterContext.tsx) instead of rendering an in-page panel — the
 * dashboard canvas no longer reserves space for a local filter column.
 */
export function FilterPanel() {
  const {
    filters,
    selection,
    setEndMonth,
    setCategory,
    setGlobalUltimate,
    setSourceSystem,
    setPlant,
    setPaymentTerm,
    clearSelection,
    endMonthOptions,
    categoryOptions,
    globalUltimateOptions,
    sourceSystemOptions,
    plantOptions,
    paymentTermOptions,
  } = usePaymentTerms();

  const { isWidgetEnabled, toggleWidgetEnabled, resetWidgetsToDefault } = usePaymentTermsFocus();

  const node = useMemo(
    () => (
      <div className="space-y-8">
        <FilterGroup title="Global Filters">
          <FilterSelect
            label="Date Range"
            value={filters.endMonth}
            options={endMonthOptions.map((m) => ({ value: m, label: formatMonthLabel(m) }))}
            onChange={setEndMonth}
          />
          <FilterSelect
            label="Category L1"
            value={filters.categoryCode ?? ""}
            options={[{ value: "", label: "All Categories" }, ...categoryOptions]}
            onChange={(value) => setCategory(value === "" ? null : value)}
          />
          <FilterSelect
            label="Supplier (Global Ultimate)"
            value={filters.globalUltimateId ?? ""}
            options={[{ value: "", label: "All Suppliers" }, ...globalUltimateOptions]}
            onChange={(value) => setGlobalUltimate(value === "" ? null : value)}
          />
          <FilterSelect
            label="Source System"
            value={filters.sourceSystemId ?? ""}
            options={[{ value: "", label: "All Source Systems" }, ...sourceSystemOptions]}
            onChange={(value) => setSourceSystem(value === "" ? null : value)}
          />
          <FilterSelect
            label="Plant / Site"
            value={filters.plantId ?? ""}
            options={[{ value: "", label: "All Plants" }, ...plantOptions]}
            onChange={(value) => setPlant(value === "" ? null : value)}
          />
        </FilterGroup>

        <FilterGroup title="Page Options">
          <CustomizeViewDrawer
            groups={PT_WIDGET_GROUPS}
            isWidgetEnabled={isWidgetEnabled}
            onToggleWidgetEnabled={toggleWidgetEnabled}
            onResetToDefault={resetWidgetsToDefault}
          />
          <FilterSelect
            label="Payment Term"
            value={filters.paymentTermCode ?? ""}
            options={[{ value: "", label: "All Payment Terms" }, ...paymentTermOptions]}
            onChange={(value) => setPaymentTerm(value === "" ? null : value)}
          />
        </FilterGroup>

        {selection && (
          <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <span className="truncate">
              Filtered by {DIMENSION_LABELS[selection.dimension]}: {selection.label}
            </span>
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Clear selection"
              className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    ),
    [
      filters,
      selection,
      endMonthOptions,
      categoryOptions,
      globalUltimateOptions,
      sourceSystemOptions,
      plantOptions,
      paymentTermOptions,
      setEndMonth,
      setCategory,
      setGlobalUltimate,
      setSourceSystem,
      setPlant,
      setPaymentTerm,
      clearSelection,
      isWidgetEnabled,
      toggleWidgetEnabled,
      resetWidgetsToDefault,
    ]
  );

  useFilterSlot(node);

  return null;
}
