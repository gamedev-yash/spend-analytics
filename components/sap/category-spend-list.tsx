"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { useIsFullscreenChart } from "@/components/dashboard/fullscreen-overlay";
import type { TreemapNode } from "@/lib/sap/aggregate";
import { formatInr } from "@/lib/sap/format-inr";
import { usePalette } from "@/hooks/use-palette";

interface CategorySpendListProps {
  nodes: TreemapNode[];
}

/**
 * Top-level (L1) categories ranked by spend — a single horizontal bar chart
 * with the category on the Y-axis, so bar length always tracks the actual
 * plot width instead of sitting in a fixed-width column pinned to one side.
 * Rows, font, and bars scale up in the fullscreen overlay — a dozen-odd
 * categories at the compact card's density would otherwise look lost in
 * that much larger space.
 */
export function CategorySpendList({ nodes }: CategorySpendListProps) {
  const palette = usePalette();
  const isFullscreen = useIsFullscreenChart();
  const rowHeight = isFullscreen ? 48 : 32;
  const fontSize = isFullscreen ? 13 : 11;
  const rows = nodes
    .filter((n) => n.parent === "All Spend")
    .sort((a, b) => b.value - a.value)
    .map((n) => ({ ...n, valueLabel: formatInr(n.value) }));
  const chartHeight = Math.max(rows.length * rowHeight, 120);

  return (
    <div className="h-full overflow-y-auto">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: isFullscreen ? 104 : 84, bottom: 4, left: 4 }}
          barSize={isFullscreen ? 34 : 22}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={isFullscreen ? 190 : 150}
            axisLine={false}
            tickLine={false}
            interval={0}
            tick={{ fontSize, fill: palette.ink.secondary }}
          />
          <Tooltip
            content={({ active, payload }) => {
              const row = (payload?.[0]?.payload ?? null) as TreemapNode | null;
              if (!row) return null;
              return <ChartTooltipCard active={active} heading={row.label} rows={[{ label: "Spend", value: formatInr(row.value) }]} />;
            }}
            cursor={{ fill: palette.isDark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.05)" }}
          />
          <Bar dataKey="value" fill={palette.categorical.blue} radius={[0, 3, 3, 0]}>
            <LabelList dataKey="valueLabel" position="right" fontSize={fontSize} fill={palette.ink.secondary} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
