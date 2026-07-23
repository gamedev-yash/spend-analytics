"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import type { MonthlyOnboarding } from "../supplierMock";

interface OnboardingTrendChartProps {
  months: MonthlyOnboarding[];
}

/** New suppliers onboarded per month, with the share that never transacted again. */
export function OnboardingTrendChart({ months }: OnboardingTrendChartProps) {
  const palette = usePalette();

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={months} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid vertical={false} stroke={palette.ink.grid} />
        <XAxis
          dataKey="month"
          interval={0}
          angle={-30}
          textAnchor="end"
          height={48}
          stroke={palette.ink.muted}
          tick={{ fontSize: 10, fill: palette.ink.muted }}
        />
        <YAxis
          yAxisId="count"
          allowDecimals={false}
          stroke={palette.ink.muted}
          tick={{ fontSize: 11, fill: palette.ink.muted }}
        />
        <YAxis
          yAxisId="share"
          orientation="right"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          stroke={palette.ink.muted}
          tick={{ fontSize: 11, fill: palette.ink.muted }}
          width={44}
        />
        <Tooltip
          content={({ active, payload }) => {
            const row = (payload?.[0]?.payload ?? null) as MonthlyOnboarding | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={row.month}
                rows={[
                  { label: "New suppliers", value: String(row.newSuppliers), color: palette.categorical.violet },
                  { label: "Single-use share", value: `${row.singleUseShare}%`, color: palette.categorical.yellow },
                ]}
              />
            );
          }}
          cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span style={{ color: palette.ink.muted }}>{value}</span>} />
        <Bar
          yAxisId="count"
          dataKey="newSuppliers"
          name="New suppliers"
          fill={palette.categorical.violet}
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="share"
          dataKey="singleUseShare"
          name="Single-use share"
          stroke={palette.categorical.yellow}
          strokeWidth={2}
          dot={{ r: 3, fill: palette.categorical.yellow }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
