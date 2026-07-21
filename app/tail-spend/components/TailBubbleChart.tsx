"use client";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipContentProps,
} from "recharts";
import type { SupplierBubblePoint, SpendSegment } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { GRIDLINE, AXIS_LINE, TEXT_MUTED, SEGMENT_COLOR } from "../theme";

interface TailBubbleChartProps {
  suppliers: SupplierBubblePoint[];
}

const SEGMENTS: SpendSegment[] = ["Strategic", "Core", "Tail"];

function BubbleTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as SupplierBubblePoint | undefined;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-slate-100">{row.supplierName}</p>
      <p className="text-xs text-slate-500">{row.category}</p>
      <p className="mt-1.5 text-xs text-slate-400">
        <span className="font-semibold text-slate-100">{row.poCount}</span> POs ·{" "}
        <span className="font-semibold text-slate-100">{formatINR(row.avgPOValue)}</span> avg
      </p>
      <p className="text-xs text-slate-400">
        Total spend <span className="font-semibold text-slate-100">{formatINR(row.totalSpend)}</span>
      </p>
      <p className="mt-1 text-xs" style={{ color: SEGMENT_COLOR[row.segment] }}>
        ● {row.segment}
      </p>
    </div>
  );
}

/**
 * Supplier segmentation matrix — PO count (x) vs avg PO value (y, log scale
 * given the ~4-order-of-magnitude spread), bubble size = total spend. The
 * bottom-right cluster (many, low-value POs) is the consolidation signal.
 */
export function TailBubbleChart({ suppliers }: TailBubbleChartProps) {
  return (
    <div>
      <p className="mb-3 text-sm text-slate-400">
        Bottom-right = many low-value POs to one supplier — the clearest signal to
        move to a blanket PO or catalog.
      </p>
      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={GRIDLINE} />
          <XAxis
            type="number"
            dataKey="poCount"
            name="PO count"
            stroke={AXIS_LINE}
            tick={{ fill: TEXT_MUTED, fontSize: 12 }}
            tickLine={false}
            label={{ value: "PO count per supplier", position: "insideBottom", offset: -16, fill: TEXT_MUTED, fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="avgPOValue"
            name="Avg PO value"
            scale="log"
            domain={[3000, 50_000_000]}
            allowDataOverflow
            tickFormatter={(v) => formatINR(v)}
            stroke={AXIS_LINE}
            tick={{ fill: TEXT_MUTED, fontSize: 12 }}
            tickLine={false}
            width={64}
            label={{ value: "Avg PO value (log)", angle: -90, position: "insideLeft", fill: TEXT_MUTED, fontSize: 12 }}
          />
          <ZAxis dataKey="totalSpend" range={[80, 1000]} name="Total spend" />
          <Tooltip content={(props) => <BubbleTooltip {...props} />} cursor={{ strokeDasharray: "0", stroke: AXIS_LINE }} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: TEXT_MUTED }}
            formatter={(value) => <span style={{ color: TEXT_MUTED }}>{value}</span>}
          />
          {SEGMENTS.map((segment) => (
            <Scatter
              key={segment}
              name={segment}
              data={suppliers.filter((s) => s.segment === segment)}
              fill={SEGMENT_COLOR[segment]}
              fillOpacity={0.75}
              stroke={SEGMENT_COLOR[segment]}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
