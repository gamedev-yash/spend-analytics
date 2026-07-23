"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import type { CategoryConcentration } from "../supplierMock";

interface CategoryConcentrationChartProps {
  categories: CategoryConcentration[];
  /** Top-3 share below this % is flagged as fragmented (amber/red). */
  threshold: number;
}

/** Horizontal top-3 concentration per category, colored against the alert threshold. */
export function CategoryConcentrationChart({ categories, threshold }: CategoryConcentrationChartProps) {
  const palette = usePalette();
  const rows = [...categories].sort((a, b) => a.top3ConcentrationPercent - b.top3ConcentrationPercent);

  function barColor(percent: number): string {
    if (percent >= threshold) return palette.status.good;
    if (percent >= threshold - 15) return palette.status.warning;
    return palette.status.critical;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid horizontal={false} stroke={palette.ink.grid} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          stroke={palette.ink.muted}
          tick={{ fill: palette.ink.muted }}
        />
        <YAxis
          type="category"
          dataKey="category"
          width={150}
          stroke={palette.ink.muted}
          tick={{ fontSize: 11, fill: palette.ink.muted }}
        />
        <Tooltip
          content={({ active, payload }) => {
            const row = (payload?.[0]?.payload ?? null) as CategoryConcentration | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={row.category}
                rows={[
                  {
                    label: "Top-3 concentration",
                    value: `${row.top3ConcentrationPercent}%`,
                    color: barColor(row.top3ConcentrationPercent),
                  },
                  { label: "Suppliers", value: row.supplierCount.toLocaleString("en-IN") },
                  { label: "Alert threshold", value: `${threshold}%` },
                ]}
              />
            );
          }}
          cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
        />
        <ReferenceLine
          x={threshold}
          stroke={palette.ink.muted}
          strokeDasharray="4 4"
          label={{ value: `${threshold}%`, position: "top", fill: palette.ink.muted, fontSize: 11 }}
        />
        <Bar dataKey="top3ConcentrationPercent" radius={[0, 4, 4, 0]}>
          {rows.map((row) => (
            <Cell key={row.category} fill={barColor(row.top3ConcentrationPercent)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
