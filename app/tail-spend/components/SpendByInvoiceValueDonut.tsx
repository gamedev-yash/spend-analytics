"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, type TooltipContentProps } from "recharts";
import type { InvoiceValueBucket } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { CHART_SURFACE, TEXT_MUTED, INVOICE_BUCKET_RAMP } from "../theme";

interface SpendByInvoiceValueDonutProps {
  buckets: InvoiceValueBucket[];
  selectedBuckets: Set<string>;
}

function DonutTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as InvoiceValueBucket | undefined;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-slate-100">{row.bucketLabel}</p>
      <p className="mt-1 text-xs text-slate-400">
        <span className="font-semibold text-slate-100">{formatINR(row.spend)}</span> ({row.spendPercent}%)
      </p>
    </div>
  );
}

/**
 * SAP standard widget — spend percentage split across the same invoice-value
 * buckets as the top-left widget. Ordinal ramp (order = bucket size), not
 * categorical hues.
 */
export function SpendByInvoiceValueDonut({ buckets, selectedBuckets }: SpendByInvoiceValueDonutProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={buckets}
          dataKey="spend"
          nameKey="bucketLabel"
          innerRadius={62}
          outerRadius={104}
          paddingAngle={2}
          stroke={CHART_SURFACE}
          strokeWidth={2}
        >
          {buckets.map((bucket, index) => (
            <Cell
              key={bucket.bucketLabel}
              fill={INVOICE_BUCKET_RAMP[index]}
              fillOpacity={selectedBuckets.has(bucket.bucketLabel) ? 1 : 0.25}
            />
          ))}
        </Pie>
        <Tooltip content={(props) => <DonutTooltip {...props} />} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          wrapperStyle={{ fontSize: 11, color: TEXT_MUTED }}
          formatter={(value) => <span style={{ color: TEXT_MUTED }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
