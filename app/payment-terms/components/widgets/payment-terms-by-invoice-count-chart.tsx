"use client";

import { Receipt } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/dashboard/chart-card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { useWidgetInvoices } from "../../provider";
import { aggregateByPaymentTerm, type PaymentTermAgg } from "../../selectors";
import { NO_VALUE_KEY, formatCurrencyFull, usePaymentTermsChartColors } from "../../constants";
import { FullscreenResponsiveContainer } from "@/components/dashboard/fullscreen-overlay";

const DISPLAY_CAP = 15;

export function PaymentTermsByInvoiceCountChart() {
  const palette = usePalette();
  const chartColors = usePaymentTermsChartColors();
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("paymentTerm");

  const allRows = aggregateByPaymentTerm(invoicesForWidget).sort(
    (a, b) => b.invoiceCount - a.invoiceCount
  );
  const totalCount = allRows.length;
  const rows = allRows.slice(0, DISPLAY_CAP);
  const isCapped = totalCount > DISPLAY_CAP;

  return (
    <ChartCard
      title="Payment Terms by Number of Invoices"
      description={
        isCapped
          ? `Showing top ${DISPLAY_CAP} of ${totalCount} payment terms by invoice count`
          : "Invoice volume per payment term"
      }
      icon={<Receipt />}
      accent="green"
    >
        <FullscreenResponsiveContainer height={340}>
          <BarChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.ink.grid} />
            <XAxis
              dataKey="label"
              angle={-35}
              textAnchor="end"
              interval={0}
              stroke={palette.ink.muted}
              tick={{ fontSize: 12, fill: palette.ink.muted }}
            />
            <YAxis allowDecimals={false} stroke={palette.ink.muted} tick={{ fill: palette.ink.muted }} />
            <Tooltip
              content={({ active, payload }) => {
                const row = (payload?.[0]?.payload ?? null) as PaymentTermAgg | null;
                if (!row) return null;
                return (
                  <ChartTooltipCard
                    active={active}
                    heading={row.label}
                    rows={[
                      { label: "Invoices", value: row.invoiceCount.toLocaleString() },
                      { label: "Spend", value: formatCurrencyFull(row.spend) },
                    ]}
                  />
                );
              }}
              cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
            />
            <Bar dataKey="invoiceCount" fill={chartColors.invoiceCountBar}>
              {rows.map((row) => {
                const isNoValue = row.key === NO_VALUE_KEY;
                const isSelected = selectedKey !== null && selectedKey === row.key;
                const isDimmed = selectedKey !== null && !isSelected;
                return (
                  <Cell
                    key={row.key}
                    fill={isNoValue ? chartColors.noValue : chartColors.invoiceCountBar}
                    stroke={isSelected ? chartColors.highlightStroke : undefined}
                    strokeWidth={isSelected ? 2 : undefined}
                    opacity={isDimmed ? chartColors.dimmedOpacity : 1}
                    style={{ cursor: "pointer" }}
                    onClick={() => onBarClick(row.key, row.label)}
                  />
                );
              })}
            </Bar>
        </BarChart>
        </FullscreenResponsiveContainer>
    </ChartCard>
  );
}
