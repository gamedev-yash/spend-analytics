"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, type TooltipContentProps } from "recharts";
import type { POValueBucket } from "../tailSpendMock";
import { formatINR, formatCompactNumber } from "../tailSpendMock";
import { CHART_SURFACE, TEXT_MUTED } from "../theme";

interface MicroPOAnalysisProps {
  buckets: POValueBucket[];
  threshold: number;
}

// One-hue ordinal ramp (size tiers — order carries meaning), darkest = smallest
// bucket, lightest = largest. Validated --ordinal against the slate-900 surface.
const ORDINAL_RAMP = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"];
const BUCKET_UPPER_BOUND = [5_000, 25_000, 100_000, 500_000, 2_500_000, Infinity];

function BucketTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as POValueBucket | undefined;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-slate-100">{row.bucketLabel}</p>
      <p className="mt-1 text-xs text-slate-400">
        <span className="font-semibold text-slate-100">{formatCompactNumber(row.poCount)}</span> POs (
        {row.percentOfPOCount}%)
      </p>
      <p className="text-xs text-slate-400">
        <span className="font-semibold text-slate-100">{formatINR(row.totalValue)}</span> value (
        {row.percentOfTotalValue}%)
      </p>
      <p className="text-xs text-slate-400">
        Processing cost <span className="font-semibold text-slate-100">{formatINR(row.processingCost)}</span>
      </p>
    </div>
  );
}

/**
 * Donut of PO value buckets. Bucket size is an ordinal tier (order carries
 * meaning), so color is a single hue ramp, not eight categorical hues. Buckets
 * under the current micro-PO threshold get a bolder ring to stand out.
 */
export function MicroPOAnalysis({ buckets, threshold }: MicroPOAnalysisProps) {
  const microTotal = buckets.reduce((sum, b, i) => {
    const upper = BUCKET_UPPER_BOUND[i];
    return upper <= threshold ? sum + b.poCount : sum;
  }, 0);
  const totalPOs = buckets.reduce((sum, b) => sum + b.poCount, 0);
  const microShare = totalPOs > 0 ? (microTotal / totalPOs) * 100 : 0;

  return (
    <div>
      <div className="relative h-[320px]">
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={buckets}
              dataKey="poCount"
              nameKey="bucketLabel"
              innerRadius={72}
              outerRadius={124}
              paddingAngle={2}
              stroke={CHART_SURFACE}
              strokeWidth={2}
            >
              {buckets.map((bucket, index) => {
                const isHighlighted = BUCKET_UPPER_BOUND[index] <= threshold;
                return (
                  <Cell
                    key={bucket.bucketLabel}
                    fill={ORDINAL_RAMP[index]}
                    stroke={isHighlighted ? "#fbbf24" : CHART_SURFACE}
                    strokeWidth={isHighlighted ? 2.5 : 2}
                  />
                );
              })}
            </Pie>
            <Tooltip content={(props) => <BucketTooltip {...props} />} />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ fontSize: 12, color: TEXT_MUTED }}
              formatter={(value) => <span style={{ color: TEXT_MUTED }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-y-0 left-0 flex w-[68%] items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-semibold text-slate-50">{microShare.toFixed(0)}%</p>
            <p className="text-xs text-slate-500">of POs are micro</p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">
        Amber ring = buckets fully below the current {formatINR(threshold)} micro-PO threshold
      </p>
    </div>
  );
}
