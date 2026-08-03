"use client";

import { useMemo } from "react";
import { FilterX } from "lucide-react";
import { FilterSelect } from "@/components/ui/filter-controls";
import { useFilterOptions } from "@/hooks/use-widget-query";
import type { QueryFilter } from "@/types/data-provider";
import type { Dataset } from "@/context/DatasetsContext";

/** Dimension → selected value ("" = all). */
export type DashboardFilterState = Record<string, string>;

export const ALL_VALUES = "";

/** Filterable dimensions: category columns with a usable number of values. */
export function filterableColumns(dataset: Dataset) {
  return dataset.columns
    .filter((c) => c.type === "category" && c.distinctCount > 1 && c.distinctCount <= 60)
    .slice(0, 3);
}

/** Selected values as query filters — what the widgets push down to the provider. */
export function dashboardFiltersToQuery(filters: DashboardFilterState): QueryFilter[] {
  return Object.entries(filters)
    .filter(([, value]) => value !== ALL_VALUES)
    .map(([field, value]) => ({ field, operator: "eq" as const, value }));
}

interface DashboardFiltersProps {
  dataset: Dataset;
  filters: DashboardFilterState;
  onChange: (filters: DashboardFilterState) => void;
}

/**
 * Top-bar filter controls generated from the bound dataset's own category
 * columns — no hardcoded dimensions, so any uploaded CSV gets usable filters.
 */
export function DashboardFilters({ dataset, filters, onChange }: DashboardFiltersProps) {
  const columns = useMemo(() => filterableColumns(dataset), [dataset]);
  const { options: optionsByColumn } = useFilterOptions(
    dataset.id,
    columns.map((c) => c.id)
  );

  if (columns.length === 0) return null;

  const activeCount = Object.values(filters).filter((v) => v !== ALL_VALUES).length;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
      <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Filters
      </span>
      {columns.map((column) => (
        <FilterSelect
          key={column.id}
          label={column.name}
          className="min-w-44"
          value={filters[column.id] ?? ALL_VALUES}
          onChange={(value) => onChange({ ...filters, [column.id]: value })}
          options={[
            { value: ALL_VALUES, label: `All ${column.name}` },
            ...(optionsByColumn.get(column.id) ?? []).map((value) => ({ value, label: value })),
          ]}
        />
      ))}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="mb-0.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <FilterX className="h-3.5 w-3.5" />
          Clear {activeCount}
        </button>
      )}
    </div>
  );
}
