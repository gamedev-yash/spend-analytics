"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import type { TopSupplierRow } from "@/lib/sap/aggregate";
import { formatInr } from "@/lib/sap/format-inr";
import { usePalette } from "@/hooks/use-palette";

interface SupplierSpendListProps {
  rows: TopSupplierRow[];
  top5Percent: number;
}

const ROW_HEIGHT = 36;
const GRID_COLS = "minmax(0,1fr) 190px";

/**
 * Row list of every supplier by spend: a plain-text label column next to a
 * Recharts horizontal bar chart column — mirrors the "Spend by Suppliers
 * (Global Ultimate)" widget's table layout in the SAP Spend Control Tower
 * dashboards. The top 5 (the group already called out in the subtitle)
 * carry the full accent; the rest a lighter tint of the same hue. Scrolls
 * once the list is long.
 */
export function SupplierSpendList({ rows, top5Percent }: SupplierSpendListProps) {
  const palette = usePalette();
  const accent = palette.categorical.violet;
  const top5Keys = new Set(rows.slice(0, 5).map((r) => r.key));
  const chartHeight = rows.length * ROW_HEIGHT;

  return (
    <div className="flex h-full flex-col gap-1">
      <p className="shrink-0 text-xs text-muted-foreground">
        Top 5 suppliers = <span className="font-medium text-foreground">{top5Percent.toFixed(1)}%</span> of total spend
        · {rows.length} suppliers total
      </p>
      <div className="grid shrink-0 gap-3 border-b border-slate-200 pb-1.5 dark:border-slate-800" style={{ gridTemplateColumns: GRID_COLS }}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Supplier
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Spend
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-3" style={{ gridTemplateColumns: GRID_COLS, height: chartHeight }}>
          <div className="flex flex-col">
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex items-center truncate text-sm text-slate-700 dark:text-slate-300"
                style={{ height: ROW_HEIGHT }}
                title={row.displayName}
              >
                {row.displayName}
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barSize={20}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="key" hide />
              <Tooltip
                content={({ active, payload }) => {
                  const row = (payload?.[0]?.payload ?? null) as TopSupplierRow | null;
                  if (!row) return null;
                  return (
                    <ChartTooltipCard
                      active={active}
                      heading={row.displayName}
                      rows={[{ label: "Spend", value: formatInr(row.totalValue) }]}
                    />
                  );
                }}
                cursor={{ fill: palette.isDark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.05)" }}
              />
              <Bar dataKey="totalValue" radius={[0, 3, 3, 0]}>
                <LabelList dataKey="totalValue" position="right" formatter={(v) => formatInr(Number(v))} fontSize={11} fill={palette.ink.secondary} />
                {rows.map((row) => (
                  <Cell key={row.key} fill={top5Keys.has(row.key) ? accent : `${accent}66`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
