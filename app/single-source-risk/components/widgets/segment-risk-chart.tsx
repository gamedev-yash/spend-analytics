"use client";

import { Layers } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/dashboard/chart-card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { useSingleSourceRisk } from "../../provider";
import { aggregateSegmentRisk, type SegmentRiskAgg } from "../../selectors";
import { formatCurrencyCompact, formatCurrencyFull, formatPercent, truncateLabel } from "../../constants";

const MAX_HEIGHT = 460;

export function SegmentRiskChart() {
  const palette = usePalette();
  const { baseFilteredInvoices, filters } = useSingleSourceRisk();

  const rows = aggregateSegmentRisk(baseFilteredInvoices, filters.supplierCountPerCategory).sort(
    (a, b) => b.atRiskSpend - a.atRiskSpend
  );
  const chartHeight = Math.max(rows.length * 34, 220);

  return (
    <ChartCard
      title="At-Risk Spend by Segment"
      description="UNSPSC segment roll-up — at-risk vs. diversified spend"
      icon={<Layers />}
      accent="red"
      action={
        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.status.critical }} />
            At-risk spend
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.status.good }} />
            Diversified spend
          </span>
        </div>
      }
    >
      <div className="overflow-y-auto" style={{ maxHeight: MAX_HEIGHT }}>
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid horizontal={false} stroke={palette.ink.grid} />
              <XAxis
                type="number"
                tickFormatter={formatCurrencyCompact}
                stroke={palette.ink.muted}
                tick={{ fill: palette.ink.muted }}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={190}
                stroke={palette.ink.muted}
                tick={{ fontSize: 11, fill: palette.ink.muted }}
                tickFormatter={(value: string) => truncateLabel(value, 26)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  const row = (payload?.[0]?.payload ?? null) as SegmentRiskAgg | null;
                  if (!row) return null;
                  const atRiskShare = row.totalSpend > 0 ? (row.atRiskSpend / row.totalSpend) * 100 : 0;
                  return (
                    <ChartTooltipCard
                      active={active}
                      heading={row.label}
                      rows={[
                        {
                          label: "At-Risk Spend",
                          value: formatCurrencyFull(row.atRiskSpend),
                          color: palette.status.critical,
                        },
                        {
                          label: "Diversified Spend",
                          value: formatCurrencyFull(row.diversifiedSpend),
                          color: palette.status.good,
                        },
                        { label: "Total Spend", value: formatCurrencyFull(row.totalSpend) },
                        { label: "At-risk share", value: formatPercent(atRiskShare) },
                      ]}
                    />
                  );
                }}
                cursor={{ fill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)" }}
              />
              <Bar dataKey="atRiskSpend" stackId="segment" fill={palette.status.critical} radius={[0, 0, 0, 0]} />
              <Bar dataKey="diversifiedSpend" stackId="segment" fill={palette.status.good} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}
