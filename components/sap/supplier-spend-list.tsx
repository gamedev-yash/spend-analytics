"use client";

import type { TopSupplierRow } from "@/lib/sap/aggregate";
import { formatInr } from "@/lib/sap/format-inr";
import { usePalette } from "@/hooks/use-palette";

interface SupplierSpendListProps {
  rows: TopSupplierRow[];
  top5Percent: number;
}

const BAR_TRACK_CLASS = "relative h-5 w-32 shrink-0 border-l border-slate-300 dark:border-slate-700";

/**
 * Row list of every supplier by spend, each with an inline horizontal bar —
 * mirrors the "Spend by Suppliers (Global Ultimate)" widget's table layout
 * in the SAP Spend Control Tower dashboards. The top 5 (the group already
 * called out in the subtitle) carry the full accent; the rest a lighter tint
 * of the same hue. Scrolls once the list is long.
 */
export function SupplierSpendList({ rows, top5Percent }: SupplierSpendListProps) {
  const palette = usePalette();
  const maxValue = Math.max(...rows.map((r) => r.totalValue), 1);
  const accent = palette.categorical.violet;
  const top5Keys = new Set(rows.slice(0, 5).map((r) => r.key));

  return (
    <div className="flex h-full flex-col gap-1">
      <p className="shrink-0 text-xs text-muted-foreground">
        Top 5 suppliers = <span className="font-medium text-foreground">{top5Percent.toFixed(1)}%</span> of total spend
        · {rows.length} suppliers total
      </p>
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_128px] gap-3 border-b border-slate-200 pb-1.5 dark:border-slate-800">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Supplier
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Spend
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_128px] items-center gap-3 border-b border-slate-100 py-2 last:border-b-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
          >
            <span className="truncate text-sm text-slate-700 dark:text-slate-300" title={row.displayName}>
              {row.displayName}
            </span>
            <div className="flex items-center gap-2">
              <div className={BAR_TRACK_CLASS}>
                <div
                  className="absolute inset-y-0 left-0 rounded-r-sm"
                  style={{
                    width: `${Math.max(3, (row.totalValue / maxValue) * 100)}%`,
                    backgroundColor: top5Keys.has(row.key) ? accent : `${accent}66`,
                  }}
                />
              </div>
              <span className="whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-400">
                {formatInr(row.totalValue)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
