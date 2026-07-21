"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import type { PieSectorShapeProps } from "recharts";
import { formatNumber } from "@/lib/format";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import type { RiskDistributionPoint } from "@/lib/aggregate-compliance";

interface RiskDonutChartProps {
  data: RiskDistributionPoint[];
}

/** Grows the hovered slice slightly outward — Recharts tracks hover state and passes `isActive` per sector. */
function HoverableSlice(props: PieSectorShapeProps) {
  const { isActive, outerRadius, ...rest } = props;
  const grown = (Number(outerRadius) || 0) + (isActive ? 6 : 0);
  return <Sector {...rest} outerRadius={grown} />;
}

/**
 * Part-to-whole, 3 segments, status color (never generic categorical) since
 * the field IS a state (Low/Medium/High risk), not an identity.
 */
export function RiskDonutChart({ data }: RiskDonutChartProps) {
  const palette = usePalette();

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="riskLevel"
          innerRadius={64}
          outerRadius={92}
          paddingAngle={2}
          strokeWidth={2}
          stroke="var(--card)"
          shape={HoverableSlice}
        >
          {data.map((d) => (
            <Cell key={d.riskLevel} fill={palette.riskColor[d.riskLevel]} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => (
            <ChartTooltipCard
              active={active}
              heading={payload?.[0]?.name ? `${payload[0].name} risk` : undefined}
              rows={
                payload?.[0]
                  ? [
                      {
                        label: "Transactions",
                        value: `${formatNumber(Number(payload[0].value))} (${
                          data.find((d) => d.riskLevel === payload[0].name)?.percentage ?? 0
                        }%)`,
                        color: String(payload[0].payload.fill ?? palette.riskColor[payload[0].name as "Low" | "Medium" | "High"]),
                      },
                    ]
                  : []
              }
            />
          )}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          formatter={(value) => {
            const point = data.find((d) => d.riskLevel === value);
            return `${value} risk — ${point?.percentage ?? 0}%`;
          }}
          wrapperStyle={{ fontSize: 12, paddingTop: 8, color: palette.ink.secondary }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
