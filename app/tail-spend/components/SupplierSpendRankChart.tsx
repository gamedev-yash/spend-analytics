"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipContentProps,
} from "recharts";
import type { SupplierSpendRank } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { GRIDLINE, AXIS_LINE, TEXT_MUTED, PARETO_BAR_COLOR } from "../theme";

interface SupplierSpendRankChartProps {
  suppliers: SupplierSpendRank[];
}

function RankTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as SupplierSpendRank | undefined;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-slate-100">{row.supplierName}</p>
      <p className="mt-1 text-xs text-slate-400">
        Spend <span className="font-semibold text-slate-100">{formatINR(row.totalSpend)}</span>
      </p>
    </div>
  );
}

/**
 * SAP standard widget — top suppliers (Global Ultimate) ranked by total spend
 * for the currently selected value buckets. Single series, one hue.
 */
export function SupplierSpendRankChart({ suppliers }: SupplierSpendRankChartProps) {
  const sorted = [...suppliers].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
        barCategoryGap="24%"
      >
        <CartesianGrid horizontal={false} stroke={GRIDLINE} />
        <XAxis
          type="number"
          tickFormatter={(v) => formatINR(v)}
          stroke={AXIS_LINE}
          tick={{ fill: TEXT_MUTED, fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="supplierName"
          width={168}
          stroke={AXIS_LINE}
          tick={{ fill: TEXT_MUTED, fontSize: 11 }}
          tickLine={false}
        />
        <Tooltip content={(props) => <RankTooltip {...props} />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
        <Bar dataKey="totalSpend" name="Total Spend" fill={PARETO_BAR_COLOR} radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}
