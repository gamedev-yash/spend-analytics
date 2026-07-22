"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWidgetInvoices } from "../../provider";
import { aggregateByCategory, type CategoryAgg } from "../../selectors";
import { CHART_COLORS, NO_VALUE_KEY, formatCurrencyFull } from "../../constants";

interface CategoryTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CategoryAgg }>;
}

function CategoryTooltip({ active, payload }: CategoryTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-900">{row.label}</p>
      <p className="text-slate-600">Spend: {formatCurrencyFull(row.spend)}</p>
      <p className="text-slate-600">Invoices: {row.invoiceCount.toLocaleString()}</p>
    </div>
  );
}

export function PaymentTermsByCategoryChart() {
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  height={80}
                  tick={{ fontSize: 11 }}
                />
                <YAxis allowDecimals={false} />
                <Tooltip content={<CategoryTooltip />} cursor={{ fill: "rgba(15, 23, 42, 0.05)" }} />
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
