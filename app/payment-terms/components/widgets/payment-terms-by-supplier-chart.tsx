"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
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
import { ChartCard } from "@/components/dashboard/chart-card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { useWidgetInvoices } from "../../provider";
import { aggregateByGlobalUltimate, type GlobalUltimateAgg } from "../../selectors";
import { formatCurrencyCompact, formatCurrencyFull, usePaymentTermsChartColors } from "../../constants";

const ROW_HEIGHT = 26;
const MIN_CHART_HEIGHT = 160;
/**
 * Viewport cap, not a data cap — the chart itself grows to ROW_HEIGHT per
 * supplier so every row stays legible, and this scrolls to reach the rest.
 */
const MAX_VIEWPORT_HEIGHT = 520;
const LABEL_MAX_CHARS = 24;

function truncateLabel(label: string): string {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS - 1)}…` : label;
}

export function PaymentTermsBySupplierChart() {
  const palette = usePalette();
  const chartColors = usePaymentTermsChartColors();
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("globalUltimate");

  const displayedRows = useMemo(
    () => aggregateByGlobalUltimate(invoicesForWidget).sort((a, b) => b.spend - a.spend),
    [invoicesForWidget]
  );

  const chartHeight = Math.max(MIN_CHART_HEIGHT, displayedRows.length * ROW_HEIGHT);

  return (
    <ChartCard
      title="Payment Terms by Suppliers (Global Ultimate)"
      description={`All ${displayedRows.length} suppliers, ranked by total spend`}
      icon={<Users />}
      accent="violet"
    >
      {/*
        Deliberately a plain ResponsiveContainer, not FullscreenResponsiveContainer:
        chartHeight here is content-driven (every supplier gets a fixed, legible
        ROW_HEIGHT), and overflow is meant to be handled by scrolling this viewport,
        not by stretching the chart to fill it. Switching to height="100%" in
        fullscreen would make Recharts compress all rows into the capped viewport
        height instead, shrinking 50 suppliers into unreadable ~10px slivers.
        `chart-fixed-height-scroll` opts this out of globals.css's fullscreen
        stretch rule, which would otherwise force the same height:100% onto
        this chart's internals regardless of the prop value.
      */}
      <div className="overflow-y-auto chart-fixed-height-scroll" style={{ maxHeight: MAX_VIEWPORT_HEIGHT }}>
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
                    fill={chartColors.supplierBar}
                    fillOpacity={isDimmed ? chartColors.dimmedOpacity : 1}
                    stroke={isSelected ? chartColors.highlightStroke : undefined}
                    strokeWidth={isSelected ? 2 : undefined}
                  />
                );
              })}
            </Bar>
      </BarChart>
      </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
