"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { ClearFiltersButton, FilterDateRange, FilterGroup, FilterSelect } from "@/components/ui/filter-controls";
import { MultiSelect } from "@/components/sap/multi-select";
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
  plant: "BU / Plant",
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
    setCategories,
    setGlobalUltimates,
    setSourceSystems,
    setPlants,
    setSupplierCountPerCategory,
    clearSelection,
    resetFilters,
    dateMin,
    dateMax,
    categoryOptions,
    globalUltimateOptions,
    sourceSystemOptions,
    plantOptions,
  } = useSingleSourceRisk();

  const { isWidgetEnabled, toggleWidgetEnabled, resetWidgetsToDefault } = useSingleSourceRiskFocus();

  const hasActiveFilters =
    filters.categoryCodes.length > 0 ||
    filters.globalUltimateIds.length > 0 ||
    filters.sourceSystemIds.length > 0 ||
    filters.plantIds.length > 0 ||
    filters.supplierCountPerCategory !== 1;

  const node = useMemo(
    () => (
      <div className="space-y-8">
        <FilterGroup title="Filters">
          <FilterDateRange
            fromValue={filters.dateFrom}
            toValue={filters.dateTo}
            min={dateMin}
            max={dateMax}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
          />
          <MultiSelect
            label="Category"
            allLabel="All Categories"
            options={categoryOptions}
            selected={filters.categoryCodes}
            onChange={setCategories}
          />
          <MultiSelect
            label="Supplier"
            allLabel="All Suppliers"
            options={globalUltimateOptions}
            selected={filters.globalUltimateIds}
            onChange={setGlobalUltimates}
          />
          <MultiSelect
            label="Source System"
            allLabel="All Source Systems"
            options={sourceSystemOptions}
            selected={filters.sourceSystemIds}
            onChange={setSourceSystems}
          />
          <MultiSelect
            label="BU / Plant"
            allLabel="All Plants"
            options={plantOptions}
            selected={filters.plantIds}
            onChange={setPlants}
          />
          <FilterSelect
            label="Number of Suppliers per Category"
            value={String(filters.supplierCountPerCategory)}
            options={SUPPLIER_COUNT_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
            onChange={(value) => setSupplierCountPerCategory(Number(value) as SupplierCountThreshold)}
          />
          {hasActiveFilters && <ClearFiltersButton onClick={resetFilters} />}
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
      hasActiveFilters,
      dateMin,
      dateMax,
      categoryOptions,
      globalUltimateOptions,
      sourceSystemOptions,
      plantOptions,
      setDateFrom,
      setDateTo,
      setCategories,
      setGlobalUltimates,
      setSourceSystems,
      setPlants,
      setSupplierCountPerCategory,
      resetFilters,
      clearSelection,
      isWidgetEnabled,
      toggleWidgetEnabled,
      resetWidgetsToDefault,
    ]
  );

  useFilterSlot(node);

  return null;
}
