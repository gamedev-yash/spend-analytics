"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { MonthlyTrendPoint, SpendSegment } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";

interface TailTrendChartProps {
  months: MonthlyTrendPoint[];
}

const SEGMENT_KEYS: Array<{ key: "strategicSpend" | "coreSpend" | "tailSpend"; segment: SpendSegment }> = [
  { key: "strategicSpend", segment: "Strategic" },
  { key: "coreSpend", segment: "Core" },
  { key: "tailSpend", segment: "Tail" },
];

/**
 * Stacked area over the trailing 12 months. Tail spend climbs steadily while
 * strategic/core swing with capex cycles — the point is that tail is a
 * structural drag, not a one-off.
 */
export function TailTrendChart({ months }: TailTrendChartProps) {
  const theme = useTailSpendTheme();

  return (
    <ResponsiveContainer width="100%" height={340}>
      <AreaChart data={months} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.gridline} />
        <XAxis
          dataKey="month"
          stroke={theme.axisLine}
          tick={{ fill: theme.textMuted, fontSize: 11 }}
          tickLine={false}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={48}
        />
        <YAxis
          tickFormatter={(v) => formatINR(v)}
          stroke={theme.axisLine}
          tick={{ fill: theme.textMuted, fontSize: 12 }}
          tickLine={false}
          width={56}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            const row = (payload?.[0]?.payload ?? null) as MonthlyTrendPoint | null;
            if (!row) return null;
            const total = row.strategicSpend + row.coreSpend + row.tailSpend;
            return (
              <ChartTooltipCard
                active={active}
                heading={String(label)}
                rows={[
                  ...SEGMENT_KEYS.map(({ key, segment }) => ({
                    label: segment,
                    value: formatINR(row[key]),
                    color: theme.segmentColor[segment],
                  })),
                  { label: "Total", value: formatINR(total) },
                ]}
              />
            );
          }}
          cursor={{ stroke: theme.axisLine, strokeWidth: 1 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: theme.textMuted }}
          formatter={(value) => <span style={{ color: theme.textMuted }}>{value}</span>}
        />
        {SEGMENT_KEYS.map(({ key, segment }) => (
          <Area
            key={key}
            dataKey={key}
            name={segment}
            stackId="spend"
            stroke={theme.segmentColor[segment]}
            strokeWidth={2}
            fill={theme.segmentColor[segment]}
            fillOpacity={0.35}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
