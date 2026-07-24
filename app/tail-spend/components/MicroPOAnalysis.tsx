"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { POValueBucket } from "../tailSpendMock";
import { formatINR, formatCompactNumber } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";

interface MicroPOAnalysisProps {
  buckets: POValueBucket[];
  threshold: number;
}

const BUCKET_UPPER_BOUND = [5_000, 25_000, 100_000, 500_000, 2_500_000, Infinity];

/**
 * Donut of PO value buckets. Bucket size is an ordinal tier (order carries
 * meaning), so color is a single hue ramp, not eight categorical hues. Buckets
 * under the current micro-PO threshold get a bolder ring to stand out.
 */
export function MicroPOAnalysis({ buckets, threshold }: MicroPOAnalysisProps) {
  const theme = useTailSpendTheme();
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
              stroke={theme.chartSurface}
              strokeWidth={2}
            >
              {buckets.map((bucket, index) => {
                const isHighlighted = BUCKET_UPPER_BOUND[index] <= threshold;
                return (
                  <Cell
                    key={bucket.bucketLabel}
                    fill={theme.microPoRamp[index]}
                    stroke={isHighlighted ? theme.statusColor.warning : theme.chartSurface}
                    strokeWidth={isHighlighted ? 2.5 : 2}
                  />
                );
              })}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const row = (payload?.[0]?.payload ?? null) as POValueBucket | null;
                if (!row) return null;
                return (
                  <ChartTooltipCard
                    active={active}
                    heading={row.bucketLabel}
                    rows={[
                      { label: "POs", value: `${formatCompactNumber(row.poCount)} (${row.percentOfPOCount}%)` },
                      { label: "Value", value: `${formatINR(row.totalValue)} (${row.percentOfTotalValue}%)` },
                      { label: "Processing Cost", value: formatINR(row.processingCost) },
                    ]}
                  />
                );
              }}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ fontSize: 12, color: theme.textMuted }}
              formatter={(value) => <span style={{ color: theme.textMuted }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-y-0 left-0 flex w-[68%] items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{microShare.toFixed(0)}%</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">of POs are micro</p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
        Amber ring = buckets fully below the current {formatINR(threshold)} micro-PO threshold
      </p>
    </div>
  );
}
