"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { useWidgetInvoices } from "../../provider";
import { aggregateByCategory, type CategoryAgg } from "../../selectors";
import { CHART_COLORS, NO_VALUE_KEY, formatCurrencyFull } from "../../constants";

export function PaymentTermsByCategoryChart() {
  const palette = usePalette();
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("category");
  const rows = aggregateByCategory(invoicesForWidget).sort(
    (a, b) => b.distinctTermCount - a.distinctTermCount
  );
  const chartMinWidth = Math.max(rows.length * 42, 480);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Terms by Categories</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${chartMinWidth}px`, height: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
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
                />
                <YAxis allowDecimals={false} stroke={palette.ink.muted} tick={{ fill: palette.ink.muted }} />
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
                          { label: "Invoices", value: row.invoiceCount.toLocaleString() },
                        ]}
                      />
                    );
                  }}
                  cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
                />
                <Bar dataKey="distinctTermCount">
                  {rows.map((row) => {
                    const isNoValue = row.key === NO_VALUE_KEY;
                    const isSelected = selectedKey !== null && row.key === selectedKey;
                    const isDimmed = selectedKey !== null && !isSelected;
                    return (
                      <Cell
                        key={row.key}
                        fill={isNoValue ? CHART_COLORS.noValue : CHART_COLORS.categoryBar}
                        opacity={isDimmed ? CHART_COLORS.dimmedOpacity : 1}
                        stroke={isSelected ? CHART_COLORS.highlightStroke : undefined}
                        strokeWidth={isSelected ? 2 : undefined}
                        style={{ cursor: "pointer" }}
                        onClick={() => onBarClick(row.key, row.label)}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
