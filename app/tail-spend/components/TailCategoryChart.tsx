"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipContentProps,
} from "recharts";
import type { CategoryTailBreakdown } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { CHART_SURFACE, GRIDLINE, AXIS_LINE, TEXT_MUTED, SEGMENT_COLOR } from "../theme";

interface TailCategoryChartProps {
  categories: CategoryTailBreakdown[];
}

function CategoryTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as CategoryTailBreakdown | undefined;
  if (!row) return null;

  const rows: Array<{ key: "strategicSpend" | "coreSpend" | "tailSpend"; segment: string }> = [
    { key: "strategicSpend", segment: "Strategic" },
    { key: "coreSpend", segment: "Core" },
    { key: "tailSpend", segment: "Tail" },
  ];

  return (
    <div className="max-w-xs rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-slate-300">{label}</p>
      {rows.map(({ key, segment }) => (
        <p key={key} className="mt-1 text-xs text-slate-400">
          <span
            className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle"
            style={{ backgroundColor: SEGMENT_COLOR[segment as keyof typeof SEGMENT_COLOR] }}
          />
          {segment} · <span className="font-semibold text-slate-100">{formatINR(row[key])}</span>
        </p>
      ))}
      <p className="mt-1.5 border-t border-slate-700 pt-1.5 text-xs text-slate-400">
        Total <span className="font-semibold text-slate-100">{formatINR(row.totalSpend)}</span> ·{" "}
        <span className="font-semibold text-amber-400">{row.tailPercent}% tail</span>
      </p>
    </div>
  );
}

/**
 * Horizontal stacked bar, one row per category, ordered by tail-spend share so
 * the categories most worth consolidating surface at the top.
 */
export function TailCategoryChart({ categories }: TailCategoryChartProps) {
  const height = Math.max(320, categories.length * 44 + 40);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={categories}
        layout="vertical"
        margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
        barCategoryGap="28%"
      >
        <CartesianGrid horizontal={false} stroke={GRIDLINE} />
        <XAxis
          type="number"
          tickFormatter={(v) => formatINR(v)}
          stroke={AXIS_LINE}
          tick={{ fill: TEXT_MUTED, fontSize: 12 }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          width={210}
          stroke={AXIS_LINE}
          tick={{ fill: TEXT_MUTED, fontSize: 12 }}
          tickLine={false}
        />
        <Tooltip content={(props) => <CategoryTooltip {...props} />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: TEXT_MUTED }}
          formatter={(value) => <span style={{ color: TEXT_MUTED }}>{value}</span>}
        />
        <Bar
          dataKey="strategicSpend"
          name="Strategic"
          stackId="spend"
          fill={SEGMENT_COLOR.Strategic}
          stroke={CHART_SURFACE}
          strokeWidth={2}
          maxBarSize={24}
        />
        <Bar
          dataKey="coreSpend"
          name="Core"
          stackId="spend"
          fill={SEGMENT_COLOR.Core}
          stroke={CHART_SURFACE}
          strokeWidth={2}
          maxBarSize={24}
        />
        <Bar
          dataKey="tailSpend"
          name="Tail"
          stackId="spend"
          fill={SEGMENT_COLOR.Tail}
          stroke={CHART_SURFACE}
          strokeWidth={2}
          radius={[0, 4, 4, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
