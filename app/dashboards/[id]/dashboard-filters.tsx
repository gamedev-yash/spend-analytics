"use client";

import { useEffect, useMemo } from "react";
import { FilterX } from "lucide-react";
import { MultiSelect } from "@/components/sap/multi-select";
import { useFilterOptions } from "@/hooks/use-widget-query";
import type { QueryFilter } from "@/types/data-provider";
import type { Dataset } from "@/context/DatasetsContext";

/** Column id -> selected values. Empty array = all. */
export type DashboardFilterState = Record<string, string[]>;

/** Filterable dimensions: category columns with a usable number of values. */
export function filterableColumns(dataset: Dataset) {
  return dataset.columns
    .filter((c) => c.type === "category" && c.distinctCount > 1 && c.distinctCount <= 60)
    .slice(0, 3);
}

/** Selected values as query filters — what the widgets push down to the provider. */
export function dashboardFiltersToQuery(filters: DashboardFilterState): QueryFilter[] {
  return Object.entries(filters)
    .filter(([, values]) => values.length > 0)
    .map(([field, values]) => ({
      field,
      operator: values.length > 1 ? "in" : "eq",
      value: values.length > 1 ? values : values[0],
    }));
}

interface DashboardFiltersProps {
  dataset: Dataset;
  filters: DashboardFilterState;
  onChange: (filters: DashboardFilterState) => void;
}

/**
 * Top-bar filter controls generated from the bound dataset's own category
 * columns — no hardcoded dimensions, so any uploaded CSV gets usable filters.
 * Each dropdown is multi-select and cascading: picking a value in one column
 * narrows what the OTHER columns can still offer, via the same provider
 * query mechanism every widget uses (see useFilterOptions) — works in both
 * CSV and Azure SQL mode.
 */
export function DashboardFilters({ dataset, filters, onChange }: DashboardFiltersProps) {
  const columns = useMemo(() => filterableColumns(dataset), [dataset]);
  const columnIds = useMemo(() => columns.map((c) => c.id), [columns]);
  const { options: optionsByColumn, ready: optionsReady } = useFilterOptions(dataset.id, columnIds, filters);

  // Options are fetched from the provider (async, can't be pure-derived at
  // render time the way a client-side row filter could be) — once a fresh
  // fetch settles, drop any column's selection that's no longer in its own
  // cascading list. Prevents a narrow in one column from silently locking
  // another column's stale pick to zero rows.
  useEffect(() => {
    if (!optionsReady) return;
    let changed = false;
    const next: DashboardFilterState = { ...filters };
    for (const column of columns) {
      const valid = new Set(optionsByColumn.get(column.id) ?? []);
      const current = filters[column.id] ?? [];
      const pruned = current.filter((v) => valid.has(v));
      if (pruned.length !== current.length) {
        next[column.id] = pruned;
        changed = true;
      }
    }
    if (changed) onChange(next);
    // filters/onChange intentionally excluded: this only reacts to a fresh
    // options fetch settling, never to the filters change that triggered it
    // (that would immediately re-fire before the provider responds).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsByColumn, optionsReady, columns]);

  if (columns.length === 0) return null;

  const activeCount = Object.values(filters).filter((values) => values.length > 0).length;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
      <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Filters
      </span>
      {columns.map((column) => (
        <MultiSelect
          key={column.id}
          label={column.name}
          allLabel={`All ${column.name}`}
          options={(optionsByColumn.get(column.id) ?? []).map((value) => ({ value, label: value }))}
          selected={filters[column.id] ?? []}
          onChange={(values) => onChange({ ...filters, [column.id]: values })}
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
