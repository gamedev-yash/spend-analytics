"use client";

import { Users } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { useWidgetInvoices } from "../../provider";
import { aggregateByGlobalUltimate } from "../../selectors";
import { formatCurrencyFull, formatPercent, truncateLabel, useSingleSourceRiskChartColors } from "../../constants";

const MAX_HEIGHT = 460;

export function SuppliersChart() {
  const chartColors = useSingleSourceRiskChartColors();
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("globalUltimate");

  // Every supplier is listed — the scroll container below absorbs the length.
  const rows = aggregateByGlobalUltimate(invoicesForWidget).sort((a, b) => b.spend - a.spend);
  // rows are sorted descending, so rows[0] is the max the bars scale against.
  const maxVisibleValue = rows[0]?.spend ?? 0;

  return (
    <ChartCard
      title="Spend by Suppliers (Global Ultimate)"
      description={`All ${rows.length} suppliers, ordered by spend`}
      icon={<Users />}
      accent="violet"
    >
      <div className="overflow-y-auto chart-fixed-height-scroll" style={{ maxHeight: MAX_HEIGHT }}>
        <div className="flex flex-col gap-1">
          {rows.map((row) => {
            const isSelected = selectedKey !== null && row.key === selectedKey;
            const isDimmed = selectedKey !== null && !isSelected;
            const pct = maxVisibleValue > 0 ? (row.spend / maxVisibleValue) * 100 : 0;
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => onBarClick(row.key, row.label)}
                className="flex w-full cursor-pointer flex-col gap-1 rounded-lg px-2.5 py-1.5 text-left transition-opacity hover:bg-slate-50 dark:hover:bg-slate-800/60"
                style={{
                  opacity: isDimmed ? chartColors.dimmedOpacity : 1,
                  boxShadow: isSelected ? `0 0 0 1px ${chartColors.highlightStroke}` : undefined,
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {truncateLabel(row.label, 24)}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrencyFull(row.spend)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {formatPercent(row.percentOfTotal)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: chartColors.supplierBar }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                    {row.categoryCount.toLocaleString()} {row.categoryCount === 1 ? "category" : "categories"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
}
