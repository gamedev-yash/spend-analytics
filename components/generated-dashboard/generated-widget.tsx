"use client";

import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
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
import { FullscreenResponsiveContainer } from "@/components/dashboard/fullscreen-overlay";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { computeKpiValue, computeWidgetSeries } from "@/lib/generated-dashboard/compute";
import type { WidgetSpec } from "@/types/generated-dashboard";

// Renders one AI-planned widget spec against the dataset's raw rows. Pure
// presentation over lib/generated-dashboard/compute.ts's pure aggregation —
// this file only decides how to draw what compute.ts already produced.

interface GeneratedWidgetProps {
  widget: WidgetSpec;
  rows: Record<string, unknown>[];
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
  stacked,
  withTotalLine,
}: GeneratedWidgetProps & { stacked: boolean; withTotalLine: boolean }) {
  const palette = usePalette();
  const data = toChartData(widget, rows);
  const keys = seriesKeys(widget);

  if (data.length === 0 || keys.length === 0) {
    return (
      <ChartCard title={widget.title}>
        <EmptyNote message={NO_DATA_MESSAGE} />
      </ChartCard>
    );
  }

  const Chart = withTotalLine ? ComposedChart : BarChart;
  const maxLabelLength = Math.max(0, ...data.map((d) => String(d.label ?? "").length));
  // Long or numerous category labels don't fit on a horizontal axis without
  // rotating (and rotated text still overlaps once labels get long enough),
  // so flip to horizontal bars instead — categories read naturally on the
  // y-axis and values extend along x.
  const horizontal = data.length > 5 || maxLabelLength > 10;
  const categoryAxisWidth = Math.min(180, Math.max(72, maxLabelLength * 6.5 + 16));
  const barRadius: [number, number, number, number] = horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0];

  return (
    <ChartCard title={widget.title}>
      <FullscreenResponsiveContainer height={horizontal ? Math.max(260, data.length * 38 + 40) : 300}>
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
              maxBarSize={40}
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

function LineLikeWidget({ widget, rows, area }: GeneratedWidgetProps & { area: boolean }) {
  const palette = usePalette();
  const data = toChartData(widget, rows);
  const keys = seriesKeys(widget);

  if (data.length === 0 || keys.length === 0) {
    return (
      <ChartCard title={widget.title}>
        <EmptyNote message={NO_DATA_MESSAGE} />
      </ChartCard>
    );
  }

  const Chart = area ? AreaChart : LineChart;

  return (
    <ChartCard title={widget.title}>
      <FullscreenResponsiveContainer height={300}>
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
                stroke={palette.colorForIndex(index)}
                fill={palette.colorForIndex(index)}
                fillOpacity={0.25}
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

function DonutWidget({ widget, rows }: GeneratedWidgetProps) {
  const palette = usePalette();
  const points = computeWidgetSeries(widget, rows).slice(0, DONUT_MAX_SLICES);

  if (points.length === 0) {
    return (
      <ChartCard title={widget.title}>
        <EmptyNote message={NO_DATA_MESSAGE} />
      </ChartCard>
    );
  }

  return (
    <ChartCard title={widget.title}>
      <FullscreenResponsiveContainer height={280}>
        <PieChart>
          <Pie
            data={points}
            dataKey="value"
            nameKey="label"
            innerRadius={62}
            outerRadius={100}
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
              return (
                <ChartTooltipCard
                  active={active}
                  heading={row.label}
                  rows={[{ label: "Value", value: formatValue(row.value, widget.formatHint) }]}
                />
              );
            }}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            wrapperStyle={{ fontSize: 11, color: palette.ink.muted }}
            formatter={(value: string) => <span style={{ color: palette.ink.muted }}>{value}</span>}
          />
        </PieChart>
      </FullscreenResponsiveContainer>
    </ChartCard>
  );
}

function TableWidget({ widget, rows }: GeneratedWidgetProps) {
  const points = computeWidgetSeries(widget, rows);

  if (points.length === 0) {
    return (
      <ChartCard title={widget.title}>
        <EmptyNote message={NO_DATA_MESSAGE} />
      </ChartCard>
    );
  }

  return (
    <ChartCard title={widget.title}>
      <div className="fullscreen-scroll-list max-h-[320px] overflow-y-auto">
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
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function GeneratedWidget({ widget, rows }: GeneratedWidgetProps) {
  switch (widget.kind) {
    case "kpi":
      return <KpiWidget widget={widget} rows={rows} />;
    case "bar":
    case "groupedBar":
      return <BarLikeWidget widget={widget} rows={rows} stacked={false} withTotalLine={false} />;
    case "stackedBar":
      return <BarLikeWidget widget={widget} rows={rows} stacked withTotalLine={false} />;
    case "stackedBarWithTotalLine":
      return <BarLikeWidget widget={widget} rows={rows} stacked withTotalLine />;
    case "line":
      return <LineLikeWidget widget={widget} rows={rows} area={false} />;
    case "area":
      return <LineLikeWidget widget={widget} rows={rows} area />;
    case "donut":
      return <DonutWidget widget={widget} rows={rows} />;
    case "table":
      return <TableWidget widget={widget} rows={rows} />;
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
