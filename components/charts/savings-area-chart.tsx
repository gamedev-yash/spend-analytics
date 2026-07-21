"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsdCompact } from "@/lib/format";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";

interface SavingsAreaChartProps {
  data: { month: string; savings: number }[];
}

/** Single-series trend — sequential blue fill, no legend needed for one series. */
export function SavingsAreaChart({ data }: SavingsAreaChartProps) {
  const palette = usePalette();
  const gradientId = `savingsFill-${palette.isDark ? "dark" : "light"}`;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.categorical.blue} stopOpacity={0.32} />
            <stop offset="100%" stopColor={palette.categorical.blue} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={palette.ink.grid} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={{ stroke: palette.ink.baseline }}
          tick={{ fill: palette.ink.muted, fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: palette.ink.muted, fontSize: 12 }}
          tickFormatter={(v) => formatUsdCompact(v)}
          width={56}
        />
        <Tooltip
          content={({ active, label, payload }) => (
            <ChartTooltipCard
              active={active}
              heading={String(label)}
              rows={
                payload?.[0]
                  ? [{ label: "Savings", value: formatUsdCompact(Number(payload[0].value)), color: palette.categorical.blue }]
                  : []
              }
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="savings"
          stroke={palette.categorical.blue}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
