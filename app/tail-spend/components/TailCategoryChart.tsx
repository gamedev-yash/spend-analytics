"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { CategoryTailBreakdown } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";

interface TailCategoryChartProps {
  categories: CategoryTailBreakdown[];
}

/**
 * Horizontal stacked bar, one row per category, ordered by tail-spend share so
 * the categories most worth consolidating surface at the top.
 */
export function TailCategoryChart({ categories }: TailCategoryChartProps) {
  const theme = useTailSpendTheme();
  const height = Math.max(320, categories.length * 44 + 40);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={categories}
        layout="vertical"
        margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
        barCategoryGap="28%"
      >
        <CartesianGrid horizontal={false} stroke={theme.gridline} />
        <XAxis
          type="number"
          tickFormatter={(v) => formatINR(v)}
          stroke={theme.axisLine}
          tick={{ fill: theme.textMuted, fontSize: 12 }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          width={210}
          stroke={theme.axisLine}
          tick={{ fill: theme.textMuted, fontSize: 12 }}
          tickLine={false}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            const row = (payload?.[0]?.payload ?? null) as CategoryTailBreakdown | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={String(label)}
                rows={[
                  { label: "Strategic", value: formatINR(row.strategicSpend), color: theme.segmentColor.Strategic },
                  { label: "Core", value: formatINR(row.coreSpend), color: theme.segmentColor.Core },
                  { label: "Tail", value: formatINR(row.tailSpend), color: theme.segmentColor.Tail },
                  { label: `Total (${row.tailPercent}% tail)`, value: formatINR(row.totalSpend) },
                ]}
              />
            );
          }}
          cursor={{ fill: theme.tooltipCursorFill }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: theme.textMuted }}
          formatter={(value) => <span style={{ color: theme.textMuted }}>{value}</span>}
        />
        <Bar
          dataKey="strategicSpend"
          name="Strategic"
          stackId="spend"
          fill={theme.segmentColor.Strategic}
          stroke={theme.chartSurface}
          strokeWidth={2}
          maxBarSize={24}
        />
        <Bar
          dataKey="coreSpend"
          name="Core"
          stackId="spend"
          fill={theme.segmentColor.Core}
          stroke={theme.chartSurface}
          strokeWidth={2}
          maxBarSize={24}
        />
        <Bar
          dataKey="tailSpend"
          name="Tail"
          stackId="spend"
          fill={theme.segmentColor.Tail}
          stroke={theme.chartSurface}
          strokeWidth={2}
          radius={[0, 4, 4, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
