"use client";

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { SupplierBubblePoint, SpendSegment } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";

interface TailBubbleChartProps {
  suppliers: SupplierBubblePoint[];
}

const SEGMENTS: SpendSegment[] = ["Strategic", "Core", "Tail"];

/**
 * Supplier segmentation matrix — PO count (x) vs avg PO value (y, log scale
 * given the ~4-order-of-magnitude spread), bubble size = total spend. The
 * bottom-right cluster (many, low-value POs) is the consolidation signal.
 */
export function TailBubbleChart({ suppliers }: TailBubbleChartProps) {
  const theme = useTailSpendTheme();

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Bottom-right = many low-value POs to one supplier — the clearest signal to
        move to a blanket PO or catalog.
      </p>
      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={theme.gridline} />
          <XAxis
            type="number"
            dataKey="poCount"
            name="PO count"
            stroke={theme.axisLine}
            tick={{ fill: theme.textMuted, fontSize: 12 }}
            tickLine={false}
            label={{ value: "PO count per supplier", position: "insideBottom", offset: -16, fill: theme.textMuted, fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="avgPOValue"
            name="Avg PO value"
            scale="log"
            domain={[3000, 50_000_000]}
            allowDataOverflow
            tickFormatter={(v) => formatINR(v)}
            stroke={theme.axisLine}
            tick={{ fill: theme.textMuted, fontSize: 12 }}
            tickLine={false}
            width={64}
            label={{ value: "Avg PO value (log)", angle: -90, position: "insideLeft", fill: theme.textMuted, fontSize: 12 }}
          />
          <ZAxis dataKey="totalSpend" range={[80, 1000]} name="Total spend" />
          <Tooltip
            content={({ active, payload }) => {
              const row = (payload?.[0]?.payload ?? null) as SupplierBubblePoint | null;
              if (!row) return null;
              return (
                <ChartTooltipCard
                  active={active}
                  heading={row.supplierName}
                  rows={[
                    { label: "Category", value: row.category },
                    { label: "PO Count", value: String(row.poCount) },
                    { label: "Avg PO Value", value: formatINR(row.avgPOValue) },
                    { label: "Total Spend", value: formatINR(row.totalSpend) },
                    { label: "Segment", value: row.segment, color: theme.segmentColor[row.segment] },
                  ]}
                />
              );
            }}
            cursor={{ strokeDasharray: "0", stroke: theme.axisLine }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: theme.textMuted }}
            formatter={(value) => <span style={{ color: theme.textMuted }}>{value}</span>}
          />
          {SEGMENTS.map((segment) => (
            <Scatter
              key={segment}
              name={segment}
              data={suppliers.filter((s) => s.segment === segment)}
              fill={theme.segmentColor[segment]}
              fillOpacity={0.75}
              stroke={theme.segmentColor[segment]}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
