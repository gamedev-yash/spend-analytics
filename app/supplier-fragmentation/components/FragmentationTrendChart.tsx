"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { useFragTheme } from "./fragTheme";
import { useFragmentation } from "./fragmentationStore";

interface TrendDatum {
  quarterLabel: string;
  avgSuppliers: number;
  totalSuppliers: number;
  newSuppliers: number;
  /** totalSuppliers when this quarter is a new-supplier spike, else null. */
  spikeValue: number | null;
}

interface DiamondProps {
  cx?: number | null;
  cy?: number | null;
  fill?: string;
}

/**
 * ◆ marker for spike quarters (drawn on the total-suppliers line). Recharts
 * also invokes this as the Legend's icon swatch, passing cx/cy as `null`
 * (not `undefined`) — default params only cover `undefined`, so `?? 0` is
 * needed on top of them to avoid a literal "null" landing in the `d` attribute.
 */
function Diamond({ cx = 0, cy = 0, fill }: DiamondProps) {
  const safeCx = cx ?? 0;
  const safeCy = cy ?? 0;
  const r = 7;
  return (
    <path
      d={`M ${safeCx} ${safeCy - r} L ${safeCx + r} ${safeCy} L ${safeCx} ${safeCy + r} L ${safeCx - r} ${safeCy} Z`}
      fill={fill}
      stroke="#ffffff"
      strokeWidth={1}
    />
  );
}

/**
 * View 5 — Fragmentation Trend: dual-axis quarterly lines — left axis the
 * average suppliers per category, right axis the total supplier count —
 * with ◆ marking quarters where new-supplier additions spiked. Always spans
 * the full globally-filtered range (chart clicks don't narrow it).
 */
export function FragmentationTrendChart() {
  const { derived } = useFragmentation();
  const theme = useFragTheme();

  const data = useMemo<TrendDatum[]>(
    () =>
      derived.trendPoints.map((p) => ({
        quarterLabel: p.quarterLabel,
        avgSuppliers: p.avgSuppliers,
        totalSuppliers: p.totalSuppliers,
        newSuppliers: p.newSuppliers,
        spikeValue: p.spike ? p.totalSuppliers : null,
      })),
    [derived.trendPoints]
  );

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        No data for the current selection
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <XAxis
          dataKey="quarterLabel"
          stroke={theme.axis}
          axisLine={false}
          tickLine={false}
          tick={{ fill: theme.textMuted, fontSize: 10 }}
        />
        <YAxis
          yAxisId="left"
          stroke={theme.axis}
          axisLine={false}
          tickLine={false}
          tick={{ fill: theme.bad, fontSize: 10 }}
          label={{
            value: "Avg suppliers / category",
            angle: -90,
            position: "insideLeft",
            fill: theme.bad,
            fontSize: 10,
          }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          stroke={theme.axis}
          axisLine={false}
          tickLine={false}
          tick={{ fill: theme.accent, fontSize: 10 }}
          label={{
            value: "Total active suppliers",
            angle: 90,
            position: "insideRight",
            fill: theme.accent,
            fontSize: 10,
          }}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            const row = (payload?.[0]?.payload ?? null) as TrendDatum | null;
            if (!row) return null;
            return (
              <ChartTooltipCard
                active={active}
                heading={String(label)}
                rows={[
                  {
                    label: "Avg suppliers / category",
                    value: row.avgSuppliers.toFixed(1),
                    color: theme.bad,
                  },
                  {
                    label: "Total suppliers",
                    value: String(row.totalSuppliers),
                    color: theme.accent,
                  },
                  {
                    label: "New suppliers",
                    value: row.spikeValue !== null ? `${row.newSuppliers} ◆ spike` : String(row.newSuppliers),
                    color: row.spikeValue !== null ? theme.warn : undefined,
                  },
                ]}
              />
            );
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value) => <span style={{ color: theme.textMuted }}>{value}</span>}
        />
        <Line
          yAxisId="left"
          dataKey="avgSuppliers"
          name="Avg suppliers / category"
          stroke={theme.bad}
          strokeWidth={2.5}
          dot={{ r: 3, fill: theme.bad, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
        <Line
          yAxisId="right"
          dataKey="totalSuppliers"
          name="Total active suppliers"
          stroke={theme.accent}
          strokeWidth={2.5}
          strokeDasharray="4 4"
          dot={{ r: 3, fill: theme.accent, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
        <Scatter
          yAxisId="right"
          dataKey="spikeValue"
          name="New-supplier spike"
          fill={theme.warn}
          shape={<Diamond />}
          legendType="diamond"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
