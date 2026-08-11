"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { formatCrINR, type TopSupplierShare } from "../supplierMock";

interface TopSupplierParetoChartProps {
  suppliers: TopSupplierShare[];
}

function shortName(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

/** Top-10 suppliers by spend with the cumulative share curve — how concentrated the head is. */
export function TopSupplierParetoChart({ suppliers }: TopSupplierParetoChartProps) {
  const palette = usePalette();

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={suppliers} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <defs>
          <linearGradient id="grad-topSupplierPareto" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={palette.categorical.blue} stopOpacity={0.95} />
            <stop offset="95%" stopColor={palette.categorical.blue} stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={palette.ink.grid} />
        <XAxis
          dataKey="supplier"
          interval={0}
          angle={-30}
          textAnchor="end"
          height={72}
          tickFormatter={shortName}
          stroke={palette.ink.muted}
          tick={{ fontSize: 10, fill: palette.ink.muted }}
        />
        <YAxis
          yAxisId="spend"
          tickFormatter={(v) => `₹${v} Cr`}
          stroke={palette.ink.muted}
          tick={{ fontSize: 11, fill: palette.ink.muted }}
          width={64}
        />
        <YAxis
          yAxisId="cumulative"
          orientation="right"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          stroke={palette.ink.muted}
          tick={{ fontSize: 11, fill: palette.ink.muted }}
          width={44}
        />
        <Tooltip
          content={({ active, payload }) => {
            const row = (payload?.[0]?.payload ?? null) as TopSupplierShare | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={row.supplier}
                rows={[
                  { label: "Spend", value: formatCrINR(row.spendCr), color: palette.categorical.blue },
                  { label: "Cumulative share", value: `${row.cumulativePercent}%`, color: palette.categorical.orange },
                ]}
              />
            );
          }}
          cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
        />
        <Bar yAxisId="spend" dataKey="spendCr" fill="url(#grad-topSupplierPareto)" radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="cumulative"
          dataKey="cumulativePercent"
          stroke={palette.categorical.orange}
          strokeWidth={2}
          dot={{ r: 3, fill: palette.categorical.orange }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
