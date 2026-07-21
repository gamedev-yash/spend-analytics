"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipContentProps,
} from "recharts";
import type { MonthlyTrendPoint, SpendSegment } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { GRIDLINE, AXIS_LINE, TEXT_MUTED, SEGMENT_COLOR } from "../theme";

interface TailTrendChartProps {
  months: MonthlyTrendPoint[];
}

const SEGMENT_KEYS: Array<{ key: "strategicSpend" | "coreSpend" | "tailSpend"; segment: SpendSegment }> = [
  { key: "strategicSpend", segment: "Strategic" },
  { key: "coreSpend", segment: "Core" },
  { key: "tailSpend", segment: "Tail" },
];

function TrendTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as MonthlyTrendPoint | undefined;
  if (!row) return null;
  const total = row.strategicSpend + row.coreSpend + row.tailSpend;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-slate-300">{label}</p>
      {SEGMENT_KEYS.map(({ key, segment }) => (
        <p key={key} className="mt-1 text-xs text-slate-400">
          <span className="mr-1.5 inline-block h-0.5 w-2.5 align-middle" style={{ backgroundColor: SEGMENT_COLOR[segment] }} />
          {segment} · <span className="font-semibold text-slate-100">{formatINR(row[key])}</span>
        </p>
      ))}
      <p className="mt-1.5 border-t border-slate-700 pt-1.5 text-xs text-slate-400">
        Total <span className="font-semibold text-slate-100">{formatINR(total)}</span>
      </p>
    </div>
  );
}

/**
 * Stacked area over the trailing 12 months. Tail spend climbs steadily while
 * strategic/core swing with capex cycles — the point is that tail is a
 * structural drag, not a one-off.
 */
export function TailTrendChart({ months }: TailTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <AreaChart data={months} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRIDLINE} />
        <XAxis
          dataKey="month"
          stroke={AXIS_LINE}
          tick={{ fill: TEXT_MUTED, fontSize: 11 }}
          tickLine={false}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={48}
        />
        <YAxis
          tickFormatter={(v) => formatINR(v)}
          stroke={AXIS_LINE}
          tick={{ fill: TEXT_MUTED, fontSize: 12 }}
          tickLine={false}
          width={56}
        />
        <Tooltip content={(props) => <TrendTooltip {...props} />} cursor={{ stroke: AXIS_LINE, strokeWidth: 1 }} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: TEXT_MUTED }}
          formatter={(value) => <span style={{ color: TEXT_MUTED }}>{value}</span>}
        />
        {SEGMENT_KEYS.map(({ key, segment }) => (
          <Area
            key={key}
            dataKey={key}
            name={segment}
            stackId="spend"
            stroke={SEGMENT_COLOR[segment]}
            strokeWidth={2}
            fill={SEGMENT_COLOR[segment]}
            fillOpacity={0.35}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
