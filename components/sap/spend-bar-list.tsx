"use client";

import { usePalette } from "@/hooks/use-palette";
import { formatInr } from "@/lib/sap/format-inr";
import type { CategoricalSlot } from "@/lib/chart-colors";

export interface SpendBarListRow {
  key: string;
  label: string;
  value: number;
}

interface SpendBarListProps {
  rows: SpendBarListRow[];
  colorSlot: CategoricalSlot;
  labelHeader?: string;
  valueHeader?: string;
  emptyLabel?: string;
}

const BAR_TRACK_CLASS = "relative h-5 w-32 shrink-0 border-l border-slate-300 dark:border-slate-700";

/**
 * Row list of entities by spend, each with an inline horizontal bar — the
 * same label + bar + value table layout as the SAP Spend Control Tower
 * "Compliance" dashboard's Off-PO / Off-Contract / Unmanaged widgets
 * (single flat accent color per widget, sorted descending, scrolls once long).
 */
export function SpendBarList({
  rows,
  colorSlot,
  labelHeader = "Category",
  valueHeader = "Spend",
  emptyLabel = "No unmanaged spend in this slice.",
}: SpendBarListProps) {
  const palette = usePalette();
  const accent = palette.categorical[colorSlot];
  const maxValue = Math.max(...rows.map((r) => r.value), 1);

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_128px] gap-3 border-b border-slate-200 pb-1.5 dark:border-slate-800">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {labelHeader}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {valueHeader}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_128px] items-center gap-3 border-b border-slate-100 py-2 last:border-b-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
          >
            <span className="truncate text-sm text-slate-700 dark:text-slate-300" title={row.label}>
              {row.label}
            </span>
            <div className="flex items-center gap-2">
              <div className={BAR_TRACK_CLASS}>
                <div
                  className="absolute inset-y-0 left-0 rounded-r-sm"
                  style={{ width: `${Math.max(3, (row.value / maxValue) * 100)}%`, backgroundColor: accent }}
                />
              </div>
              <span className="whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-400">
                {formatInr(row.value)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
