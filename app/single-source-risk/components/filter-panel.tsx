"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { FilterDateRange, FilterGroup, FilterSelect } from "@/components/ui/filter-controls";
import { CustomizeViewDrawer } from "@/components/dashboard/customize-view-drawer";
import { useFilterSlot } from "@/context/FilterContext";
import { useSingleSourceRisk } from "../provider";
import { SUPPLIER_COUNT_OPTIONS } from "../selectors";
import { SSR_WIDGET_GROUPS } from "./focusParams";
import { useSingleSourceRiskFocus } from "./useSingleSourceRiskFocus";
import type { LinkedDimension, SupplierCountThreshold } from "../types";

const DIMENSION_LABELS: Record<LinkedDimension, string> = {
  category: "Category",
  product: "Product",
  plant: "Plant/Site",
  globalUltimate: "Supplier",
};

/**
 * Registers this page's filter controls into the shell's sidebar Filter Drawer
 * (see context/FilterContext.tsx) instead of rendering an in-page panel.
 */
export function FilterPanel() {
  const {
    filters,
    selection,
    setDateFrom,
    setDateTo,
    setCategory,
    setGlobalUltimate,
    setSourceSystem,
    setPlant,
    setSupplierCountPerCategory,
    clearSelection,
    dateMin,
    dateMax,
    categoryOptions,
    globalUltimateOptions,
    sourceSystemOptions,
    plantOptions,
  } = useSingleSourceRisk();

  const { isWidgetEnabled, toggleWidgetEnabled, resetWidgetsToDefault } = useSingleSourceRiskFocus();

  const node = useMemo(
    () => (
      <div className="space-y-8">
        <FilterGroup title="Global Filters">
          <FilterDateRange
            fromValue={filters.dateFrom}
            toValue={filters.dateTo}
            min={dateMin}
            max={dateMax}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
          />
          <FilterSelect
            label="Category"
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
            label="Plant/Site"
            value={filters.plantId ?? ""}
            options={[{ value: "", label: "All Plants/Sites" }, ...plantOptions]}
            onChange={(value) => setPlant(value === "" ? null : value)}
          />
        </FilterGroup>

        <FilterGroup title="Sourcing Risk">
          <FilterSelect
            label="Number of Suppliers per Category"
            value={String(filters.supplierCountPerCategory)}
            options={SUPPLIER_COUNT_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
            onChange={(value) => setSupplierCountPerCategory(Number(value) as SupplierCountThreshold)}
          />
        </FilterGroup>

        <FilterGroup title="Page Options">
          <CustomizeViewDrawer
            groups={SSR_WIDGET_GROUPS}
            isWidgetEnabled={isWidgetEnabled}
            onToggleWidgetEnabled={toggleWidgetEnabled}
            onResetToDefault={resetWidgetsToDefault}
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
      dateMin,
      dateMax,
      categoryOptions,
      globalUltimateOptions,
      sourceSystemOptions,
      plantOptions,
      setDateFrom,
      setDateTo,
      setCategory,
      setGlobalUltimate,
      setSourceSystem,
      setPlant,
      setSupplierCountPerCategory,
      clearSelection,
      isWidgetEnabled,
      toggleWidgetEnabled,
      resetWidgetsToDefault,
    ]
  );

  useFilterSlot(node);

  return null;
}
