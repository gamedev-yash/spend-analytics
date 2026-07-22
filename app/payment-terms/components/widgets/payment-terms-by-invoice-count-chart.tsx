"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWidgetInvoices } from "../../provider";
import { aggregateByPaymentTerm, type PaymentTermAgg } from "../../selectors";
import { CHART_COLORS, NO_VALUE_KEY, formatCurrencyFull } from "../../constants";

const DISPLAY_CAP = 15;

interface TooltipPayloadEntry {
  payload: PaymentTermAgg;
}

function InvoiceCountTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-semibold text-slate-900">{row.label}</p>
      <p className="text-slate-600">Invoices: {row.invoiceCount.toLocaleString()}</p>
      <p className="text-slate-600">Spend: {formatCurrencyFull(row.spend)}</p>
    </div>
  );
}

export function PaymentTermsByInvoiceCountChart() {
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("paymentTerm");

  const allRows = aggregateByPaymentTerm(invoicesForWidget).sort(
    (a, b) => b.invoiceCount - a.invoiceCount
  );
  const totalCount = allRows.length;
  const rows = allRows.slice(0, DISPLAY_CAP);
  const isCapped = totalCount > DISPLAY_CAP;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Terms by Number of Invoices</CardTitle>
        {isCapped && (
          <p className="text-xs text-slate-500">
            Showing top {DISPLAY_CAP} of {totalCount} payment terms by invoice count.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              angle={-35}
              textAnchor="end"
              interval={0}
              tick={{ fontSize: 12 }}
            />
            <YAxis allowDecimals={false} />
            <Tooltip content={<InvoiceCountTooltip />} />
            <Bar dataKey="invoiceCount" fill={CHART_COLORS.invoiceCountBar}>
              {rows.map((row) => {
                const isNoValue = row.key === NO_VALUE_KEY;
                const isSelected = selectedKey !== null && selectedKey === row.key;
                const isDimmed = selectedKey !== null && !isSelected;
                return (
                  <Cell
                    key={row.key}
                    fill={isNoValue ? CHART_COLORS.noValue : CHART_COLORS.invoiceCountBar}
                    stroke={isSelected ? CHART_COLORS.highlightStroke : undefined}
                    strokeWidth={isSelected ? 2 : undefined}
                    opacity={isDimmed ? CHART_COLORS.dimmedOpacity : 1}
                    style={{ cursor: "pointer" }}
                    onClick={() => onBarClick(row.key, row.label)}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
