"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { InvoiceValueBucket } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { useIsFullscreenChart } from "@/components/dashboard/fullscreen-overlay";

interface SpendByInvoiceValueDonutProps {
  buckets: InvoiceValueBucket[];
  selectedBuckets: Set<string>;
}

/**
 * SAP standard widget — spend percentage split across the same invoice-value
 * buckets as the top-left widget. Ordinal ramp (order = bucket size), not
 * categorical hues.
 */
export function SpendByInvoiceValueDonut({ buckets, selectedBuckets }: SpendByInvoiceValueDonutProps) {
  const theme = useTailSpendTheme();
  const isFullscreen = useIsFullscreenChart();

  return (
    <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 360}>
      <PieChart>
        <Pie
          data={buckets}
          dataKey="spend"
          nameKey="bucketLabel"
          innerRadius="45%"
          outerRadius="75%"
          paddingAngle={2}
          stroke={theme.chartSurface}
          strokeWidth={2}
        >
          {buckets.map((bucket, index) => (
            <Cell
              key={bucket.bucketLabel}
              fill={theme.invoiceBucketRamp[index]}
              fillOpacity={selectedBuckets.has(bucket.bucketLabel) ? 1 : 0.25}
            />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            const row = (payload?.[0]?.payload ?? null) as InvoiceValueBucket | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={row.bucketLabel}
                rows={[{ label: "Spend", value: `${formatINR(row.spend)} (${row.spendPercent}%)` }]}
              />
            );
          }}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          wrapperStyle={{ fontSize: 11, color: theme.textMuted }}
          formatter={(value) => <span style={{ color: theme.textMuted }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
