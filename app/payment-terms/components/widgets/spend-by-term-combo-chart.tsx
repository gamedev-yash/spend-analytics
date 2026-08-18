"use client";

import { Banknote } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { ChartCard } from "@/components/dashboard/chart-card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { useWidgetInvoices } from "../../provider";
import { aggregateByPaymentTerm, type PaymentTermAgg } from "../../selectors";
import { NO_VALUE_KEY, formatCurrencyCompact, formatCurrencyFull, formatDays, usePaymentTermsChartColors } from "../../constants";
import { FullscreenResponsiveContainer } from "@/components/dashboard/fullscreen-overlay";

function formatDaysAxisTick(value: number): string {
  return `${value}d`;
}

export function SpendByTermComboChart() {
  const palette = usePalette();
  const chartColors = usePaymentTermsChartColors();
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("paymentTerm");

  const rows = aggregateByPaymentTerm(invoicesForWidget).sort((a, b) => b.spend - a.spend);

  // Every term is plotted; the container below scrolls horizontally rather than
  // squeezing bars, so this grows with the row count.
  const chartWidth = Math.max(640, rows.length * 90);

  return (
    <ChartCard
      title="Spend by Payment Terms and Average Paid Cycle Days"
      description="Spend (bars) vs. average days to pay (line), across all payment terms"
      icon={<Banknote />}
      accent="orange"
    >
        {/* overflow-y-hidden: see the comment in payment-terms-by-category-chart.tsx — only horizontal scroll is ever intended here. */}
        <div className="overflow-x-auto overflow-y-hidden">
          <div style={{ width: "100%", minWidth: chartWidth }}>
            <FullscreenResponsiveContainer height={360}>
              <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 56, left: 8 }}>
                <defs>
                  <linearGradient id="grad-termSpendNoValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.noValue} stopOpacity={0.95} />
                    <stop offset="95%" stopColor={chartColors.noValue} stopOpacity={0.25} />
                  </linearGradient>
                  <linearGradient id="grad-termSpendBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.termSpendBar} stopOpacity={0.95} />
                    <stop offset="95%" stopColor={chartColors.termSpendBar} stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.ink.grid} />
                <XAxis
                  dataKey="label"
                  type="category"
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  height={70}
                  stroke={palette.ink.muted}
                  tick={{ fill: palette.ink.muted }}
                />
                <YAxis
                  yAxisId="left"
                  tickFormatter={formatCurrencyCompact}
                  stroke={palette.ink.muted}
                  tick={{ fill: palette.ink.muted }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={formatDaysAxisTick}
                  stroke={palette.ink.muted}
                  tick={{ fill: palette.ink.muted }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    const row = (payload?.[0]?.payload ?? null) as PaymentTermAgg | null;
                    if (!row) return null;
                    return (
                      <ChartTooltipCard
                        active={active}
                        heading={row.label}
                        rows={[
                          { label: "Spend", value: formatCurrencyFull(row.spend) },
                          { label: "Nominal days", value: row.nominalDays === null ? "—" : String(row.nominalDays) },
                          {
                            label: "Avg. paid days",
                            value: formatDays(row.avgPaidDays),
                            color: chartColors.termAvgDaysLine,
                          },
                          { label: "Invoices", value: String(row.invoiceCount) },
                        ]}
                      />
                    );
                  }}
                  cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="spend"
                  fill={palette.isDark ? "url(#grad-termSpendBar)" : chartColors.termSpendBar}
                  radius={[4, 4, 0, 0]}
                >
                  {rows.map((row) => {
                    const isNoValue = row.key === NO_VALUE_KEY;
                    const isSelected = selectedKey !== null && row.key === selectedKey;
                    const isDimmed = selectedKey !== null && row.key !== selectedKey;
                    return (
                      <Cell
                        key={row.key}
                        fill={
                          palette.isDark
                            ? isNoValue
                              ? "url(#grad-termSpendNoValue)"
                              : "url(#grad-termSpendBar)"
                            : isNoValue
                              ? chartColors.noValue
                              : chartColors.termSpendBar
                        }
                        fillOpacity={isDimmed ? chartColors.dimmedOpacity : 1}
                        stroke={isSelected ? chartColors.highlightStroke : undefined}
                        strokeWidth={isSelected ? 2 : 0}
                        style={{ cursor: "pointer" }}
                        onClick={() => onBarClick(row.key, row.label)}
                      />
                    );
                  })}
                </Bar>
                <Line
                  yAxisId="right"
                  dataKey="avgPaidDays"
                  stroke={chartColors.termAvgDaysLine}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </FullscreenResponsiveContainer>
          </div>
        </div>
    </ChartCard>
  );
}
