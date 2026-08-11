"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { formatInr } from "@/lib/sap/format-inr";
import type { BuSpendRow } from "@/lib/sap/aggregate";

interface SpendByBuChartProps {
  rows: BuSpendRow[];
}

const CRORE = 10_000_000;

interface BuBarDatum {
  plantName: string;
  valueCr: number;
  totalInr: number;
  percentOfTotal: number;
}

/**
 * Vertical bar of total spend by business unit / plant (x = BU, y = spend in
 * ₹ Cr), with a % of total label above each bar.
 */
export function SpendByBuChart({ rows }: SpendByBuChartProps) {
  const palette = usePalette();

  const data: BuBarDatum[] = [...rows]
    .sort((a, b) => b.total - a.total)
    .map((r) => ({ plantName: r.plantName, valueCr: r.total / CRORE, totalInr: r.total, percentOfTotal: r.percentOfTotal }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 28, right: 12, bottom: 40, left: 8 }} barCategoryGap="30%">
        <defs>
          <linearGradient id="grad-spendByBu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={palette.categorical.orange} stopOpacity={0.95} />
            <stop offset="95%" stopColor={palette.categorical.orange} stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.ink.grid} />
        <XAxis
          dataKey="plantName"
          angle={-30}
          textAnchor="end"
          interval={0}
          height={56}
          stroke={palette.ink.baseline}
          tick={{ fontSize: 11, fill: palette.ink.muted }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => v.toFixed(0)}
          stroke={palette.ink.baseline}
          tick={{ fontSize: 11, fill: palette.ink.muted }}
          tickLine={false}
          width={44}
          label={{ value: "₹ Cr", angle: -90, position: "insideLeft", fontSize: 11, fill: palette.ink.muted }}
        />
        <Tooltip
          content={({ active, payload }) => {
            const row = (payload?.[0]?.payload ?? null) as BuBarDatum | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={row.plantName}
                rows={[
                  { label: "Spend", value: formatInr(row.totalInr) },
                  { label: "% of total", value: `${row.percentOfTotal.toFixed(1)}%` },
                ]}
              />
            );
          }}
          cursor={{ fill: palette.isDark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.05)" }}
        />
        <Bar dataKey="valueCr" fill="url(#grad-spendByBu)" radius={[4, 4, 0, 0]}>
          <LabelList
            dataKey="percentOfTotal"
            position="top"
            formatter={(v) => `${Number(v).toFixed(1)}%`}
            fontSize={11}
            fill={palette.ink.secondary}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
