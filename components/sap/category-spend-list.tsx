"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import type { TreemapNode } from "@/lib/sap/aggregate";
import { formatInr } from "@/lib/sap/format-inr";
import { usePalette } from "@/hooks/use-palette";

interface CategorySpendListProps {
  nodes: TreemapNode[];
}

const ROW_HEIGHT = 36;
const GRID_COLS = "minmax(0,1fr) 190px";

/**
 * Row list of top-level (L1) categories by spend: a plain-text label column
 * next to a Recharts horizontal bar chart column (hidden axes — the label is
 * already rendered in the first column, and the value is labelled directly
 * on each bar) — mirrors the "Spend by Categories" widget's table layout in
 * the SAP Spend Control Tower dashboards.
 */
export function CategorySpendList({ nodes }: CategorySpendListProps) {
  const palette = usePalette();
  const rows = nodes.filter((n) => n.parent === "All Spend").sort((a, b) => b.value - a.value);
  const accent = palette.categorical.blue;
  const chartHeight = rows.length * ROW_HEIGHT;

  return (
    <div className="flex h-full flex-col">
      <div className="grid shrink-0 gap-3 border-b border-slate-200 pb-1.5 dark:border-slate-800" style={{ gridTemplateColumns: GRID_COLS }}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Category
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
                key={row.id}
                className="flex items-center truncate text-sm text-slate-700 dark:text-slate-300"
                style={{ height: ROW_HEIGHT }}
                title={row.label}
              >
                {row.label}
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barSize={20}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="id" hide />
              <Tooltip
                content={({ active, payload }) => {
                  const row = (payload?.[0]?.payload ?? null) as TreemapNode | null;
                  if (!row) return null;
                  return (
                    <ChartTooltipCard active={active} heading={row.label} rows={[{ label: "Spend", value: formatInr(row.value) }]} />
                  );
                }}
                cursor={{ fill: palette.isDark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.05)" }}
              />
              <Bar dataKey="value" fill={accent} radius={[0, 3, 3, 0]}>
                <LabelList dataKey="value" position="right" formatter={(v) => formatInr(Number(v))} fontSize={11} fill={palette.ink.secondary} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
