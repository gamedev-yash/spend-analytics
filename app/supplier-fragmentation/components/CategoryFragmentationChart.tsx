"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { formatCrINR, type CategoryConcentration } from "../supplierMock";

interface CategoryFragmentationChartProps {
  categories: CategoryConcentration[];
}

interface Row {
  category: string;
  repeat: number;
  singleUse: number;
  supplierCount: number;
  spendCr: number;
}

/** Stacked supplier counts per category — the single-use slice is the fragmentation problem. */
export function CategoryFragmentationChart({ categories }: CategoryFragmentationChartProps) {
  const palette = usePalette();

  const rows: Row[] = categories.map((c) => ({
    category: c.category,
    repeat: c.supplierCount - c.singleUseSuppliers,
    singleUse: c.singleUseSuppliers,
    supplierCount: c.supplierCount,
    spendCr: c.spendCr,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <defs>
          <linearGradient id="grad-categoryFragRepeat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={palette.categorical.blue} stopOpacity={0.95} />
            <stop offset="95%" stopColor={palette.categorical.blue} stopOpacity={0.25} />
          </linearGradient>
          <linearGradient id="grad-categoryFragSingleUse" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={palette.categorical.orange} stopOpacity={0.95} />
            <stop offset="95%" stopColor={palette.categorical.orange} stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={palette.ink.grid} />
        <XAxis
          dataKey="category"
          interval={0}
          angle={-20}
          textAnchor="end"
          height={56}
          stroke={palette.ink.muted}
          tick={{ fontSize: 11, fill: palette.ink.muted }}
        />
        <YAxis allowDecimals={false} stroke={palette.ink.muted} tick={{ fill: palette.ink.muted }} />
        <Tooltip
          content={({ active, payload }) => {
            const row = (payload?.[0]?.payload ?? null) as Row | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={row.category}
                rows={[
                  { label: "Suppliers", value: row.supplierCount.toLocaleString("en-IN") },
                  { label: "Repeat", value: row.repeat.toLocaleString("en-IN"), color: palette.categorical.blue },
                  { label: "Single-use", value: row.singleUse.toLocaleString("en-IN"), color: palette.categorical.orange },
                  { label: "Spend", value: formatCrINR(row.spendCr) },
                ]}
              />
            );
          }}
          cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span style={{ color: palette.ink.muted }}>{value}</span>} />
        <Bar
          dataKey="repeat"
          name="Repeat suppliers"
          stackId="suppliers"
          fill={palette.isDark ? "url(#grad-categoryFragRepeat)" : palette.categorical.blue}
        />
        <Bar
          dataKey="singleUse"
          name="Single-use suppliers"
          stackId="suppliers"
          fill={palette.isDark ? "url(#grad-categoryFragSingleUse)" : palette.categorical.orange}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
