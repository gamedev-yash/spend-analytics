"use client";

import { useFilterSlot } from "@/context/FilterContext";
import { FilterGroup, FilterToggle } from "@/components/ui/filter-controls";
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
  const { payload, filters, mode, setPlants, setL1s, setDateRange, setMode } = useFragmentation();

  useFilterSlot(
    <FilterGroup title="Global Filters">
      <MultiSelect
        label="Business Unit / Plant"
        allLabel="All business units"
        options={payload.plantOptions.map((p) => ({ value: p.code, label: p.name }))}
        selected={filters.plants}
        onChange={setPlants}
      />
      <MultiSelect
        label="Category (L1)"
        allLabel="All categories"
        options={payload.l1Options.map((l1) => ({ value: l1, label: l1 }))}
        selected={filters.l1s}
        onChange={setL1s}
      />
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Time Period
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={filters.dateFrom}
            min={payload.dateMin}
            max={filters.dateTo || payload.dateMax}
            onChange={(e) => setDateRange(e.target.value, filters.dateTo)}
            className="h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          />
          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">to</span>
          <input
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom || payload.dateMin}
            max={payload.dateMax}
            onChange={(e) => setDateRange(filters.dateFrom, e.target.value)}
            className="h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          />
        </div>
      </div>
      <FilterToggle
        label="Group by Parent Company"
        checked={mode === "parent"}
        onChange={(checked) => setMode(checked ? "parent" : "vendor")}
      />
    </FilterGroup>
  );

  return null;
}
