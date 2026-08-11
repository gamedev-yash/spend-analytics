"use client";

import { AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/dashboard/chart-card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { useSingleSourceRisk, useWidgetInvoices } from "../../provider";
import { aggregateByCategory, type CategoryAgg } from "../../selectors";
import { formatCurrencyFull, truncateLabel, useSingleSourceRiskChartColors } from "../../constants";
import type { SupplierCountThreshold } from "../../types";
import { FullscreenResponsiveContainer } from "@/components/dashboard/fullscreen-overlay";

const LEGEND: { threshold: SupplierCountThreshold; label: string }[] = [
  { threshold: 1, label: "1 supplier" },
  { threshold: 2, label: "2 suppliers" },
  { threshold: 3, label: "3 suppliers" },
];

const GRADIENT_ID_BY_THRESHOLD: Record<SupplierCountThreshold, string> = {
  1: "grad-categoriesBySupplierCount-critical",
  2: "grad-categoriesBySupplierCount-serious",
  3: "grad-categoriesBySupplierCount-warning",
};

export function CategoriesBySupplierCountChart() {
  const palette = usePalette();
  const chartColors = useSingleSourceRiskChartColors();
  const { filters } = useSingleSourceRisk();
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("category");
  const rows = aggregateByCategory(invoicesForWidget).sort((a, b) => b.spend - a.spend);
  const chartMinWidth = Math.max(rows.length * 46, 480);
  const threshold = filters.supplierCountPerCategory;

  return (
    <ChartCard
      title={`Spend by Categories with Suppliers ≤ ${threshold}`}
      description={`${rows.length} categor${rows.length === 1 ? "y" : "ies"} at or below the selected threshold, ordered by spend`}
      icon={<AlertTriangle />}
      accent="red"
      action={
        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          {LEGEND.filter((entry) => entry.threshold <= threshold).map((entry) => (
            <span key={entry.threshold} className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: chartColors.categoryBySupplierCount[entry.threshold] }}
              />
              {entry.label}
            </span>
          ))}
        </div>
      }
    >
      {/*
        overflow-y-hidden alongside overflow-x-auto: setting overflow-x to
        anything but visible forces the CSS-computed overflow-y to `auto` too,
        even though only horizontal scroll is ever intended here — on a system
        that always renders a reserved-space (non-overlay) scrollbar track,
        that stray auto can show a vertical scrollbar and steal height from
        this flex-grown wrapper, which the chart's ResizeObserver picks up as
        a real resize. Pinning it to `hidden` removes the possibility.
      */}
      <div className="overflow-x-auto overflow-y-hidden">
        <div style={{ minWidth: `${chartMinWidth}px`, height: 400 }}>
          <FullscreenResponsiveContainer height={400}>
            <BarChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.ink.grid} />
              <XAxis
                dataKey="label"
                angle={-35}
                textAnchor="end"
                interval={0}
                height={80}
                stroke={palette.ink.muted}
                tick={{ fontSize: 11, fill: palette.ink.muted }}
                tickFormatter={(value: string) => truncateLabel(value, 18)}
              />
              <YAxis
                tickFormatter={(value: number) => formatCurrencyFull(value)}
                stroke={palette.ink.muted}
                tick={{ fill: palette.ink.muted }}
                width={72}
              />
              <Tooltip
                content={({ active, payload }) => {
                  const row = (payload?.[0]?.payload ?? null) as CategoryAgg | null;
                  if (!row) return null;
                  return (
                    <ChartTooltipCard
                      active={active}
                      heading={row.label}
                      rows={[
                        { label: "Spend", value: formatCurrencyFull(row.spend) },
                        { label: "Suppliers", value: row.supplierCount.toLocaleString() },
                        { label: "Products", value: row.productCount.toLocaleString() },
                        { label: "Invoices", value: row.invoiceCount.toLocaleString() },
                      ]}
                    />
                  );
                }}
                cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
              />
              <defs>
                <linearGradient id={GRADIENT_ID_BY_THRESHOLD[1]} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColors.categoryBySupplierCount[1]} stopOpacity={0.95} />
                  <stop offset="95%" stopColor={chartColors.categoryBySupplierCount[1]} stopOpacity={0.25} />
                </linearGradient>
                <linearGradient id={GRADIENT_ID_BY_THRESHOLD[2]} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColors.categoryBySupplierCount[2]} stopOpacity={0.95} />
                  <stop offset="95%" stopColor={chartColors.categoryBySupplierCount[2]} stopOpacity={0.25} />
                </linearGradient>
                <linearGradient id={GRADIENT_ID_BY_THRESHOLD[3]} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColors.categoryBySupplierCount[3]} stopOpacity={0.95} />
                  <stop offset="95%" stopColor={chartColors.categoryBySupplierCount[3]} stopOpacity={0.25} />
                </linearGradient>
              </defs>
              <Bar dataKey="spend" radius={[4, 4, 0, 0]}>
                {rows.map((row) => {
                  const isSelected = selectedKey !== null && row.key === selectedKey;
                  const isDimmed = selectedKey !== null && !isSelected;
                  const supplierCountKey = Math.min(row.supplierCount, 3) as SupplierCountThreshold;
                  const fill = `url(#${GRADIENT_ID_BY_THRESHOLD[supplierCountKey]})`;
                  return (
                    <Cell
                      key={row.key}
                      fill={fill}
                      opacity={isDimmed ? chartColors.dimmedOpacity : 1}
                      stroke={isSelected ? chartColors.highlightStroke : undefined}
                      strokeWidth={isSelected ? 2 : undefined}
                      style={{ cursor: "pointer" }}
                      onClick={() => onBarClick(row.key, row.label)}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </FullscreenResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}
