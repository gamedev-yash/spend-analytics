"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from "recharts";
import type { SapCategoryRow } from "../tailSpendMock";
import { formatCompactNumber } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { useIsFullscreenChart } from "@/components/dashboard/fullscreen-overlay";

interface CategorySpendChartProps {
  categories: SapCategoryRow[];
}

/** Categories shown before the rest fold away — keeps labels legible in a half-width grid card. */
const TOP_N = 7;

/** Comma-grouped, whole-crore label for this chart's bars/tooltip — e.g. ₹5,817 Cr. Category totals never dip below crore scale, so unlike the shared formatINR this doesn't need a lakh/rupee fallback. */
function formatCategorySpend(value: number): string {
  return `₹${Math.round(value / 1_00_00_000).toLocaleString("en-IN")} Cr`;
}

/**
 * SAP standard widget — top categories ranked by spend for the selected
 * invoice value buckets. Single series, one hue, mirroring the Supplier
 * Ranking widget it sits beside. Capped to the top categories, with the
 * spend value labelled directly on each bar, so it stays legible inside a
 * half-width grid card.
 */
export function CategorySpendChart({ categories }: CategorySpendChartProps) {
  const theme = useTailSpendTheme();
  const isFullscreen = useIsFullscreenChart();
  const sorted = [...categories].sort((a, b) => b.spend - a.spend).slice(0, TOP_N);

  return (
    <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 280}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 8, right: 64, bottom: 8, left: 8 }}
        barCategoryGap="24%"
      >
        <defs>
          <linearGradient id="grad-categorySpend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={theme.paretoBarColor} stopOpacity={0.95} />
            <stop offset="95%" stopColor={theme.paretoBarColor} stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <CartesianGrid horizontal={false} stroke={theme.gridline} />
        <XAxis
          type="number"
          tickFormatter={formatCategorySpend}
          stroke={theme.axisLine}
          tick={{ fill: theme.textMuted, fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          width={168}
          stroke={theme.axisLine}
          tick={{ fill: theme.textMuted, fontSize: 11 }}
          tickLine={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            const row = (payload?.[0]?.payload ?? null) as SapCategoryRow | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={row.category}
                rows={[
                  { label: "Suppliers", value: formatCompactNumber(row.supplierCount) },
                  { label: "Spend", value: formatCategorySpend(row.spend) },
                ]}
              />
            );
          }}
          cursor={{ fill: theme.tooltipCursorFill }}
        />
        <Bar dataKey="spend" name="Spend" fill="url(#grad-categorySpend)" radius={[0, 4, 4, 0]}>
          <LabelList
            dataKey="spend"
            position="right"
            formatter={(value) => formatCategorySpend(Number(value))}
            fill={theme.textMuted}
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
