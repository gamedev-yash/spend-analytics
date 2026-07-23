"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { useWidgetInvoices } from "../../provider";
import { aggregateByPaymentTerm, type PaymentTermAgg } from "../../selectors";
import { NO_VALUE_KEY, CHART_COLORS, formatCurrencyCompact, formatCurrencyFull, formatDays } from "../../constants";

const TOP_N = 15;

function formatDaysAxisTick(value: number): string {
  return `${value}d`;
}

export function SpendByTermComboChart() {
  const palette = usePalette();
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("paymentTerm");

  const allRows = aggregateByPaymentTerm(invoicesForWidget).sort((a, b) => b.spend - a.spend);
  const totalCount = allRows.length;
  const rows = allRows.slice(0, TOP_N);
  const isCapped = totalCount > TOP_N;

  const chartWidth = Math.max(640, rows.length * 90);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spend by Payment Terms and Average Paid Cycle Days</CardTitle>
        {isCapped && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing top {TOP_N} of {totalCount} payment terms by spend.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div style={{ width: "100%", minWidth: chartWidth }}>
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 56, left: 8 }}>
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
                            color: CHART_COLORS.termAvgDaysLine,
                          },
                          { label: "Invoices", value: String(row.invoiceCount) },
                        ]}
                      />
                    );
                  }}
                  cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
                />
                <Bar yAxisId="left" dataKey="spend" fill={CHART_COLORS.termSpendBar}>
                  {rows.map((row) => {
                    const isNoValue = row.key === NO_VALUE_KEY;
                    const isSelected = selectedKey !== null && row.key === selectedKey;
                    const isDimmed = selectedKey !== null && row.key !== selectedKey;
                    return (
                      <Cell
                        key={row.key}
                        fill={isNoValue ? CHART_COLORS.noValue : CHART_COLORS.termSpendBar}
                        fillOpacity={isDimmed ? CHART_COLORS.dimmedOpacity : 1}
                        stroke={isSelected ? CHART_COLORS.highlightStroke : undefined}
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
                  stroke={CHART_COLORS.termAvgDaysLine}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
