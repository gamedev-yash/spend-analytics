"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { MonthlyTrendPoint, SpendSegment } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { usePalette } from "@/hooks/use-palette";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { useIsFullscreenChart } from "@/components/dashboard/fullscreen-overlay";

interface TailTrendChartProps {
  months: MonthlyTrendPoint[];
}

const SEGMENT_KEYS: Array<{ key: "strategicSpend" | "coreSpend" | "tailSpend"; segment: SpendSegment }> = [
  { key: "strategicSpend", segment: "Strategic" },
  { key: "coreSpend", segment: "Core" },
  { key: "tailSpend", segment: "Tail" },
];

/** Drops the year from a "Aug 2025"-style label — the tooltip still carries the full month. */
function shortMonth(month: string): string {
  return month.split(" ")[0];
}

/**
 * Stacked area over the trailing 12 months, streamlined to a light, minimal
 * read: flat month labels, a sparse Y-axis, thin strokes, and a compact
 * legend. Tail spend climbs steadily while strategic/core swing with capex
 * cycles — the point is that tail is a structural drag, not a one-off.
 */
export function TailTrendChart({ months }: TailTrendChartProps) {
  const theme = useTailSpendTheme();
  const palette = usePalette();
  const isFullscreen = useIsFullscreenChart();

  return (
    <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 300}>
      <AreaChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {SEGMENT_KEYS.map(({ key, segment }) => (
            <linearGradient key={key} id={`grad-tailTrend${segment}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme.segmentColor[segment]} stopOpacity={0.85} />
              <stop offset="95%" stopColor={theme.segmentColor[segment]} stopOpacity={0.15} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke={theme.gridline} />
        <XAxis
          dataKey="month"
          tickFormatter={shortMonth}
          stroke={theme.axisLine}
          axisLine={false}
          tick={{ fill: theme.textMuted, fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatINR(v)}
          stroke={theme.axisLine}
          axisLine={false}
          tick={{ fill: theme.textMuted, fontSize: 11 }}
          tickLine={false}
          tickCount={4}
          width={52}
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
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: theme.textMuted }}
          formatter={(value) => <span style={{ color: theme.textMuted }}>{value}</span>}
        />
        {SEGMENT_KEYS.map(({ key, segment }) => (
          <Area
            key={key}
            dataKey={key}
            name={segment}
            stackId="spend"
            stroke={theme.segmentColor[segment]}
            strokeWidth={1.5}
            fill={palette.isDark ? `url(#grad-tailTrend${segment})` : theme.segmentColor[segment]}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
