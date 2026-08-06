"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { formatInr } from "@/lib/sap/format-inr";
import { truncate } from "@/lib/utils";
import type { CategoricalSlot } from "@/lib/chart-colors";

export interface SpendBarListRow {
  key: string;
  label: string;
  value: number;
  /** Share of this widget's own total — appended next to the value label when percentHeader is set. */
  percent?: number;
}

interface SpendBarListProps {
  rows: SpendBarListRow[];
  colorSlot: CategoricalSlot;
  valueHeader?: string;
  /** Set to also show a "% of total" figure alongside each bar's value label. */
  percentHeader?: string;
  emptyLabel?: string;
}

const ROW_HEIGHT = 32;
const LABEL_WIDTH = 170;
const LABEL_MAX_CHARS = 22;

/**
 * Entities ranked by spend — a single horizontal bar chart (label on the
 * Y-axis, long labels truncated with the full name in the tooltip) so bar
 * length always tracks the actual plot width instead of sitting in a
 * fixed-width column pinned to one side. Used by the SAP Spend Control
 * Tower "Compliance" dashboard's Off-PO / Off-Contract / Unmanaged widgets
 * (single flat accent color per widget, sorted descending, scrolls once long).
 */
export function SpendBarList({
  rows,
  colorSlot,
  valueHeader = "Spend",
  percentHeader,
  emptyLabel = "No unmanaged spend in this slice.",
}: SpendBarListProps) {
  const palette = usePalette();
  const accent = palette.categorical[colorSlot];

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</p>;
  }

  const chartRows = rows.map((r) => ({
    ...r,
    valueLabel: percentHeader && r.percent !== undefined ? `${formatInr(r.value)}  ·  ${r.percent.toFixed(1)}%` : formatInr(r.value),
  }));
  const chartHeight = Math.max(chartRows.length * ROW_HEIGHT, 160);

  return (
    <div className="h-full overflow-y-auto">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 116, bottom: 4, left: 4 }} barSize={16}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={LABEL_WIDTH}
            axisLine={false}
            tickLine={false}
            interval={0}
            tickFormatter={(label: string) => truncate(label, LABEL_MAX_CHARS)}
            tick={{ fontSize: 11, fill: palette.ink.secondary }}
          />
          <Tooltip
            content={({ active, payload }) => {
              const row = (payload?.[0]?.payload ?? null) as SpendBarListRow | null;
              if (!row) return null;
              return (
                <ChartTooltipCard
                  active={active}
                  heading={row.label}
                  rows={[
                    { label: valueHeader, value: formatInr(row.value) },
                    ...(row.percent !== undefined ? [{ label: percentHeader ?? "%", value: `${row.percent.toFixed(1)}%` }] : []),
                  ]}
                />
              );
            }}
            cursor={{ fill: palette.isDark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.05)" }}
          />
          <Bar dataKey="value" fill={accent} radius={[0, 3, 3, 0]}>
            <LabelList dataKey="valueLabel" position="right" fontSize={11} fill={palette.ink.secondary} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
