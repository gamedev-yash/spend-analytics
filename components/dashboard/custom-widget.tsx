"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { usePalette } from "@/hooks/use-palette";
import { useStackedWidgetQuery, useWidgetQuery } from "@/hooks/use-widget-query";
import { useWidgetFilters } from "@/context/WidgetFiltersContext";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import {
  formatAxisValue,
  formatWidgetValue,
  isWidgetRenderable,
  widgetIssue,
  type SeriesPoint,
  type StackedSeriesPoint,
} from "@/lib/widget-data";
import { AGGREGATION_LABELS, type WidgetConfig } from "@/types/custom-dashboard";
import type { Dataset } from "@/context/DatasetsContext";
import { useIsFullscreenChart } from "@/components/dashboard/fullscreen-overlay";

interface CustomWidgetProps {
  dataset: Dataset;
  config: WidgetConfig;
  /** Compact mode for the configurator's live preview. */
  preview?: boolean;
}

function columnName(dataset: Dataset, columnId: string | undefined): string | undefined {
  return dataset.columns.find((c) => c.id === columnId)?.name;
}

/**
 * Handed to whichever widget-query hook does not apply to this chart type. Both
 * hooks must be called on every render (hook rules), so the inactive one gets a
 * config both payload builders decline: a non-`count` aggregation with no measure
 * column makes each return null, and a null payload issues no request at all.
 *
 * `aggregation: "count"` would *not* work here — it needs no measure column, so it
 * would build a valid KPI payload and cost a wasted round trip per widget.
 */
const NO_QUERY_CONFIG: WidgetConfig = {
  id: "__inactive__",
  title: "",
  chartType: "bar",
  aggregation: "sum",
};

/** Long category labels truncate on the axis; the tooltip shows them in full. */
function shortLabel(label: string, max = 18): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function EmptyNote({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-24 items-center justify-center px-4 text-center text-xs text-slate-500 dark:text-slate-400">
      {message}
    </div>
  );
}

/** Placeholder for the first query only — a refetch keeps the previous data on screen. */
function LoadingNote() {
  return <div className="h-full min-h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />;
}

/**
 * Renders one WidgetConfig against its dataset — KPI tile, bar/line/pie/donut
 * chart, or data table — using the app's theme-aware palette and the shared
 * ChartTooltipCard. Numbers come from the active IDataProvider via
 * useWidgetQuery, narrowed by whatever filters the surrounding dashboard has
 * set. Missing or stale column references degrade to an explanatory note rather
 * than an error.
 */
export function CustomWidget({ dataset, config, preview = false }: CustomWidgetProps) {
  const palette = usePalette();
  const isFullscreen = useIsFullscreenChart();
  const aggregation = config.aggregation ?? "sum";
  const measureName = columnName(dataset, config.yAxisColumn);
  const groupName = columnName(dataset, config.xAxisColumn);

  const renderable = isWidgetRenderable(dataset, config);
  const isStacked = config.chartType === "stackedBar";
  const filters = useWidgetFilters();

  // Both hooks run unconditionally (hook rules); each declines to query when its
  // payload doesn't apply, so only one round trip is actually issued per widget.
  const flat = useWidgetQuery(dataset, isStacked ? NO_QUERY_CONFIG : config, filters);
  const stackedQuery = useStackedWidgetQuery(dataset, isStacked ? config : NO_QUERY_CONFIG, filters);

  const { series, kpiValue, totalMatchingRows } = flat;
  const stacked = stackedQuery.stacked;
  const ready = isStacked ? stackedQuery.ready : flat.ready;
  const error = isStacked ? stackedQuery.error : flat.error;
  const loading = isStacked ? stackedQuery.loading : flat.loading;
  // A filter change re-queries data that's already rendered — dim it slightly
  // with a small spinner instead of resetting to LoadingNote, which is for the
  // first query only.
  const isRevalidating = ready && loading;

  if (!renderable) {
    return <EmptyNote message={widgetIssue(dataset, config) ?? "This widget is not configured."} />;
  }
  if (error) {
    return <EmptyNote message={error} />;
  }
  if (!ready) {
    return <LoadingNote />;
  }
  if (isStacked ? stacked.points.length === 0 : config.chartType !== "kpi" && series.length === 0) {
    return <EmptyNote message="No rows to plot for this column selection." />;
  }

  return (
    <div className={`relative h-full transition-opacity duration-300 ${isRevalidating ? "opacity-60" : ""}`}>
      {isRevalidating && (
        <Loader2 className="absolute right-1 top-1 z-10 h-3 w-3 animate-spin text-slate-400 dark:text-slate-500" />
      )}
      {renderChart()}
    </div>
  );

  function renderChart(): ReactNode {
  const valueLabel = measureName
    ? `${AGGREGATION_LABELS[aggregation]} of ${measureName}`
    : AGGREGATION_LABELS[aggregation];
  const chartHeight = preview ? 180 : isFullscreen ? "100%" : 260;

  // --- KPI -----------------------------------------------------------------
  if (config.chartType === "kpi") {
    return (
      <div className="flex h-full flex-col justify-center">
        <p className={preview ? "text-2xl font-bold" : "text-3xl font-bold"}>
          <span className="text-slate-900 dark:text-slate-50">
            {formatWidgetValue(kpiValue, aggregation, measureName)}
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {valueLabel} · {totalMatchingRows.toLocaleString("en-IN")} rows
        </p>
      </div>
    );
  }

  // --- Table ---------------------------------------------------------------
  if (config.chartType === "table") {
    return (
      <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {groupName ?? "Group"}
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {valueLabel}
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Rows
              </th>
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr
                key={point.label}
                className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{point.label}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                  {formatWidgetValue(point.value, aggregation, measureName)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                  {point.count.toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const tooltip = (
    <Tooltip
      cursor={{ fill: palette.isDark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.05)" }}
      content={({ active, payload }) => {
        const point = payload?.[0]?.payload as SeriesPoint | undefined;
        if (!point) return null;
        return (
          <ChartTooltipCard
            active={active}
            heading={point.label}
            rows={[
              {
                label: valueLabel,
                value: formatWidgetValue(point.value, aggregation, measureName),
                color: palette.categorical.blue,
              },
              { label: "Rows", value: point.count.toLocaleString("en-IN") },
            ]}
          />
        );
      }}
    />
  );

  // --- Pie / Donut ---------------------------------------------------------
  if (config.chartType === "pie" || config.chartType === "donut") {
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <PieChart>
          <Pie
            data={series}
            dataKey="value"
            nameKey="label"
            innerRadius={config.chartType === "donut" ? "55%" : 0}
            outerRadius="80%"
            paddingAngle={1}
            isAnimationActive={false}
          >
            {series.map((point, index) => (
              <Cell key={point.label} fill={palette.colorForIndex(index)} stroke={palette.ink.surface} />
            ))}
          </Pie>
          {tooltip}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // --- Line ----------------------------------------------------------------
  if (config.chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={palette.ink.grid} />
          <XAxis
            dataKey="label"
            stroke={palette.ink.baseline}
            tick={{ fill: palette.ink.muted, fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            stroke={palette.ink.baseline}
            tick={{ fill: palette.ink.muted, fontSize: 11 }}
            tickLine={false}
            width={52}
            tickFormatter={formatAxisValue}
          />
          {tooltip}
          <Line
            type="monotone"
            dataKey="value"
            stroke={palette.categorical.blue}
            strokeWidth={2}
            dot={{ r: 2.5, fill: palette.categorical.blue, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: palette.ink.surface }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // --- Stacked bar -----------------------------------------------------------
  if (isStacked) {
    const { points, seriesKeys } = stacked;
    const stackedTooltip = (
      <Tooltip
        cursor={{ fill: palette.isDark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.05)" }}
        content={({ active, payload, label }) => {
          const point = payload?.[0]?.payload as StackedSeriesPoint | undefined;
          if (!active || !point) return null;
          return (
            <ChartTooltipCard
              active={active}
              heading={String(label)}
              rows={[
                ...seriesKeys
                  .filter((key) => point.values[key] > 0)
                  .map((key) => ({
                    label: key,
                    value: formatWidgetValue(point.values[key], aggregation, measureName),
                    color: palette.colorForIndex(seriesKeys.indexOf(key)),
                  })),
                { label: "Total", value: formatWidgetValue(point.total, aggregation, measureName) },
              ]}
            />
          );
        }}
      />
    );

    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={palette.ink.grid} />
          <XAxis
            dataKey="label"
            stroke={palette.ink.baseline}
            tick={{ fill: palette.ink.muted, fontSize: 11 }}
            tickLine={false}
            interval={0}
            angle={points.length > 6 ? -25 : 0}
            textAnchor={points.length > 6 ? "end" : "middle"}
            height={points.length > 6 ? 56 : 28}
            tickFormatter={(value: string) => shortLabel(value)}
          />
          <YAxis
            stroke={palette.ink.baseline}
            tick={{ fill: palette.ink.muted, fontSize: 11 }}
            tickLine={false}
            width={52}
            tickFormatter={formatAxisValue}
          />
          {stackedTooltip}
          {seriesKeys.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 11, color: palette.ink.secondary }} iconType="square" iconSize={8} />
          )}
          {seriesKeys.map((key, index) => (
            <Bar
              key={key}
              dataKey={`values.${key}`}
              name={key}
              stackId="stack"
              fill={palette.colorForIndex(index)}
              stroke={palette.ink.surface}
              strokeWidth={2}
              radius={index === seriesKeys.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={44}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // --- Bar -----------------------------------------------------------------
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={palette.ink.grid} />
        <XAxis
          dataKey="label"
          stroke={palette.ink.baseline}
          tick={{ fill: palette.ink.muted, fontSize: 11 }}
          tickLine={false}
          interval={0}
          angle={series.length > 6 ? -25 : 0}
          textAnchor={series.length > 6 ? "end" : "middle"}
          height={series.length > 6 ? 56 : 28}
          tickFormatter={(value: string) => shortLabel(value)}
        />
        <YAxis
          stroke={palette.ink.baseline}
          tick={{ fill: palette.ink.muted, fontSize: 11 }}
          tickLine={false}
          width={52}
          tickFormatter={formatAxisValue}
        />
        {tooltip}
        <Bar dataKey="value" fill={palette.categorical.blue} maxBarSize={44} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
  }
}
