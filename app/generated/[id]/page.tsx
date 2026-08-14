"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Trash2 } from "lucide-react";
import { DashboardGrid } from "@/components/generated-dashboard/dashboard-grid";
import { AddWidgetSheet } from "@/components/generated-dashboard/add-widget-sheet";
import { WidgetGridSkeleton } from "@/components/dashboard/widget-grid-skeleton";
import {
  deleteGeneratedDashboard,
  removeWidgetToLibrary,
  useGeneratedDashboard,
  useGeneratedDashboardsReady,
} from "@/lib/generated-dashboard/store";
import { useFilterSlot } from "@/context/FilterContext";
import { ClearFiltersButton, FilterDateRange, FilterGroup } from "@/components/ui/filter-controls";
import { MultiSelect } from "@/components/sap/multi-select";
import {
  applyGeneratedDashboardFilters,
  distinctValuesForColumn,
  filterableDimensionColumns,
  hasActiveGeneratedFilters,
  temporalColumn,
  toDateInputValue,
  EMPTY_GENERATED_FILTERS,
  type GeneratedFilterState,
} from "./filters";

// Viewer for an AI-generated dashboard: no widget editing, no AI assistant
// hook-up. Everything the page needs (plan, widgets, raw rows) already lives
// in the stored GeneratedDashboard record.
//
// Two interactive controls: filters, a plain client-side narrowing of the
// stored rows (see ./filters.ts), and "Add Widget", which moves one of the
// dashboard's catalog widgets onto the grid (see ../../components/
// generated-dashboard/add-widget-sheet.tsx). Both are local to the stored
// record — neither re-calls the model.

function EmptyShell({ title, message, children }: { title: string; message: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900/60">
      <LayoutDashboard className="h-8 w-8 text-slate-400 dark:text-slate-600" />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {children}
    </div>
  );
}

export default function GeneratedDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const dashboard = useGeneratedDashboard(id);
  const ready = useGeneratedDashboardsReady();

  const [filters, setFilters] = useState<GeneratedFilterState>(EMPTY_GENERATED_FILTERS);

  const dimensionColumns = useMemo(
    () => (dashboard ? filterableDimensionColumns(dashboard) : []),
    [dashboard]
  );
  const dateColumn = useMemo(() => (dashboard ? temporalColumn(dashboard) : null), [dashboard]);
  const dimensionOptions = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!dashboard) return map;
    for (const column of dimensionColumns) {
      map.set(column.name, distinctValuesForColumn(dashboard.rows, column.name));
    }
    return map;
  }, [dashboard, dimensionColumns]);

  const filteredRows = useMemo(() => {
    if (!dashboard) return [];
    return applyGeneratedDashboardFilters(dashboard.rows, filters, dateColumn?.name ?? null);
  }, [dashboard, filters, dateColumn]);

  const activeFilters = hasActiveGeneratedFilters(filters);

  useFilterSlot(
    dimensionColumns.length === 0 && !dateColumn ? null : (
      <FilterGroup title="Filters">
        {dateColumn?.temporal && (
          <FilterDateRange
            // Empty state stays "" (so hasActiveGeneratedFilters and the
            // row filter both read it as unbounded) — only the displayed
            // value falls back to the column's real bounds, matching every
            // other dashboard's date picker showing a populated range
            // rather than an empty mm/dd/yyyy placeholder.
            fromValue={filters.dateFrom || toDateInputValue(dateColumn.temporal.minDate)}
            toValue={filters.dateTo || toDateInputValue(dateColumn.temporal.maxDate)}
            min={toDateInputValue(dateColumn.temporal.minDate)}
            max={toDateInputValue(dateColumn.temporal.maxDate)}
            onFromChange={(value) => setFilters((f) => ({ ...f, dateFrom: value }))}
            onToChange={(value) => setFilters((f) => ({ ...f, dateTo: value }))}
          />
        )}
        {dimensionColumns.map((column) => (
          <MultiSelect
            key={column.name}
            label={column.name}
            allLabel={`All ${column.name}`}
            options={(dimensionOptions.get(column.name) ?? []).map((value) => ({ value, label: value }))}
            selected={filters.dimensions[column.name] ?? []}
            onChange={(values) =>
              setFilters((f) => ({ ...f, dimensions: { ...f.dimensions, [column.name]: values } }))
            }
          />
        ))}
        {activeFilters && (
          <ClearFiltersButton onClick={() => setFilters(EMPTY_GENERATED_FILTERS)} />
        )}
      </FilterGroup>
    )
  );

  // Store hydrates on the client, so "not found" is only real once ready.
  if (!ready) return <WidgetGridSkeleton widgetCount={4} />;

  if (!dashboard) {
    return (
      <EmptyShell
        title="Dashboard not found"
        message="This generated dashboard no longer exists in this browser. Generated dashboards are stored locally, so a link opened elsewhere — or after clearing site data — won't resolve. There's nothing here to delete."
      >
        <Link
          href="/"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Back home
        </Link>
      </EmptyShell>
    );
  }

  const createdAt = new Date(dashboard.createdAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function handleDelete() {
    deleteGeneratedDashboard(id);
    router.push("/");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-slate-900 dark:text-slate-100">{dashboard.title}</h1>
            {/* Which branch of the data-source picker built this. Absent on
                dashboards stored before the picker existed — those were all
                uploads, which is what the store defaults them to. */}
            <span className="shrink-0 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {dashboard.sourceKind === "spend" ? "Spend Analytics Data" : "Uploaded CSV"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Generated from {dashboard.sourceFileName} ·{" "}
            {activeFilters
              ? `${filteredRows.length.toLocaleString("en-IN")} of ${dashboard.rows.length.toLocaleString("en-IN")} rows`
              : `${dashboard.rows.length.toLocaleString("en-IN")} rows`}{" "}
            · {createdAt}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Previews render against filteredRows, so what the sheet shows is
              exactly what lands on the grid. */}
          <AddWidgetSheet dashboard={dashboard} rows={filteredRows} />
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 shadow-sm transition-colors hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Dashboard
          </button>
        </div>
      </div>

      <DashboardGrid
        plan={dashboard.plan}
        widgets={dashboard.widgets}
        rows={filteredRows}
        // Removing returns the widget to the Add Widget catalog rather than
        // discarding its spec, so it's a one-click undo away.
        onRemoveWidget={(widgetId) => removeWidgetToLibrary(id, widgetId)}
      />
    </div>
  );
}
