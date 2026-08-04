"use client";

import { Building2 } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { useWidgetInvoices } from "../../provider";
import { aggregateByPlant } from "../../selectors";
import { formatCurrencyFull, truncateLabel, useSingleSourceRiskChartColors } from "../../constants";

const MAX_HEIGHT = 460;

export function PlantsChart() {
  const chartColors = useSingleSourceRiskChartColors();
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("plant");

  const rows = aggregateByPlant(invoicesForWidget).sort((a, b) => b.spend - a.spend);
  // rows are sorted descending, so rows[0] is the visible max.
  const maxVisibleValue = rows[0]?.spend ?? 0;

  return (
    <ChartCard title="Spend by Plants/Sites" description="Ordered by spend" icon={<Building2 />} accent="green">
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
                    {truncateLabel(row.label, 18)}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrencyFull(row.spend)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: chartColors.plantBar }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{row.country}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
}
