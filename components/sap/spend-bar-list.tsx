"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { formatInr } from "@/lib/sap/format-inr";
import type { CategoricalSlot } from "@/lib/chart-colors";

export interface SpendBarListRow {
  key: string;
  label: string;
  value: number;
  /** Share of this widget's own total — rendered as its own column when percentHeader is set. */
  percent?: number;
}

interface SpendBarListProps {
  rows: SpendBarListRow[];
  colorSlot: CategoricalSlot;
  labelHeader?: string;
  valueHeader?: string;
  /** Set to show a third "% of total" column, matching the PDF's two-column value + percentage layout. */
  percentHeader?: string;
  emptyLabel?: string;
}

const ROW_HEIGHT = 36;
/** Wide enough for the Recharts value label + bar without clipping. */
const VALUE_COLUMN_WIDTH = "190px";
const PERCENT_COLUMN_WIDTH = "64px";

/**
 * Row list of entities by spend: a plain-text label column, a Recharts
 * horizontal bar chart column (hidden axes — the label is already rendered
 * in the first column, and the value is labelled directly on each bar), and
 * an optional plain-text "% of total" column — the same table layout as the
 * SAP Spend Control Tower "Compliance" dashboard's Off-PO / Off-Contract /
 * Unmanaged widgets (single flat accent color per widget, sorted descending,
 * scrolls once long).
 */
export function SpendBarList({
  rows,
  colorSlot,
  labelHeader = "Category",
  valueHeader = "Spend",
  percentHeader,
  emptyLabel = "No unmanaged spend in this slice.",
}: SpendBarListProps) {
  const palette = usePalette();
  const accent = palette.categorical[colorSlot];
  const showPercent = Boolean(percentHeader);
  const gridCols = showPercent
    ? `minmax(0,1fr) ${VALUE_COLUMN_WIDTH} ${PERCENT_COLUMN_WIDTH}`
    : `minmax(0,1fr) ${VALUE_COLUMN_WIDTH}`;
  const chartHeight = rows.length * ROW_HEIGHT;

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid shrink-0 gap-3 border-b border-slate-200 pb-1.5 dark:border-slate-800" style={{ gridTemplateColumns: gridCols }}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {labelHeader}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {valueHeader}
        </span>
        {showPercent && (
          <span className="text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {percentHeader}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="grid gap-3" style={{ gridTemplateColumns: gridCols, height: chartHeight }}>
          <div className="flex flex-col">
            {rows.map((row) => (
              <div
                key={row.key}
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
              <YAxis type="category" dataKey="key" hide />
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
                <LabelList dataKey="value" position="right" formatter={(v) => formatInr(Number(v))} fontSize={11} fill={palette.ink.secondary} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {showPercent && (
            <div className="flex flex-col">
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-end text-xs font-medium text-slate-500 dark:text-slate-400"
                  style={{ height: ROW_HEIGHT }}
                >
                  {(row.percent ?? 0).toFixed(1)}%
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
