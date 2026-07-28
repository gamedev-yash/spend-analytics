"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  GitMerge,
  LayoutDashboard,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useDatasets, type Dataset } from "@/context/DatasetsContext";
import {
  addWidget,
  moveWidget,
  removeWidget,
  renameDashboard,
  updateWidget,
  useCustomDashboard,
  useDashboardsReady,
} from "@/lib/custom-dashboards-store";
import { defaultWidgetForDataset } from "@/lib/suggest";
import { computeKpiValue, computeSeries } from "@/lib/widget-data";
import { CustomWidget } from "@/components/dashboard/custom-widget";
import { WidgetConfigurator } from "@/components/dashboard/WidgetConfigurator";
import { NewDashboardButton } from "@/components/dashboard/new-dashboard-dialog";
import type { WidgetConfig } from "@/types/custom-dashboard";
import {
  applyDashboardFilters,
  DashboardFilters,
  type DashboardFilterState,
} from "./dashboard-filters";
import { cn } from "@/lib/utils";

function EmptyShell({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900/60">
      <LayoutDashboard className="h-8 w-8 text-slate-400 dark:text-slate-600" />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {children}
    </div>
  );
}

/** Download the dashboard definition plus each widget's computed data as JSON. */
function exportSnapshot(
  dashboardTitle: string,
  dataset: Dataset,
  widgets: WidgetConfig[],
  filters: DashboardFilterState
): void {
  const snapshot = {
    dashboard: dashboardTitle,
    dataset: { id: dataset.id, name: dataset.name, rows: dataset.rows.length },
    filters,
    exportedAt: new Date().toISOString(),
    widgets: widgets.map((widget) => ({
      title: widget.title,
      chartType: widget.chartType,
      xAxisColumn: widget.xAxisColumn,
      yAxisColumn: widget.yAxisColumn,
      aggregation: widget.aggregation,
      data:
        widget.chartType === "kpi"
          ? computeKpiValue(dataset, widget)
          : computeSeries(dataset, widget),
    })),
  };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${dashboardTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "dashboard"}-snapshot.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function CustomDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const dashboard = useCustomDashboard(id);
  const ready = useDashboardsReady();
  const { datasets } = useDatasets();

  const [filters, setFilters] = useState<DashboardFilterState>({});
  const [configuratorOpen, setConfiguratorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null);

  const sourceDataset = datasets.find((d) => d.id === dashboard?.datasetId) ?? null;

  // Widgets read a filtered view of the dataset — same shape, fewer rows.
  const viewDataset = useMemo<Dataset | null>(() => {
    if (!sourceDataset) return null;
    const rows = applyDashboardFilters(sourceDataset.rows, filters);
    return rows.length === sourceDataset.rows.length ? sourceDataset : { ...sourceDataset, rows };
  }, [sourceDataset, filters]);

  // Store hydrates on the client, so "not found" is only real once ready.
  if (!ready) return null;

  if (!dashboard) {
    return (
      <EmptyShell
        title="Dashboard not found"
        message="This dashboard no longer exists in this browser. Custom dashboards are stored locally, so a link opened elsewhere won't resolve."
      >
        <NewDashboardButton label="Create a dashboard" />
      </EmptyShell>
    );
  }

  if (!sourceDataset || !viewDataset) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{dashboard.title}</h1>
        <EmptyShell
          title="Bound dataset is missing"
          message="The CSV this dashboard was built from has been removed. Upload it again from any dashboard page, or create a new dashboard against a dataset you still have."
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/tail-spend"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Go upload a CSV
            </Link>
            <NewDashboardButton label="New dashboard" />
          </div>
        </EmptyShell>
      </div>
    );
  }

  const openAddWidget = () => {
    setEditingWidget(null);
    setConfiguratorOpen(true);
  };

  const openEditWidget = (widget: WidgetConfig) => {
    setEditingWidget(widget);
    setConfiguratorOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header: inline-editable title, dataset badge, actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            aria-label="Dashboard title"
            value={dashboard.title}
            onChange={(e) => renameDashboard(dashboard.id, e.target.value)}
            className="w-full max-w-xl truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-2xl font-semibold text-slate-900 transition-colors hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none dark:text-slate-100 dark:hover:border-slate-700 dark:focus:border-slate-600 dark:focus:bg-slate-900"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
              title={`Bound dataset: ${sourceDataset.name}`}
            >
              {sourceDataset.isJoined ? (
                <GitMerge className="h-3.5 w-3.5" />
              ) : (
                <Database className="h-3.5 w-3.5" />
              )}
              {sourceDataset.name}
              <span className="text-emerald-600 dark:text-emerald-400">
                {viewDataset.rows.length.toLocaleString("en-IN")}
                {viewDataset.rows.length !== sourceDataset.rows.length &&
                  ` of ${sourceDataset.rows.length.toLocaleString("en-IN")}`}{" "}
                rows
              </span>
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {dashboard.widgets.length} widget{dashboard.widgets.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openAddWidget}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Widget
          </button>
          <button
            type="button"
            onClick={() => exportSnapshot(dashboard.title, viewDataset, dashboard.widgets, filters)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Export Snapshot
          </button>
        </div>
      </div>

      <DashboardFilters dataset={sourceDataset} filters={filters} onChange={setFilters} />

      {dashboard.widgets.length === 0 ? (
        <EmptyShell
          title="No widgets yet"
          message="Add your first widget to start visualizing this dataset."
        >
          <button
            type="button"
            onClick={openAddWidget}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            <Plus className="h-4 w-4" />
            Add Widget
          </button>
        </EmptyShell>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {dashboard.widgets.map((widget, index) => (
            <div
              key={widget.id}
              className={cn(
                "flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80",
                widget.gridSpan === 2 && "lg:col-span-2"
              )}
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-100/50 px-4 py-2.5 dark:border-slate-800/80 dark:bg-slate-900/90">
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                  {widget.title}
                </p>
                <div className="flex shrink-0 items-center gap-0.5 text-slate-400 dark:text-slate-500">
                  <button
                    type="button"
                    onClick={() => moveWidget(dashboard.id, widget.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${widget.title} earlier`}
                    title="Move earlier"
                    className="rounded p-1 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveWidget(dashboard.id, widget.id, 1)}
                    disabled={index === dashboard.widgets.length - 1}
                    aria-label={`Move ${widget.title} later`}
                    title="Move later"
                    className="rounded p-1 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditWidget(widget)}
                    aria-label={`Edit ${widget.title}`}
                    title="Edit widget"
                    className="rounded p-1 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWidget(dashboard.id, widget.id)}
                    aria-label={`Remove ${widget.title}`}
                    title="Remove widget"
                    className="rounded p-1 transition-colors hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 p-4">
                <CustomWidget dataset={viewDataset} config={widget} />
              </div>
            </div>
          ))}
        </div>
      )}

      <WidgetConfigurator
        open={configuratorOpen}
        onOpenChange={setConfiguratorOpen}
        dataset={viewDataset}
        widget={editingWidget}
        defaults={defaultWidgetForDataset(sourceDataset)}
        onSave={(widget) => {
          if (editingWidget) updateWidget(dashboard.id, widget);
          else addWidget(dashboard.id, widget);
        }}
      />
    </div>
  );
}
