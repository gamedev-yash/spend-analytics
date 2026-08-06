"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { useIsFullscreenChart } from "@/components/dashboard/fullscreen-overlay";
import type { TopSupplierRow } from "@/lib/sap/aggregate";
import { formatInr } from "@/lib/sap/format-inr";
import { usePalette } from "@/hooks/use-palette";
import { truncate } from "@/lib/utils";

interface SupplierSpendListProps {
  rows: TopSupplierRow[];
  top5Percent: number;
}

/**
 * Every supplier ranked by spend — a single horizontal bar chart (supplier
 * on the Y-axis, long names truncated with the full name in the tooltip) so
 * bar length always tracks the actual plot width instead of sitting in a
 * fixed-width column pinned to one side. The top 5 (the group already
 * called out in the subtitle) carry the full accent; the rest a lighter
 * tint of the same hue. Rows, font, and bars scale up in the fullscreen
 * overlay for readability, and still scroll once the (often 100+ row) list
 * outgrows the taller rows. Scrolls once the list is long.
 */
export function SupplierSpendList({ rows, top5Percent }: SupplierSpendListProps) {
  const palette = usePalette();
  const isFullscreen = useIsFullscreenChart();
  const rowHeight = isFullscreen ? 40 : 32;
  const fontSize = isFullscreen ? 13 : 11;
  const labelMaxChars = isFullscreen ? 36 : 28;
  const accent = palette.categorical.violet;
  const top5Keys = new Set(rows.slice(0, 5).map((r) => r.key));
  const chartRows = rows.map((r) => ({ ...r, valueLabel: formatInr(r.totalValue) }));
  const chartHeight = Math.max(chartRows.length * rowHeight, 200);

  return (
    <div className="flex h-full flex-col gap-1">
      <p className="shrink-0 text-xs text-muted-foreground">
        Top 5 suppliers = <span className="font-medium text-foreground">{top5Percent.toFixed(1)}%</span> of total spend
        · {rows.length} suppliers total
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartRows}
            layout="vertical"
            margin={{ top: 4, right: isFullscreen ? 104 : 84, bottom: 4, left: 4 }}
            barSize={isFullscreen ? 20 : 14}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="displayName"
              width={isFullscreen ? 260 : 210}
              axisLine={false}
              tickLine={false}
              interval={0}
              tickFormatter={(name: string) => truncate(name, labelMaxChars)}
              tick={{ fontSize, fill: palette.ink.secondary }}
            />
            <Tooltip
              content={({ active, payload }) => {
                const row = (payload?.[0]?.payload ?? null) as TopSupplierRow | null;
                if (!row) return null;
                return (
                  <ChartTooltipCard active={active} heading={row.displayName} rows={[{ label: "Spend", value: formatInr(row.totalValue) }]} />
                );
              }}
              cursor={{ fill: palette.isDark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.05)" }}
            />
            <Bar dataKey="totalValue" radius={[0, 3, 3, 0]}>
              <LabelList dataKey="valueLabel" position="right" fontSize={fontSize} fill={palette.ink.secondary} />
              {chartRows.map((row) => (
                <Cell key={row.key} fill={top5Keys.has(row.key) ? accent : `${accent}66`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
