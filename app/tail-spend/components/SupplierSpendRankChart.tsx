"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { SupplierSpendRank } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { useIsFullscreenChart } from "@/components/dashboard/fullscreen-overlay";

interface SupplierSpendRankChartProps {
  suppliers: SupplierSpendRank[];
}

/**
 * SAP standard widget — top suppliers (Global Ultimate) ranked by total spend
 * for the currently selected value buckets. Single series, one hue.
 */
export function SupplierSpendRankChart({ suppliers }: SupplierSpendRankChartProps) {
  const theme = useTailSpendTheme();
  const isFullscreen = useIsFullscreenChart();
  const sorted = [...suppliers].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 280}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
        barCategoryGap="24%"
      >
        <CartesianGrid horizontal={false} stroke={theme.gridline} />
        <XAxis
          type="number"
          tickFormatter={(v) => formatINR(v)}
          stroke={theme.axisLine}
          tick={{ fill: theme.textMuted, fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="supplierName"
          width={168}
          stroke={theme.axisLine}
          tick={{ fill: theme.textMuted, fontSize: 11 }}
          tickLine={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            const row = (payload?.[0]?.payload ?? null) as SupplierSpendRank | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={row.supplierName}
                rows={[{ label: "Spend", value: formatINR(row.totalSpend) }]}
              />
            );
          }}
          cursor={{ fill: theme.tooltipCursorFill }}
        />
        <Bar dataKey="totalSpend" name="Total Spend" fill={theme.paretoBarColor} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
