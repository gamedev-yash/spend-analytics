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
import { useWidgetInvoices } from "../../provider";
import { aggregateByPaymentTerm, type PaymentTermAgg } from "../../selectors";
import { NO_VALUE_KEY, CHART_COLORS, formatCurrencyCompact, formatCurrencyFull, formatDays } from "../../constants";

const TOP_N = 15;

function formatDaysAxisTick(value: number): string {
  return `${value}d`;
}

interface ComboTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PaymentTermAgg }>;
}

function ComboTooltip({ active, payload }: ComboTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="mb-1.5 font-semibold text-slate-900">{row.label}</p>
      <dl className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">Spend</dt>
          <dd className="font-medium text-slate-900">{formatCurrencyFull(row.spend)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">Nominal days</dt>
          <dd className="font-medium text-slate-900">
            {row.nominalDays === null ? "—" : row.nominalDays}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">Avg. paid days</dt>
          <dd className="font-medium" style={{ color: CHART_COLORS.termAvgDaysLine }}>
            {formatDays(row.avgPaidDays)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">Invoices</dt>
          <dd className="font-medium text-slate-900">{row.invoiceCount}</dd>
        </div>
      </dl>
    </div>
  );
}

export function SpendByTermComboChart() {
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
          <p className="text-xs text-slate-500">
            Showing top {TOP_N} of {totalCount} payment terms by spend.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div style={{ width: "100%", minWidth: chartWidth }}>
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 56, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  type="category"
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  height={70}
                />
                <YAxis yAxisId="left" tickFormatter={formatCurrencyCompact} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={formatDaysAxisTick} />
                <Tooltip content={<ComboTooltip />} />
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
