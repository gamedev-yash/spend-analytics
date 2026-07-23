"use client";

import { useMemo } from "react";
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
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { useWidgetInvoices } from "../../provider";
import { aggregateByGlobalUltimate, type GlobalUltimateAgg } from "../../selectors";
import { CHART_COLORS, formatCurrencyCompact, formatCurrencyFull } from "../../constants";

const TOP_N = 20;
const ROW_HEIGHT = 26;
const MIN_CHART_HEIGHT = 160;
const MAX_CHART_HEIGHT = 520;
const LABEL_MAX_CHARS = 24;

function truncateLabel(label: string): string {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS - 1)}…` : label;
}

export function PaymentTermsBySupplierChart() {
  const palette = usePalette();
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("globalUltimate");

  const { displayedRows, totalCount } = useMemo(() => {
    const rows = aggregateByGlobalUltimate(invoicesForWidget).sort((a, b) => b.spend - a.spend);
    return { displayedRows: rows.slice(0, TOP_N), totalCount: rows.length };
  }, [invoicesForWidget]);

  const chartHeight = Math.min(
    MAX_CHART_HEIGHT,
    Math.max(MIN_CHART_HEIGHT, displayedRows.length * ROW_HEIGHT)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Terms by Suppliers (Global Ultimate)</CardTitle>
        {totalCount > TOP_N && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing top {TOP_N} of {totalCount} suppliers by spend.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={displayedRows}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={palette.ink.grid} />
            <XAxis
              type="number"
              tickFormatter={formatCurrencyCompact}
              stroke={palette.ink.muted}
              tick={{ fill: palette.ink.muted }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={180}
              tickFormatter={truncateLabel}
              stroke={palette.ink.muted}
              tick={{ fill: palette.ink.muted }}
            />
            <Tooltip
              content={({ active, payload }) => {
                const row = (payload?.[0]?.payload ?? null) as GlobalUltimateAgg | null;
                if (!row) return null;
                return (
                  <ChartTooltipCard
                    active={active}
                    heading={row.label}
                    rows={[
                      { label: "Spend", value: formatCurrencyFull(row.spend) },
                      { label: "Payment Terms Used", value: String(row.distinctTermCount) },
                    ]}
                  />
                );
              }}
              cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
            />
            <Bar
              dataKey="spend"
              style={{ cursor: "pointer" }}
              onClick={(_, index: number) => {
                const row = displayedRows[index];
                if (row) onBarClick(row.key, row.label);
              }}
            >
              {displayedRows.map((row) => {
                const isSelected = selectedKey !== null && selectedKey === row.key;
                const isDimmed = selectedKey !== null && selectedKey !== row.key;
                return (
                  <Cell
                    key={row.key}
                    fill={CHART_COLORS.supplierBar}
                    fillOpacity={isDimmed ? CHART_COLORS.dimmedOpacity : 1}
                    stroke={isSelected ? CHART_COLORS.highlightStroke : undefined}
                    strokeWidth={isSelected ? 2 : undefined}
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
