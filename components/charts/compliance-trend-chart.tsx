"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPercent } from "@/lib/format";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import type { ComplianceTrendPoint } from "@/lib/aggregate-compliance";

interface ComplianceTrendChartProps {
  data: ComplianceTrendPoint[];
  targetPercent?: number;
}

/** Single series, one $/percent axis, with a target reference line (not a gridline). */
export function ComplianceTrendChart({ data, targetPercent = 90 }: ComplianceTrendChartProps) {
  const palette = usePalette();

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={palette.ink.grid} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={{ stroke: palette.ink.baseline }}
          tick={{ fill: palette.ink.muted, fontSize: 12 }}
        />
        <YAxis
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          tick={{ fill: palette.ink.muted, fontSize: 12 }}
          tickFormatter={(v) => `${v}%`}
          width={40}
        />
        <ReferenceLine
          y={targetPercent}
          stroke={palette.ink.baseline}
          strokeDasharray="4 4"
          label={{ value: `Target ${targetPercent}%`, position: "insideTopRight", fill: palette.ink.muted, fontSize: 11 }}
        />
        <Tooltip
          content={({ active, label, payload }) => (
            <ChartTooltipCard
              active={active}
              heading={String(label)}
              rows={
                payload?.[0]
                  ? [
                      {
                        label: "Avg. overall compliance",
                        value: formatPercent(Number(payload[0].value)),
                        color: palette.categorical.blue,
                      },
                    ]
                  : []
              }
            />
          )}
        />
        <Line
          type="monotone"
          dataKey="avgOverallCompliance"
          name="Avg. overall compliance"
          stroke={palette.categorical.blue}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
