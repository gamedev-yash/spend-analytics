"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { SapCategoryRow } from "../tailSpendMock";
import { formatINR, formatCompactNumber } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";

interface CategorySpendChartProps {
  categories: SapCategoryRow[];
}

/**
 * SAP standard widget — categories ranked by spend for the selected invoice
 * value buckets. Single series, one hue, mirroring the Supplier Ranking
 * widget it sits beside.
 */
export function CategorySpendChart({ categories }: CategorySpendChartProps) {
  const theme = useTailSpendTheme();
  const sorted = [...categories].sort((a, b) => b.spend - a.spend);

  return (
    <ResponsiveContainer width="100%" height={280}>
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
                  { label: "Spend", value: formatINR(row.spend) },
                  { label: "Suppliers", value: formatCompactNumber(row.supplierCount) },
                ]}
              />
            );
          }}
          cursor={{ fill: theme.tooltipCursorFill }}
        />
        <Bar dataKey="spend" name="Spend" fill={theme.paretoBarColor} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
