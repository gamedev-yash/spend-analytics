"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { formatCrINR, type SupplierSizeBucket } from "../supplierMock";

interface SupplierSizeChartProps {
  buckets: SupplierSizeBucket[];
}

/** Histogram of suppliers by annual spend band — the long low-value tail is the fragmentation signal. */
export function SupplierSizeChart({ buckets }: SupplierSizeChartProps) {
  const palette = usePalette();

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={buckets} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid vertical={false} stroke={palette.ink.grid} />
        <XAxis
          dataKey="bucket"
          interval={0}
          stroke={palette.ink.muted}
          tick={{ fontSize: 11, fill: palette.ink.muted }}
        />
        <YAxis allowDecimals={false} stroke={palette.ink.muted} tick={{ fill: palette.ink.muted }} />
        <Tooltip
          content={({ active, payload }) => {
            const row = (payload?.[0]?.payload ?? null) as SupplierSizeBucket | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={`${row.bucket} annual spend`}
                rows={[
                  { label: "Suppliers", value: row.supplierCount.toLocaleString("en-IN"), color: palette.categorical.aqua },
                  { label: "Combined spend", value: formatCrINR(row.spendCr) },
                ]}
              />
            );
          }}
          cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
        />
        <Bar dataKey="supplierCount" fill={palette.categorical.aqua} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
