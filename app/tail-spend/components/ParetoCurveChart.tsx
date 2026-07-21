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
  type TooltipContentProps,
} from "recharts";
import type { ParetoDecile } from "../tailSpendMock";
import { formatCompactNumber } from "../tailSpendMock";
import { GRIDLINE, AXIS_LINE, TEXT_MUTED, PARETO_BAR_COLOR, PARETO_LINE_COLOR } from "../theme";

interface ParetoCurveChartProps {
  deciles: ParetoDecile[];
}

function ParetoTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as ParetoDecile | undefined;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-xs text-slate-400">
        <span className="mr-1.5 inline-block h-0.5 w-2.5 align-middle" style={{ backgroundColor: PARETO_BAR_COLOR }} />
        <span className="font-semibold text-slate-100">{row.spendPercentOfTotal}%</span> of spend ·{" "}
        {formatCompactNumber(row.supplierCount)} suppliers
      </p>
      <p className="mt-0.5 text-xs text-slate-400">
        <span className="mr-1.5 inline-block h-0.5 w-2.5 align-middle" style={{ backgroundColor: PARETO_LINE_COLOR }} />
        <span className="font-semibold text-slate-100">{row.cumulativeSpendPercent}%</span> cumulative
      </p>
    </div>
  );
}

/**
 * Classic Pareto view, redrawn on a single 0-100 axis: both the bar (spend
 * share per supplier decile) and the line (cumulative spend %) are percentages,
 * so there's no second y-scale to invent a false alignment.
 */
export function ParetoCurveChart({ deciles }: ParetoCurveChartProps) {
  const crossoverIndex = deciles.findIndex((d) => d.cumulativeSpendPercent >= 80);
  const crossover = deciles[crossoverIndex];

  return (
    <div>
      {crossover && (
        <p className="mb-3 text-sm text-slate-400">
          The top <span className="font-semibold text-slate-100">{crossover.decileLabel === "Top 10%" ? "10%" : "20%"}</span> of
          suppliers by spend drive <span className="font-semibold text-slate-100">{crossover.cumulativeSpendPercent}%</span> of
          total value — the rest is tail.
        </p>
      )}
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={deciles} margin={{ top: 8, right: 16, bottom: 8, left: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={GRIDLINE} />
          <XAxis
            dataKey="decileLabel"
            stroke={AXIS_LINE}
            tick={{ fill: TEXT_MUTED, fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke={AXIS_LINE}
            tick={{ fill: TEXT_MUTED, fontSize: 12 }}
            tickLine={false}
            width={44}
          />
          <Tooltip content={(props) => <ParetoTooltip {...props} />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: TEXT_MUTED }}
            formatter={(value) => <span style={{ color: TEXT_MUTED }}>{value}</span>}
          />
          <Bar
            dataKey="spendPercentOfTotal"
            name="Decile spend share"
            fill={PARETO_BAR_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
          <Line
            dataKey="cumulativeSpendPercent"
            name="Cumulative spend %"
            stroke={PARETO_LINE_COLOR}
            strokeWidth={2}
            dot={{ r: 4, fill: PARETO_LINE_COLOR, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#0f172a" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
