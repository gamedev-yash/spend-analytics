"use client";

import { useMemo, useState } from "react";
import { Check, LayoutGrid, Rows } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FilterSelect } from "@/components/ui/filter-controls";
import { CustomWidget } from "@/components/dashboard/custom-widget";
import { newId } from "@/lib/custom-dashboards-store";
import {
  AGGREGATION_LABELS,
  CHART_TYPE_LABELS,
  needsMeasure,
  needsSeriesColumn,
  needsXAxis,
  type Aggregation,
  type ChartType,
  type WidgetConfig,
} from "@/types/custom-dashboard";
import type { Dataset } from "@/context/DatasetsContext";
import { cn } from "@/lib/utils";

interface WidgetConfiguratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset: Dataset;
  /** Existing widget to edit; omit to add a new one. */
  widget?: WidgetConfig | null;
  /** Starting values for a new widget (from the suggestion engine). */
  defaults?: Omit<WidgetConfig, "id">;
  onSave: (widget: WidgetConfig) => void;
}

const NONE = "__none__";

const CHART_TYPE_OPTIONS = (Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((value) => ({
  value,
  label: CHART_TYPE_LABELS[value],
}));

const AGGREGATION_OPTIONS = (Object.keys(AGGREGATION_LABELS) as Aggregation[]).map((value) => ({
  value,
  label: AGGREGATION_LABELS[value],
}));

function ConfiguratorForm({
  dataset,
  widget,
  defaults,
  onSave,
  onClose,
}: {
  dataset: Dataset;
  widget?: WidgetConfig | null;
  defaults?: Omit<WidgetConfig, "id">;
  onSave: (widget: WidgetConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<WidgetConfig>(() => ({
    id: widget?.id ?? newId("w"),
    title: widget?.title ?? defaults?.title ?? "New widget",
    chartType: widget?.chartType ?? defaults?.chartType ?? "bar",
    xAxisColumn: widget?.xAxisColumn ?? defaults?.xAxisColumn,
    yAxisColumn: widget?.yAxisColumn ?? defaults?.yAxisColumn,
    seriesColumn: widget?.seriesColumn ?? defaults?.seriesColumn,
    aggregation: widget?.aggregation ?? defaults?.aggregation ?? "sum",
    limit: widget?.limit ?? defaults?.limit ?? 10,
    gridSpan: widget?.gridSpan ?? defaults?.gridSpan ?? 1,
  }));

  function patch(changes: Partial<WidgetConfig>) {
    setDraft((prev) => ({ ...prev, ...changes }));
  }

  // Grouping columns: categories and dates. Metric columns: numerics.
  const groupingOptions = useMemo(
    () => [
      { value: NONE, label: "— none —" },
      ...dataset.columns
        .filter((c) => c.type === "category" || c.type === "date")
        .map((c) => ({ value: c.id, label: `${c.name} · ${c.type} · ${c.distinctCount} values` })),
    ],
    [dataset.columns]
  );

  const metricOptions = useMemo(
    () => [
      { value: NONE, label: "— none —" },
      ...dataset.columns
        .filter((c) => c.type === "number")
        .map((c) => ({ value: c.id, label: `${c.name} · number` })),
    ],
    [dataset.columns]
  );

  const showXAxis = needsXAxis(draft.chartType);
  const showMeasure = needsMeasure(draft.aggregation);
  const showSeries = needsSeriesColumn(draft.chartType);
  const canSave =
    draft.title.trim().length > 0 &&
    (!showSeries || (!!draft.seriesColumn && draft.seriesColumn !== draft.xAxisColumn));

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Widget title
          </span>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-slate-500"
          />
        </label>

        <FilterSelect
          label="Chart type"
          value={draft.chartType}
          options={CHART_TYPE_OPTIONS}
          onChange={(v) => patch({ chartType: v as ChartType })}
        />

        {showXAxis && (
          <FilterSelect
            label="X-axis / grouping column"
            value={draft.xAxisColumn ?? NONE}
            options={groupingOptions}
            onChange={(v) => patch({ xAxisColumn: v === NONE ? undefined : v })}
          />
        )}

        {showSeries && (
          <label className="block space-y-1.5">
            <FilterSelect
              label="Stack by (series) column"
              value={draft.seriesColumn ?? NONE}
              options={groupingOptions}
              onChange={(v) => patch({ seriesColumn: v === NONE ? undefined : v })}
            />
            {draft.seriesColumn && draft.seriesColumn === draft.xAxisColumn && (
              <span className="block text-xs text-red-600 dark:text-red-400">
                Pick a different column than the X-axis — a stack needs two distinct dimensions.
              </span>
            )}
          </label>
        )}

        <FilterSelect
          label="Aggregation"
          value={draft.aggregation ?? "sum"}
          options={AGGREGATION_OPTIONS}
          onChange={(v) => patch({ aggregation: v as Aggregation })}
        />

        {showMeasure && (
          <FilterSelect
            label="Y-axis / metric column"
            value={draft.yAxisColumn ?? NONE}
            options={metricOptions}
            onChange={(v) => patch({ yAxisColumn: v === NONE ? undefined : v })}
          />
        )}

        {showXAxis && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Row limit (Top N)
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={draft.limit ?? 10}
              onChange={(e) => {
                const n = Number(e.target.value);
                patch({ limit: Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined });
              }}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-slate-500"
            />
          </label>
        )}

        <div className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Grid width
          </span>
          <div className="flex gap-2">
            {(
              [
                { span: 1 as const, label: "Half width", icon: LayoutGrid },
                { span: 2 as const, label: "Full width", icon: Rows },
              ]
            ).map((option) => (
              <button
                key={option.span}
                type="button"
                onClick={() => patch({ gridSpan: option.span })}
                aria-pressed={draft.gridSpan === option.span}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                  draft.gridSpan === option.span
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                <option.icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview — the same renderer the dashboard grid uses. */}
        <div className="space-y-1.5 pt-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Live preview
          </span>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {draft.title || "Untitled widget"}
            </p>
            <CustomWidget dataset={dataset} config={draft} preview />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            onSave(draft);
            onClose();
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          <Check className="h-4 w-4" />
          {widget ? "Save changes" : "Add widget"}
        </button>
      </div>
    </>
  );
}

/**
 * Slide-over for adding or editing a dashboard widget. The form is remounted
 * per open (keyed on the widget being edited) so its initializers pick up the
 * current values without state-syncing effects, and the live preview renders
 * through the very same CustomWidget the grid uses.
 */
export function WidgetConfigurator({
  open,
  onOpenChange,
  dataset,
  widget,
  defaults,
  onSave,
}: WidgetConfiguratorProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{widget ? "Edit widget" : "Add widget"}</SheetTitle>
          <SheetDescription>
            Configure how this widget reads {dataset.name}. The preview updates as you type.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <ConfiguratorForm
            key={widget?.id ?? "new"}
            dataset={dataset}
            widget={widget}
            defaults={defaults}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
