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
import { formatCompactNumber, formatINR } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { STATUS_CHART_COLOR } from "@/components/ui/status-badge";
import { bucketRisk } from "../bucketRisk";
import { useIsFullscreenChart } from "@/components/dashboard/fullscreen-overlay";

interface InvoiceValueBucketChartProps {
  buckets: InvoiceValueBucket[];
  selectedBuckets: Set<string>;
  onToggleBucket: (bucketLabel: string) => void;
  /** Micro-PO value boundary — buckets under it get amber/rose risk accents. */
  microThreshold?: number;
}

/**
 * SAP standard widget — invoice count by invoice value bucket. Two measures of
 * different scale (invoices/supplier vs. total invoice count) are shown on
 * paired axes, matching the SAP Spend Control Tower's own composed chart;
 * each axis is tinted to its series so the pairing stays legible without a
 * shared scale.
 */
export function InvoiceValueBucketChart({
  buckets,
  selectedBuckets,
  onToggleBucket,
  microThreshold,
}: InvoiceValueBucketChartProps) {
  const theme = useTailSpendTheme();
  const isFullscreen = useIsFullscreenChart();

  return (
    <div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        Click a bar to isolate its bucket — click again to restore all.
        {microThreshold ? (
          <>
            {" "}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: STATUS_CHART_COLOR.danger }} />
              micro-PO buckets (&lt; {formatINR(microThreshold)})
            </span>
          </>
        ) : null}
      </p>
      <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 252}>
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
          cursor="pointer"
          onClick={(_, index) => onToggleBucket(buckets[index].bucketLabel)}
        >
          {buckets.map((bucket) => {
            const risk = bucketRisk(bucket.bucketLabel, microThreshold);
            return (
              <Cell
                key={bucket.bucketLabel}
                fill={risk ? STATUS_CHART_COLOR[risk] : theme.paretoBarColor}
                fillOpacity={selectedBuckets.has(bucket.bucketLabel) ? 1 : 0.25}
              />
            );
          })}
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
