"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import type { ParetoDecile } from "../tailSpendMock";
import { formatCompactNumber } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { useIsFullscreenChart } from "@/components/dashboard/fullscreen-overlay";

interface ParetoCurveChartProps {
  deciles: ParetoDecile[];
  threshold?: number;
}

/**
 * Classic Pareto view, redrawn on a single 0-100 axis: both the bar (spend
 * share per supplier decile) and the line (cumulative spend %) are percentages,
 * so there's no second y-scale to invent a false alignment.
 */
export function ParetoCurveChart({ deciles, threshold = 80 }: ParetoCurveChartProps) {
  const theme = useTailSpendTheme();
  const isFullscreen = useIsFullscreenChart();
  const crossover = deciles.find((d) => d.cumulativeSpendPercent >= threshold);

  return (
    <div>
      {crossover && (
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Suppliers through{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">{crossover.decileLabel}</span> drive{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">{crossover.cumulativeSpendPercent}%</span> of
          total value — past the {threshold}% mark, the rest is tail.
        </p>
      )}
      <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 320}>
        <ComposedChart data={deciles} margin={{ top: 8, right: 16, bottom: 8, left: 0 }} barCategoryGap="20%">
          <defs>
            <linearGradient id="grad-paretoCurveBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme.paretoBarColor} stopOpacity={0.95} />
              <stop offset="95%" stopColor={theme.paretoBarColor} stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={theme.gridline} />
          <XAxis
            dataKey="decileLabel"
            stroke={theme.axisLine}
            tick={{ fill: theme.textMuted, fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke={theme.axisLine}
            tick={{ fill: theme.textMuted, fontSize: 12 }}
            tickLine={false}
            width={44}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              const row = (payload?.[0]?.payload ?? null) as ParetoDecile | null;
              if (!row) return null;
              return (
                <ChartTooltipCard
                  active={active}
                  heading={String(label)}
                  rows={[
                    { label: "Decile spend share", value: `${row.spendPercentOfTotal}%`, color: theme.paretoBarColor },
                    { label: "Suppliers", value: formatCompactNumber(row.supplierCount) },
                    { label: "Cumulative spend %", value: `${row.cumulativeSpendPercent}%`, color: theme.paretoLineColor },
                  ]}
                />
              );
            }}
            cursor={{ fill: theme.tooltipCursorFill }}
          />
          <ReferenceLine
            y={threshold}
            stroke={theme.paretoLineColor}
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{ value: `${threshold}%`, position: "insideTopLeft", fill: theme.paretoLineColor, fontSize: 11 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: theme.textMuted }}
            formatter={(value) => <span style={{ color: theme.textMuted }}>{value}</span>}
          />
          <Bar
            dataKey="spendPercentOfTotal"
            name="Decile spend share"
            fill="url(#grad-paretoCurveBar)"
            radius={[4, 4, 0, 0]}
          />
          <Line
            dataKey="cumulativeSpendPercent"
            name="Cumulative spend %"
            stroke={theme.paretoLineColor}
            strokeWidth={2}
            dot={{ r: 4, fill: theme.paretoLineColor, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: theme.chartSurface }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
