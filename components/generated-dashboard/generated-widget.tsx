"use client";

import { Download } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  BarChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/dashboard/chart-card";
import { FullscreenResponsiveContainer, useIsFullscreenChart } from "@/components/dashboard/fullscreen-overlay";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { Button } from "@/components/ui/button";
import { usePalette } from "@/hooks/use-palette";
import type { ChartPalette } from "@/lib/chart-colors";
import {
  computeKpiValue,
  computeWidgetSeries,
  isTemporalDimension,
  type SeriesPoint,
} from "@/lib/generated-dashboard/compute";
import type { WidgetSpec } from "@/types/generated-dashboard";

// Renders one AI-planned widget spec against the dataset's raw rows. Pure
// presentation over lib/generated-dashboard/compute.ts's pure aggregation —
// this file only decides how to draw what compute.ts already produced.

interface GeneratedWidgetProps {
  widget: WidgetSpec;
  rows: Record<string, unknown>[];
  /**
   * Renders this widget as a preview instance rather than a dashboard tile —
   * currently the Add Widget catalog's live preview. Drops the fullscreen
   * affordance: the preview sits inside a Sheet, and FullscreenOverlay shares
   * that Sheet's z-50 layer and also takes over `document.body`'s overflow,
   * so a maximize button there would fight the panel it opened from.
   */
  preview?: boolean;
}

const DONUT_MAX_SLICES = 6;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Compact ₹ Cr/L-style formatting — same spirit as the fixed dashboards'
 * formatINR, kept local since that helper is page-specific, not shared. */
function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(abs >= 100_00_00_000 ? 0 : 1)} Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)} L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function formatValue(value: number, hint: WidgetSpec["formatHint"]): string {
  if (!Number.isFinite(value)) return "—";
  switch (hint) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return `${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
    case "count":
      return Math.round(value).toLocaleString("en-IN");
    case "number":
    default:
      return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
}

// ---------------------------------------------------------------------------
// CSV export — same pattern as the fixed dashboards' detail-report tables
// (payment-terms, single-source-risk): a bespoke exporter over that table's
// own row shape, not a shared generic one. Here every TableWidget shares the
// one SeriesPoint shape, so a single exporter covers all of them.
// ---------------------------------------------------------------------------

/** "Spend by Site!" -> "spend-by-site"; empty/symbol-only titles fall back to "widget". */
function slugifyForFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return slug || "widget";
}

function exportTableCsv(widget: WidgetSpec, points: SeriesPoint[]) {
  const header = ["Label", "Value", "Count"];
  const lines = points.map((point) =>
    [`"${point.label.replace(/"/g, '""')}"`, point.value, point.count].join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugifyForFilename(widget.title)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Fixed-order series identity: the measure labels or pivot values a widget
 * plots, independent of point sort/limit — this is what gets a stable color. */
function seriesKeys(widget: WidgetSpec): string[] {
  if (widget.series.type === "pivot") return widget.series.values;
  return widget.series.items.map((item) => item.label || item.column);
}

interface ChartDatum {
  label: string;
  __count: number;
  __total: number;
  [key: string]: string | number;
}

function toChartData(widget: WidgetSpec, rows: Record<string, unknown>[]): ChartDatum[] {
  return computeWidgetSeries(widget, rows).map((point) => {
    const datum: ChartDatum = { label: point.label, __count: point.count, __total: point.value };
    for (const entry of point.breakdown) datum[entry.key] = entry.value;
    return datum;
  });
}

function EmptyNote({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center px-4 text-center text-sm text-slate-500 dark:text-slate-400">
      {message}
    </div>
  );
}

const NO_DATA_MESSAGE = "No data to display for this widget.";

type TooltipPayloadEntry = {
  name?: string | number;
  dataKey?: string | number;
  value?: string | number;
  color?: string;
  stroke?: string;
  fill?: string;
};

/** Untyped `props` param (recharts' own Tooltip content prop type is a broad
 * union covering coordinates, viewBox, etc.) — cast just the fields this
 * shared renderer actually reads, same values every SeriesPoint-backed
 * chart's Tooltip payload carries regardless of chart kind. */
function seriesTooltip(formatHint: WidgetSpec["formatHint"]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function TooltipContent(props: any) {
    const active = props?.active as boolean | undefined;
    const label = props?.label as string | number | undefined;
    const payload = (props?.payload ?? []) as TooltipPayloadEntry[];
    if (!active || payload.length === 0) return null;
    return (
      <ChartTooltipCard
        active={active}
        heading={label !== undefined ? String(label) : undefined}
        rows={payload.map((entry) => ({
          label: String(entry.name ?? entry.dataKey ?? ""),
          value: formatValue(Number(entry.value) || 0, formatHint),
          color: entry.color ?? entry.stroke ?? entry.fill,
        }))}
      />
    );
  };
}

// ---------------------------------------------------------------------------
// Kind renderers
// ---------------------------------------------------------------------------

function KpiWidget({ widget, rows }: GeneratedWidgetProps) {
  if (rows.length === 0) {
    return (
      <div className="h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
        <EmptyNote message={NO_DATA_MESSAGE} />
      </div>
    );
  }
  const value = computeKpiValue(widget, rows);
  return <KpiCard label={widget.title} value={formatValue(value, widget.formatHint)} />;
}

function BarLikeWidget({
  widget,
  rows,
  preview,
  stacked,
  withTotalLine,
}: GeneratedWidgetProps & { stacked: boolean; withTotalLine: boolean }) {
  const palette = usePalette();
  const data = toChartData(widget, rows);
  const keys = seriesKeys(widget);

  if (data.length === 0 || keys.length === 0) {
    return (
      <ChartCard title={widget.title} expandable={!preview}>
        <EmptyNote message={NO_DATA_MESSAGE} />
      </ChartCard>
    );
  }

  const Chart = withTotalLine ? ComposedChart : BarChart;
  const maxLabelLength = Math.max(0, ...data.map((d) => String(d.label ?? "").length));
  // A time axis (e.g. stackedBarWithTotalLine's category = month) must stay
  // left-to-right regardless of period count or label length — flipping it
  // to horizontal bars would put time running down the y-axis, scrambling
  // the one thing a trend needs to read correctly.
  const isTimeSeries = isTemporalDimension(widget, rows);
  // Long or numerous category labels don't fit on a horizontal axis without
  // rotating (and rotated text still overlaps once labels get long enough),
  // so flip to horizontal bars instead — categories read naturally on the
  // y-axis and values extend along x.
  const horizontal = !isTimeSeries && (data.length > 5 || maxLabelLength > 10);
  const categoryAxisWidth = Math.min(180, Math.max(72, maxLabelLength * 6.5 + 16));
  const barRadius: [number, number, number, number] = horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0];

  return (
    <ChartCard title={widget.title} expandable={!preview}>
      <FullscreenResponsiveContainer
        height={horizontal ? Math.max(260, data.length * 38 + 40) : isTimeSeries ? 360 : 300}
      >
        <Chart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
        >
          <CartesianGrid horizontal={!horizontal} vertical={horizontal} stroke={palette.ink.grid} />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatValue(v, widget.formatHint)}
                stroke={palette.ink.baseline}
                tick={{ fill: palette.ink.muted, fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                stroke={palette.ink.baseline}
                tick={{ fill: palette.ink.muted, fontSize: 11 }}
                tickLine={false}
                interval={0}
                width={categoryAxisWidth}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="label"
                stroke={palette.ink.baseline}
                tick={{ fill: palette.ink.muted, fontSize: 11 }}
                tickLine={false}
                interval={0}
              />
              <YAxis
                tickFormatter={(v: number) => formatValue(v, widget.formatHint)}
                stroke={palette.ink.baseline}
                tick={{ fill: palette.ink.muted, fontSize: 11 }}
                tickLine={false}
                width={56}
              />
            </>
          )}
          <Tooltip content={seriesTooltip(widget.formatHint)} cursor={{ fill: palette.ink.grid, opacity: 0.4 }} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: palette.ink.muted }}
            formatter={(value: string) => <span style={{ color: palette.ink.muted }}>{value}</span>}
          />
          {keys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              name={key}
              stackId={stacked ? "stack" : undefined}
              fill={palette.colorForIndex(index)}
              radius={!stacked || index === keys.length - 1 ? barRadius : undefined}
            />
          ))}
          {withTotalLine && (
            <Line
              type="monotone"
              dataKey="__total"
              name="Total"
              stroke={palette.ink.primary}
              strokeWidth={2}
              dot={{ r: 3, fill: palette.ink.primary }}
              isAnimationActive={false}
            />
          )}
        </Chart>
      </FullscreenResponsiveContainer>
    </ChartCard>
  );
}

/**
 * Bar-plus-cumulative-% line. The one other bar+line combination the
 * planning rules allow alongside `stackedBarWithTotalLine`, and for the same
 * reason: the line is a second encoding of the SAME measure (its own running
 * share of the grand total), not an independent second measure, so this
 * isn't the dual-axis chart the hard rules ban.
 */
function ParetoWidget({ widget, rows, preview }: GeneratedWidgetProps) {
  const palette = usePalette();
  // The ranking must be strictly value-descending for the cumulative line to
  // mean anything — re-sort defensively rather than trust widget.sort.
  const data = toChartData(widget, rows).slice().sort((a, b) => b.__total - a.__total);
  const keys = seriesKeys(widget);
  const grandTotal = computeKpiValue(widget, rows);

  if (data.length === 0 || keys.length === 0) {
    return (
      <ChartCard title={widget.title} expandable={!preview}>
        <EmptyNote message={NO_DATA_MESSAGE} />
      </ChartCard>
    );
  }

  // Non-mutating running sum (a prefix-sum array via reduce, rather than a
  // reassigned accumulator) — a plain `let running; running += ...` loop
  // trips the react-hooks lint rule against mutating a render-scoped variable.
  const cumulative = data.reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + d.__total], []);
  const points = data.map((d, index) => ({
    ...d,
    __cumPct: grandTotal > 0 ? (cumulative[index] / grandTotal) * 100 : 0,
  }));
  const barName = keys.length === 1 ? keys[0] : widget.title;
  const maxLabelLength = Math.max(0, ...points.map((d) => String(d.label ?? "").length));
  // Unlike BarLikeWidget, a Pareto never flips to horizontal bars when labels
  // are long — the cumulative line's left-to-right climb is the whole point,
  // so long labels get rotated instead of the chart re-oriented.
  const rotateLabels = maxLabelLength > 10;

  return (
    <ChartCard title={widget.title} expandable={!preview}>
      <FullscreenResponsiveContainer height={360}>
        <ComposedChart data={points} margin={{ top: 8, right: 16, bottom: rotateLabels ? 28 : 8, left: 0 }}>
          <CartesianGrid vertical={false} stroke={palette.ink.grid} />
          <XAxis
            dataKey="label"
            stroke={palette.ink.baseline}
            tick={{ fill: palette.ink.muted, fontSize: 11 }}
            tickLine={false}
            interval={0}
            angle={rotateLabels ? -30 : 0}
            textAnchor={rotateLabels ? "end" : "middle"}
            height={rotateLabels ? 48 : 30}
          />
          <YAxis
            yAxisId="value"
            tickFormatter={(v: number) => formatValue(v, widget.formatHint)}
            stroke={palette.ink.baseline}
            tick={{ fill: palette.ink.muted, fontSize: 11 }}
            tickLine={false}
            width={56}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            stroke={palette.ink.baseline}
            tick={{ fill: palette.ink.muted, fontSize: 11 }}
            tickLine={false}
            width={44}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const point = payload[0]?.payload as (typeof points)[number] | undefined;
              if (!point) return null;
              return (
                <ChartTooltipCard
                  active={active}
                  heading={label !== undefined ? String(label) : undefined}
                  rows={[
                    {
                      label: barName,
                      value: formatValue(point.__total, widget.formatHint),
                      color: palette.colorForIndex(0),
                    },
                    {
                      label: "Cumulative",
                      value: `${point.__cumPct.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`,
                      color: palette.ink.primary,
                    },
                  ]}
                />
              );
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: palette.ink.muted }}
            formatter={(value: string) => <span style={{ color: palette.ink.muted }}>{value}</span>}
          />
          <Bar
            yAxisId="value"
            dataKey="__total"
            name={barName}
            fill={palette.colorForIndex(0)}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="__cumPct"
            name="Cumulative %"
            stroke={palette.ink.primary}
            strokeWidth={2}
            dot={{ r: 3, fill: palette.ink.primary }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </FullscreenResponsiveContainer>
    </ChartCard>
  );
}

/**
 * Running-total bridge: a transparent "base" bar stacked under a colored
 * "delta" bar per category, so each visible segment floats at its correct
 * cumulative height — the standard way to fake a floating bar in a stacked-
 * bar renderer. Colored by sign (increase/decrease) rather than category,
 * since a bridge's story is the direction of each step, not series identity.
 */
function WaterfallWidget({ widget, rows, preview }: GeneratedWidgetProps) {
  const palette = usePalette();
  const data = toChartData(widget, rows);

  if (data.length === 0) {
    return (
      <ChartCard title={widget.title} expandable={!preview}>
        <EmptyNote message={NO_DATA_MESSAGE} />
      </ChartCard>
    );
  }

  // A bridge is only legible as one running number — collapse whatever the
  // series produced (expected to be a single measure already) into __total.
  // Non-mutating prefix sum, same reasoning as ParetoWidget above: no
  // reassigned render-scoped accumulator.
  const cumulative = data.reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + d.__total], []);
  const bars = data.map((d, index) => {
    const delta = d.__total;
    const start = index === 0 ? 0 : cumulative[index - 1];
    const end = cumulative[index];
    return {
      label: d.label,
      __delta: Math.abs(delta),
      __base: Math.min(start, end),
      __end: end,
      __isIncrease: delta >= 0,
    };
  });

  const increaseColor = palette.categorical.blue;
  const decreaseColor = palette.categorical.red;

  return (
    <ChartCard title={widget.title} expandable={!preview}>
      {/* A manual increase/decrease legend, not Recharts' <Legend> — this
          repo's Recharts version doesn't expose a `payload` prop for a
          legend with no real per-series dataKey behind it (color here is
          per-bar sign, not per-series). Placed BEFORE the chart, matching
          this codebase's existing "caption precedes the chart" convention
          (see globals.css's `[data-fullscreen-chart]` notes) so fullscreen's
          generic last-child-grows cascade still lands on the chart. */}
      <div className="mb-2 flex shrink-0 items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: increaseColor }} />
          Increase
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: decreaseColor }} />
          Decrease
        </span>
      </div>
      <FullscreenResponsiveContainer height={360}>
        <ComposedChart data={bars} margin={{ top: 20, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid vertical={false} stroke={palette.ink.grid} />
          <XAxis
            dataKey="label"
            stroke={palette.ink.baseline}
            tick={{ fill: palette.ink.muted, fontSize: 11 }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => formatValue(v, widget.formatHint)}
            stroke={palette.ink.baseline}
            tick={{ fill: palette.ink.muted, fontSize: 11 }}
            tickLine={false}
            width={56}
          />
          <Tooltip
            content={({ active, payload }) => {
              const row = (payload?.[0]?.payload ?? null) as (typeof bars)[number] | null;
              if (!active || !row) return null;
              return (
                <ChartTooltipCard
                  active={active}
                  heading={row.label}
                  rows={[
                    {
                      label: "Change",
                      value: `${row.__isIncrease ? "+" : "−"}${formatValue(row.__delta, widget.formatHint)}`,
                      color: row.__isIncrease ? increaseColor : decreaseColor,
                    },
                    { label: "Running total", value: formatValue(row.__end, widget.formatHint) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="__base" stackId="bridge" fill="transparent" isAnimationActive={false} legendType="none" />
          <Bar
            dataKey="__delta"
            stackId="bridge"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
            legendType="none"
          >
            {bars.map((bar) => (
              <Cell key={bar.label} fill={bar.__isIncrease ? increaseColor : decreaseColor} />
            ))}
            <LabelList
              dataKey="__end"
              position="top"
              formatter={(value) => formatValue(Number(value) || 0, widget.formatHint)}
              fill={palette.ink.muted}
              fontSize={10}
            />
          </Bar>
        </ComposedChart>
      </FullscreenResponsiveContainer>
    </ChartCard>
  );
}

function LineLikeWidget({
  widget,
  rows,
  preview,
  area,
  stacked = false,
}: GeneratedWidgetProps & { area: boolean; stacked?: boolean }) {
  const palette = usePalette();
  const data = toChartData(widget, rows);
  const keys = seriesKeys(widget);

  if (data.length === 0 || keys.length === 0) {
    return (
      <ChartCard title={widget.title} expandable={!preview}>
        <EmptyNote message={NO_DATA_MESSAGE} />
      </ChartCard>
    );
  }

  const Chart = area ? AreaChart : LineChart;

  return (
    <ChartCard title={widget.title} expandable={!preview}>
      <FullscreenResponsiveContainer height={360}>
        <Chart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid vertical={false} stroke={palette.ink.grid} />
          <XAxis
            dataKey="label"
            stroke={palette.ink.baseline}
            tick={{ fill: palette.ink.muted, fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatValue(v, widget.formatHint)}
            stroke={palette.ink.baseline}
            tick={{ fill: palette.ink.muted, fontSize: 11 }}
            tickLine={false}
            width={56}
          />
          <Tooltip content={seriesTooltip(widget.formatHint)} cursor={{ stroke: palette.ink.baseline, strokeWidth: 1 }} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: palette.ink.muted }}
            formatter={(value: string) => <span style={{ color: palette.ink.muted }}>{value}</span>}
          />
          {keys.map((key, index) =>
            area ? (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stackId={stacked ? "stack" : undefined}
                stroke={palette.colorForIndex(index)}
                fill={palette.colorForIndex(index)}
                fillOpacity={stacked ? 0.85 : 0.25}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={palette.colorForIndex(index)}
                strokeWidth={2}
                dot={{ r: 2.5 }}
                isAnimationActive={false}
              />
            )
          )}
        </Chart>
      </FullscreenResponsiveContainer>
    </ChartCard>
  );
}

function DonutWidget({ widget, rows, preview }: GeneratedWidgetProps) {
  const palette = usePalette();
  const points = computeWidgetSeries(widget, rows).slice(0, DONUT_MAX_SLICES);

  if (points.length === 0) {
    return (
      <ChartCard title={widget.title} expandable={!preview}>
        <EmptyNote message={NO_DATA_MESSAGE} />
      </ChartCard>
    );
  }

  // Percentages are of the slices actually drawn (not the full unsliced
  // dataset) so they agree with what the pie itself shows — `points` is
  // already top-N'd to DONUT_MAX_SLICES with no "Other" bucket added back.
  const total = points.reduce((sum, point) => sum + point.value, 0);

  return (
    <ChartCard title={widget.title} expandable={!preview}>
      <FullscreenResponsiveContainer height={360}>
        <PieChart>
          <Pie
            data={points}
            dataKey="value"
            nameKey="label"
            innerRadius="45%"
            outerRadius="75%"
            paddingAngle={2}
            stroke={palette.ink.surface}
            strokeWidth={2}
          >
            {points.map((point, index) => (
              <Cell key={point.label} fill={palette.colorForIndex(index)} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              const row = (payload?.[0]?.payload ?? null) as { label: string; value: number } | null;
              if (!active || !row) return null;
              const pct = total > 0 ? (row.value / total) * 100 : 0;
              return (
                <ChartTooltipCard
                  active={active}
                  heading={row.label}
                  rows={[
                    { label: "Value", value: formatValue(row.value, widget.formatHint) },
                    { label: "Share", value: `${pct.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%` },
                  ]}
                />
              );
            }}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            wrapperStyle={{ fontSize: 11, color: palette.ink.muted }}
            // recharts' LegendPayload.payload is typed `object`; runtime shape here is always this
            // chart's own SeriesPoint (see recharts' selectPieLegend, which passes the Pie's own datum
            // through as `payload` untouched).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: string, entry: any) => {
              const point = entry?.payload as { value: number } | undefined;
              const pct = point && total > 0 ? (point.value / total) * 100 : 0;
              return (
                <span style={{ color: palette.ink.muted }}>
                  {value} ({pct.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%)
                </span>
              );
            }}
          />
        </PieChart>
      </FullscreenResponsiveContainer>
    </ChartCard>
  );
}

/** One heatmap grid row: a sticky row-label cell plus one colored value cell
 * per column. Returns a Fragment (no wrapper element) so each cell lands as
 * its own direct child of the parent CSS grid — that's what makes the grid's
 * auto row/column placement line up across rows. */
function HeatmapRow({
  point,
  columns,
  values,
  palette,
  formatHints,
  tFor,
}: {
  point: SeriesPoint;
  columns: string[];
  values: number[];
  palette: ChartPalette;
  formatHints: WidgetSpec["formatHint"][];
  tFor: (value: number, columnIndex: number) => number;
}) {
  return (
    <>
      <div
        title={point.label}
        className="sticky left-0 z-10 truncate bg-white px-2 py-1.5 font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        {point.label}
      </div>
      {values.map((value, index) => {
        const t = tFor(value, index);
        const bg = palette.sequential(t);
        const text = palette.sequentialText(t);
        const formatHint = formatHints[index];
        return (
          <div key={columns[index]} className="group relative p-1">
            {/* CSS grid stretches each grid item to its row's height by
                default, so this fills the cell with no flex/height classes
                needed. */}
            <div
              className="flex h-full w-full items-center justify-center rounded px-1 py-1.5 text-xs tabular-nums"
              style={{ backgroundColor: bg, color: text }}
            >
              {formatValue(value, formatHint)}
            </div>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden -translate-x-1/2 group-hover:block">
              <ChartTooltipCard
                active
                heading={point.label}
                rows={[{ label: columns[index], value: formatValue(value, formatHint), color: bg }]}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Min↔max gradient strip so the sequential fill has a legible scale — the
 * heatmap's cells are direct-labeled with their own value, but "what does
 * dark blue mean" still needs an answer. */
function HeatmapLegend({
  palette,
  min,
  max,
  formatHint,
}: {
  palette: ChartPalette;
  min: number;
  max: number;
  formatHint: WidgetSpec["formatHint"];
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-1 pb-2 text-xs text-slate-500 dark:text-slate-400">
      <span>{formatValue(min, formatHint)}</span>
      <div
        className="h-2 flex-1 rounded-full"
        style={{
          background: `linear-gradient(to right, ${palette.sequential(0)}, ${palette.sequential(0.5)}, ${palette.sequential(1)})`,
        }}
      />
      <span>{formatValue(max, formatHint)}</span>
    </div>
  );
}

/** This widget's own formatting hint for one column, independent of column
 * index for a `pivot` series (every column there is the same measure) but
 * per-column for a `measures` series (every column is a different measure,
 * potentially a different unit) — falls back to the widget-level hint when
 * the model left a `MeasureRef`'s own hint unset. */
function formatHintForColumn(widget: WidgetSpec, columnIndex: number): WidgetSpec["formatHint"] {
  if (widget.series.type === "pivot") return widget.series.measure.formatHint ?? widget.formatHint;
  return widget.series.items[columnIndex]?.formatHint ?? widget.formatHint;
}

function statsFor(values: number[]): { min: number; max: number; span: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, span: max - min };
}

/**
 * Dimension × series matrix, colored by magnitude. Plain CSS grid rather than
 * a Recharts chart — there's no Recharts primitive for this shape, and the
 * usual workaround (a ScatterChart with categorical axes and a custom rect
 * shape) loses sticky row/column labels and precise cell sizing for no real
 * gain here.
 *
 * The two SeriesSpec shapes get genuinely different scale treatment, not the
 * same code path: a `pivot` series' columns are all the SAME measure (e.g.
 * category-by-month spend), so one shared scale across the whole grid is
 * correct — it's what lets a reader spot "March was the biggest month" by
 * color alone. A `measures` series' columns are DIFFERENT measures with
 * different units (a scorecard: on-time %, defect rate, spend) — sharing one
 * scale there would let whichever measure has the largest raw magnitude
 * (almost always spend) swamp the others into a uniform, uninformative near-
 * white column, hiding real variation the other measures actually have. So a
 * `measures` heatmap gets its own min/max PER COLUMN instead, and skips the
 * single min↔max legend entirely — a legend implies one scale, and showing
 * one here would just reintroduce the same "one number for many units"
 * problem in miniature. Each cell already prints its own value, formatted
 * per-column too (see formatHintForColumn), so nothing is lost by dropping it.
 */
function HeatmapWidget({ widget, rows, preview }: GeneratedWidgetProps) {
  const palette = usePalette();
  const points = computeWidgetSeries(widget, rows);
  const columns = seriesKeys(widget);

  if (points.length === 0 || columns.length === 0) {
    return (
      <ChartCard title={widget.title} expandable={!preview}>
        <EmptyNote message={NO_DATA_MESSAGE} />
      </ChartCard>
    );
  }

  // `breakdown` is built from the same `values`/`items` array as `columns`,
  // in the same order (see compute.ts), so a positional zip is safe here.
  const cellValues = points.map((point) => columns.map((_, index) => point.breakdown[index]?.value ?? 0));
  const isScorecard = widget.series.type === "measures";
  const sharedStats = statsFor(cellValues.flat());
  const columnStats = isScorecard
    ? columns.map((_, colIndex) => statsFor(cellValues.map((row) => row[colIndex])))
    : columns.map(() => sharedStats);
  const tFor = (value: number, colIndex: number) => {
    const { min, span } = columnStats[colIndex];
    return span > 0 ? (value - min) / span : 0.5;
  };
  const formatHints = columns.map((_, colIndex) => formatHintForColumn(widget, colIndex));

  return (
    <ChartCard title={widget.title} expandable={!preview}>
      <div className="flex h-full flex-col">
        {/* Legend precedes the scroller (not after) so fullscreen's generic
            "last child grows" cascade — see globals.css — targets the
            scroller, not this fixed-height caption row. */}
        {!isScorecard && (
          <HeatmapLegend
            palette={palette}
            min={sharedStats.min}
            max={sharedStats.max}
            formatHint={formatHints[0]}
          />
        )}
        <div className="fullscreen-scroll-list max-h-[320px] flex-1 overflow-auto">
          <HeatmapGridMatrix
            columns={columns}
            points={points}
            cellValues={cellValues}
            palette={palette}
            formatHints={formatHints}
            tFor={tFor}
          />
        </div>
      </div>
    </ChartCard>
  );
}

/**
 * The `.fullscreen-grid-matrix` grid itself, split out of `HeatmapWidget` so
 * `useIsFullscreenChart()` is called from inside the tree ChartCard duplicates
 * (inline copy + overlay copy) rather than from `HeatmapWidget`, which is the
 * component that calls `<ChartCard>` — see that hook's doc comment in
 * fullscreen-overlay.tsx for why calling it one level too high always reads
 * `false`. globals.css's `.fullscreen-grid-matrix` rule lets this grid's own
 * box grow to fill the fullscreen overlay, but growing the box doesn't grow
 * its rows unless their track sizing says to; a dynamic `1fr` row list here
 * does that, the same job `FullscreenResponsiveContainer` does for Recharts
 * via a numeric height prop.
 */
function HeatmapGridMatrix({
  columns,
  points,
  cellValues,
  palette,
  formatHints,
  tFor,
}: {
  columns: string[];
  points: SeriesPoint[];
  cellValues: number[][];
  palette: ChartPalette;
  formatHints: WidgetSpec["formatHint"][];
  tFor: (value: number, columnIndex: number) => number;
}) {
  const isFullscreen = useIsFullscreenChart();
  return (
    <div
      className="fullscreen-grid-matrix inline-grid min-w-full text-xs"
      style={{
        gridTemplateColumns: `minmax(120px, auto) repeat(${columns.length}, minmax(72px, 1fr))`,
        ...(isFullscreen && { gridTemplateRows: `auto repeat(${points.length}, minmax(32px, 1fr))` }),
      }}
    >
      <div className="sticky left-0 top-0 z-20 bg-white dark:bg-slate-900" />
      {columns.map((col) => (
        <div
          key={col}
          title={col}
          className="sticky top-0 z-10 truncate bg-white px-2 py-2 text-center font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400"
        >
          {col}
        </div>
      ))}
      {points.map((point, rowIndex) => (
        <HeatmapRow
          key={point.label}
          point={point}
          columns={columns}
          values={cellValues[rowIndex]}
          palette={palette}
          formatHints={formatHints}
          tFor={tFor}
        />
      ))}
    </div>
  );
}

function TableWidget({ widget, rows, preview }: GeneratedWidgetProps) {
  const points = computeWidgetSeries(widget, rows);

  if (points.length === 0) {
    return (
      <ChartCard title={widget.title} expandable={!preview}>
        <EmptyNote message={NO_DATA_MESSAGE} />
      </ChartCard>
    );
  }

  return (
    <ChartCard title={widget.title} expandable={!preview}>
      <div className="flex h-full flex-col gap-2">
        <div className="flex shrink-0 justify-end">
          <Button size="sm" variant="outline" onClick={() => exportTableCsv(widget, points)}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
        <div className="fullscreen-scroll-list max-h-[320px] flex-1 overflow-y-auto">
          <table className="fullscreen-natural-table w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr>
                <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Label
                </th>
                <th className="pb-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Value
                </th>
                <th className="pb-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Count
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.label} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">{point.label}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-slate-900 dark:text-slate-100">
                    {formatValue(point.value, widget.formatHint)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{point.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function GeneratedWidget({ widget, rows, preview }: GeneratedWidgetProps) {
  switch (widget.kind) {
    case "kpi":
      // KpiWidget renders a KpiCard, not a ChartCard — nothing to expand, so
      // `preview` has no bearing on it.
      return <KpiWidget widget={widget} rows={rows} />;
    case "bar":
    case "groupedBar":
      return <BarLikeWidget widget={widget} rows={rows} preview={preview} stacked={false} withTotalLine={false} />;
    case "stackedBar":
      return <BarLikeWidget widget={widget} rows={rows} preview={preview} stacked withTotalLine={false} />;
    case "stackedBarWithTotalLine":
      return <BarLikeWidget widget={widget} rows={rows} preview={preview} stacked withTotalLine />;
    case "pareto":
      return <ParetoWidget widget={widget} rows={rows} preview={preview} />;
    case "line":
      return <LineLikeWidget widget={widget} rows={rows} preview={preview} area={false} />;
    case "area":
      return <LineLikeWidget widget={widget} rows={rows} preview={preview} area />;
    case "stackedArea":
      return <LineLikeWidget widget={widget} rows={rows} preview={preview} area stacked />;
    case "donut":
      return <DonutWidget widget={widget} rows={rows} preview={preview} />;
    case "heatmap":
      return <HeatmapWidget widget={widget} rows={rows} preview={preview} />;
    case "waterfall":
      return <WaterfallWidget widget={widget} rows={rows} preview={preview} />;
    case "table":
      return <TableWidget widget={widget} rows={rows} preview={preview} />;
    default:
      // Exhaustive over ChartKind — unreachable, but keeps rendering graceful
      // if a future kind is added to the type without a renderer here.
      return (
        <ChartCard title="Unsupported widget">
          <EmptyNote message="Unsupported widget kind." />
        </ChartCard>
      );
  }
}
