"use client";

import { FilterX } from "lucide-react";
import { useFilterSlot } from "@/context/FilterContext";
import { FilterDateRange, FilterGroup, FilterToggle } from "@/components/ui/filter-controls";
import { MultiSelect } from "@/components/sap/multi-select";
import { useFragmentation } from "./fragmentationStore";

/**
 * Registers the Supplier Fragmentation dashboard's filters into the shell's
 * sidebar Filter Drawer (see context/FilterContext.tsx) instead of an
 * in-canvas filter bar — matching /tail-spend and /spend-overview. Renders
 * nothing itself; it reads/writes the same FragmentationStoreProvider state
 * every view derives from, so a change here drives the store's memoized
 * derivation exactly like any other filter interaction.
 */
export function FragmentationControls() {
  const { payload, filters, mode, options, setPlants, setL1s, setDateRange, setMode, resetFilters } = useFragmentation();

  const hasActiveFilters =
    filters.plants.length > 0 || filters.l1s.length > 0 || mode !== "vendor";

  useFilterSlot(
    <FilterGroup title="Filters">
      <MultiSelect
        label="BU / Plant"
        allLabel="All business units"
        options={options.plants.map((p) => ({ value: p.code, label: p.name }))}
        selected={filters.plants}
        onChange={setPlants}
      />
      <MultiSelect
        label="Category"
        allLabel="All categories"
        options={options.l1s.map((l1) => ({ value: l1, label: l1 }))}
        selected={filters.l1s}
        onChange={setL1s}
      />
      <FilterDateRange
        label="Time Period"
        fromValue={filters.dateFrom}
        toValue={filters.dateTo}
        min={payload.dateMin}
        max={payload.dateMax}
        onFromChange={(value) => setDateRange(value, filters.dateTo)}
        onToChange={(value) => setDateRange(filters.dateFrom, value)}
      />
      <FilterToggle
        label="Group by Parent Company"
        checked={mode === "parent"}
        onChange={(checked) => setMode(checked ? "parent" : "vendor")}
      />
      {hasActiveFilters && (
        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <FilterX className="h-3.5 w-3.5" />
          Clear Filters
        </button>
      )}
    </FilterGroup>
  );

  return null;
}
