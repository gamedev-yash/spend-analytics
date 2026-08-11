"use client";

import { useMemo } from "react";
import {
  Bar,
  Cell,
  ComposedChart,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatInr } from "@/lib/sap/format-inr";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { useFragTheme } from "./fragTheme";
import { useFragmentation } from "./fragmentationStore";

interface BarDatum {
  categoryL2: string;
  categoryL1: string;
  suppliers: number;
  spend: number;
  aboveMedian: boolean;
}

/**
 * View 2 — Suppliers per Category: top-20 L2 categories as horizontal bars,
 * red above the median / green at-or-below, with a median reference line.
 * Click a bar to cross-filter to that category; click again to clear.
 */
export function SuppliersPerCategoryChart() {
  const { derived, toggleCategory, crossFilter } = useFragmentation();
  const theme = useFragTheme();
  const { stats, median } = derived.bar;

  const data = useMemo<BarDatum[]>(
    () =>
      stats.map((s) => ({
        categoryL2: s.categoryL2,
        categoryL1: s.categoryL1,
        suppliers: s.nSuppliers,
        spend: s.spend,
        aboveMedian: s.nSuppliers > median,
      })),
    [stats, median]
  );

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        No data for the current selection
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        layout="vertical"
        margin={{ top: 18, right: 40, bottom: 4, left: 8 }}
        barCategoryGap="25%"
      >
        <defs>
          <linearGradient id="grad-supplierPerCategoryBad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={theme.bad} stopOpacity={0.95} />
            <stop offset="95%" stopColor={theme.bad} stopOpacity={0.25} />
          </linearGradient>
          <linearGradient id="grad-supplierPerCategoryGood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={theme.good} stopOpacity={0.95} />
            <stop offset="95%" stopColor={theme.good} stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <XAxis
          type="number"
          stroke={theme.axis}
          axisLine={false}
          tickLine={false}
          tick={{ fill: theme.textMuted, fontSize: 11 }}
          label={{
            value: "Distinct suppliers",
            position: "insideBottom",
            offset: -2,
            fill: theme.textMuted,
            fontSize: 11,
          }}
        />
        <YAxis
          type="category"
          dataKey="categoryL2"
          width={150}
          stroke={theme.axis}
          axisLine={false}
          tickLine={false}
          tick={{ fill: theme.textMuted, fontSize: 10 }}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: theme.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
          content={({ active, payload }) => {
            const row = (payload?.[0]?.payload ?? null) as BarDatum | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={row.categoryL2}
                rows={[
                  { label: "Category (L1)", value: row.categoryL1 },
                  {
                    label: "Suppliers",
                    value: String(row.suppliers),
                    color: row.aboveMedian ? theme.bad : theme.good,
                  },
                  { label: "Spend", value: formatInr(row.spend, 2) },
                ]}
              />
            );
          }}
        />
        <ReferenceLine
          x={median}
          stroke={theme.accent}
          strokeWidth={2}
          strokeDasharray="6 4"
          label={{
            value: `Median ${median.toFixed(0)}`,
            position: "top",
            fill: theme.accent,
            fontSize: 11,
          }}
        />
        <Bar
          dataKey="suppliers"
          radius={[0, 4, 4, 0]}
          cursor="pointer"
          onClick={(entry) => {
            const datum = entry as unknown as BarDatum;
            if (datum?.categoryL2) toggleCategory(datum.categoryL2);
          }}
        >
          {data.map((row) => (
            <Cell
              key={row.categoryL2}
              fill={row.aboveMedian ? "url(#grad-supplierPerCategoryBad)" : "url(#grad-supplierPerCategoryGood)"}
              opacity={
                crossFilter?.categoryL2 && crossFilter.categoryL2 !== row.categoryL2 ? 0.35 : 1
              }
            />
          ))}
          <LabelList
            dataKey="suppliers"
            position="right"
            style={{ fill: theme.textMuted, fontSize: 10 }}
          />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
