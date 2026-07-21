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
  type TooltipContentProps,
} from "recharts";
import type { InvoiceValueBucket } from "../tailSpendMock";
import { formatCompactNumber } from "../tailSpendMock";
import { GRIDLINE, AXIS_LINE, TEXT_MUTED, PARETO_BAR_COLOR, PARETO_LINE_COLOR } from "../theme";

interface InvoiceValueBucketChartProps {
  buckets: InvoiceValueBucket[];
  selectedBuckets: Set<string>;
  onToggleBucket: (bucketLabel: string) => void;
}

function BucketTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as InvoiceValueBucket | undefined;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-xs text-slate-400">
        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: PARETO_BAR_COLOR }} />
        <span className="font-semibold text-slate-100">{row.invoicesPerSupplier}</span> invoices/supplier
      </p>
      <p className="mt-0.5 text-xs text-slate-400">
        <span className="mr-1.5 inline-block h-0.5 w-2.5 align-middle" style={{ backgroundColor: PARETO_LINE_COLOR }} />
        <span className="font-semibold text-slate-100">{formatCompactNumber(row.invoiceCount)}</span> invoices
      </p>
    </div>
  );
}

/**
 * SAP standard widget — invoice count by invoice value bucket. Two measures of
 * different scale (invoices/supplier vs. total invoice count) are shown on
 * paired axes, matching the SAP Spend Control Tower's own composed chart;
 * each axis is tinted to its series so the pairing stays legible without a
 * shared scale.
 */
export function InvoiceValueBucketChart({ buckets, selectedBuckets, onToggleBucket }: InvoiceValueBucketChartProps) {
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">Click a bar to isolate its bucket — click again to restore all.</p>
      <ResponsiveContainer width="100%" height={252}>
      <ComposedChart data={buckets} margin={{ top: 8, right: 8, bottom: 8, left: 0 }} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke={GRIDLINE} />
        <XAxis
          dataKey="bucketLabel"
          stroke={AXIS_LINE}
          tick={{ fill: TEXT_MUTED, fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          stroke={AXIS_LINE}
          tick={{ fill: PARETO_BAR_COLOR, fontSize: 11 }}
          tickLine={false}
          width={36}
          label={{ value: "Invoices/supplier", angle: -90, position: "insideLeft", fill: PARETO_BAR_COLOR, fontSize: 10 }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          stroke={AXIS_LINE}
          tick={{ fill: PARETO_LINE_COLOR, fontSize: 11 }}
          tickLine={false}
          width={44}
          tickFormatter={(v) => formatCompactNumber(v)}
        />
        <Tooltip content={(props) => <BucketTooltip {...props} />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: TEXT_MUTED }}
          formatter={(value) => <span style={{ color: TEXT_MUTED }}>{value}</span>}
        />
        <Bar
          yAxisId="left"
          dataKey="invoicesPerSupplier"
          name="Invoices per Supplier"
          fill={PARETO_BAR_COLOR}
          maxBarSize={40}
          cursor="pointer"
          onClick={(_, index) => onToggleBucket(buckets[index].bucketLabel)}
        >
          {buckets.map((bucket) => (
            <Cell
              key={bucket.bucketLabel}
              fill={PARETO_BAR_COLOR}
              fillOpacity={selectedBuckets.has(bucket.bucketLabel) ? 1 : 0.25}
            />
          ))}
        </Bar>
        <Line
          yAxisId="right"
          dataKey="invoiceCount"
          name="Number of Invoices"
          stroke={PARETO_LINE_COLOR}
          strokeWidth={2}
          dot={{ r: 3, fill: PARETO_LINE_COLOR, strokeWidth: 0 }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "#0f172a" }}
        />
      </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
