"use client";

import { Boxes } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { useWidgetInvoices } from "../../provider";
import { aggregateByProduct } from "../../selectors";
import { formatCurrencyFull, truncateLabel, useSingleSourceRiskChartColors } from "../../constants";

const TOP_N = 15;
const MAX_HEIGHT = 460;

export function ProductsChart() {
  const chartColors = useSingleSourceRiskChartColors();
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("product");

  const allRows = aggregateByProduct(invoicesForWidget).sort((a, b) => b.spend - a.spend);
  const totalCount = allRows.length;
  const rows = allRows.slice(0, TOP_N);
  const isCapped = totalCount > TOP_N;
  // rows are sorted descending, so rows[0] is the visible max — the bars scale to
  // what's currently shown, not to the full (possibly capped-away) dataset.
  const maxVisibleValue = rows[0]?.spend ?? 0;

  return (
    <ChartCard
      title="Spend by Products"
      description={isCapped ? `Showing top ${TOP_N} of ${totalCount} products by spend` : "Ordered by spend"}
      icon={<Boxes />}
      accent="blue"
    >
      <div className="overflow-y-auto" style={{ maxHeight: MAX_HEIGHT }}>
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
                    {truncateLabel(row.label, 22)}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrencyFull(row.spend)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: chartColors.productBar }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{row.key}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
}
