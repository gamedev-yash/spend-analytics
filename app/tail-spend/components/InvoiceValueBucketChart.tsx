"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { InvoiceValueBucket } from "../tailSpendMock";
import { formatCompactNumber } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";

interface InvoiceValueBucketChartProps {
  buckets: InvoiceValueBucket[];
  selectedBuckets: Set<string>;
  onToggleBucket: (bucketLabel: string) => void;
}

/**
 * SAP standard widget — invoice count by invoice value bucket. Two measures of
 * different scale (invoices/supplier vs. total invoice count) are shown on
 * paired axes, matching the SAP Spend Control Tower's own composed chart;
 * each axis is tinted to its series so the pairing stays legible without a
 * shared scale.
 */
export function InvoiceValueBucketChart({ buckets, selectedBuckets, onToggleBucket }: InvoiceValueBucketChartProps) {
  const theme = useTailSpendTheme();

  return (
    <div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        Click a bar to isolate its bucket — click again to restore all.
      </p>
      <ResponsiveContainer width="100%" height={252}>
      <ComposedChart data={buckets} margin={{ top: 8, right: 8, bottom: 8, left: 0 }} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke={theme.gridline} />
        <XAxis
          dataKey="bucketLabel"
          stroke={theme.axisLine}
          tick={{ fill: theme.textMuted, fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          stroke={theme.axisLine}
          tick={{ fill: theme.paretoBarColor, fontSize: 11 }}
          tickLine={false}
          width={36}
          label={{ value: "Invoices/supplier", angle: -90, position: "insideLeft", fill: theme.paretoBarColor, fontSize: 10 }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          stroke={theme.axisLine}
          tick={{ fill: theme.paretoLineColor, fontSize: 11 }}
          tickLine={false}
          width={44}
          tickFormatter={(v) => formatCompactNumber(v)}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            const row = (payload?.[0]?.payload ?? null) as InvoiceValueBucket | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={String(label)}
                rows={[
                  { label: "Invoices per Supplier", value: String(row.invoicesPerSupplier), color: theme.paretoBarColor },
                  { label: "Number of Invoices", value: formatCompactNumber(row.invoiceCount), color: theme.paretoLineColor },
                ]}
              />
            );
          }}
          cursor={{ fill: theme.tooltipCursorFill }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: theme.textMuted }}
          formatter={(value) => <span style={{ color: theme.textMuted }}>{value}</span>}
        />
        <Bar
          yAxisId="left"
          dataKey="invoicesPerSupplier"
          name="Invoices per Supplier"
          fill={theme.paretoBarColor}
          maxBarSize={40}
          cursor="pointer"
          onClick={(_, index) => onToggleBucket(buckets[index].bucketLabel)}
        >
          {buckets.map((bucket) => (
            <Cell
              key={bucket.bucketLabel}
              fill={theme.paretoBarColor}
              fillOpacity={selectedBuckets.has(bucket.bucketLabel) ? 1 : 0.25}
            />
          ))}
        </Bar>
        <Line
          yAxisId="right"
          dataKey="invoiceCount"
          name="Number of Invoices"
          stroke={theme.paretoLineColor}
          strokeWidth={2}
          dot={{ r: 3, fill: theme.paretoLineColor, strokeWidth: 0 }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: theme.chartSurface }}
        />
      </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
