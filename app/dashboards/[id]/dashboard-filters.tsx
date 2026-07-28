"use client";

import { useMemo } from "react";
import { FilterX } from "lucide-react";
import { FilterSelect } from "@/components/ui/filter-controls";
import type { Dataset, DatasetRow } from "@/context/DatasetsContext";

/** Dimension → selected value ("" = all). */
export type DashboardFilterState = Record<string, string>;

export const ALL_VALUES = "";

/** Filterable dimensions: category columns with a usable number of values. */
export function filterableColumns(dataset: Dataset) {
  return dataset.columns
    .filter((c) => c.type === "category" && c.distinctCount > 1 && c.distinctCount <= 60)
    .slice(0, 3);
}

export function applyDashboardFilters(rows: DatasetRow[], filters: DashboardFilterState): DatasetRow[] {
  const active = Object.entries(filters).filter(([, value]) => value !== ALL_VALUES);
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every(([column, value]) => String(row[column] ?? "") === value));
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

  const optionsByColumn = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const column of columns) {
      const values = new Set<string>();
      for (const row of dataset.rows) {
        const raw = row[column.id];
        if (raw === null || raw === undefined) continue;
        const s = String(raw).trim();
        if (s !== "") values.add(s);
      }
      map.set(column.id, Array.from(values).sort((a, b) => a.localeCompare(b)));
    }
    return map;
  }, [columns, dataset.rows]);

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
