"use client";

import { TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/dashboard/chart-card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { useSingleSourceRisk } from "../../provider";
import { aggregateExposureTrend, type ExposureTrendPoint } from "../../selectors";
import { formatCurrencyFull, formatMonthLabel } from "../../constants";
import { FullscreenResponsiveContainer } from "@/components/dashboard/fullscreen-overlay";

export function ExposureTrendChart() {
  const palette = usePalette();
  const { baseFilteredInvoices, filters } = useSingleSourceRisk();
  const points = aggregateExposureTrend(baseFilteredInvoices, filters.supplierCountPerCategory);
  const tickInterval = points.length <= 12 ? 0 : "preserveStartEnd";

  return (
    <ChartCard
      title="Single-Source Exposure Trend"
      description={`At-risk share of spend and category count by month, threshold ≤ ${filters.supplierCountPerCategory}`}
      icon={<TrendingUp />}
      accent="red"
    >
      {points.length < 2 ? (
        <p className="flex h-full min-h-[220px] items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
          Not enough months in the selected range to show a trend.
        </p>
      ) : (
        <div className="exposure-trend-fullscreen-grid grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">At-Risk Spend Share</p>
            <div style={{ height: 220 }}>
              <FullscreenResponsiveContainer height={220}>
                <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.ink.grid} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonthLabel}
                    angle={-35}
                    textAnchor="end"
                    height={56}
                    interval={tickInterval}
                    stroke={palette.ink.muted}
                    tick={{ fontSize: 11, fill: palette.ink.muted }}
                  />
                  <YAxis
                    tickFormatter={(value: number) => `${value.toFixed(0)}%`}
                    stroke={palette.ink.muted}
                    tick={{ fontSize: 11, fill: palette.ink.muted }}
                    width={40}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      const point = (payload?.[0]?.payload ?? null) as ExposureTrendPoint | null;
                      if (!point) return null;
                      return (
                        <ChartTooltipCard
                          active={active}
                          heading={formatMonthLabel(point.month)}
                          rows={[
                            {
                              label: "At-risk spend share",
                              value: `${point.atRiskSpendPercent.toFixed(1)}%`,
                              color: palette.status.critical,
                            },
                            { label: "Total spend", value: formatCurrencyFull(point.totalSpend) },
                          ]}
                        />
                      );
                    }}
                    cursor={{ stroke: palette.ink.baseline }}
                  />
                  <Line
                    type="monotone"
                    dataKey="atRiskSpendPercent"
                    stroke={palette.status.critical}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </FullscreenResponsiveContainer>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">At-Risk Categories</p>
            <div style={{ height: 220 }}>
              <FullscreenResponsiveContainer height={220}>
                <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.ink.grid} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonthLabel}
                    angle={-35}
                    textAnchor="end"
                    height={56}
                    interval={tickInterval}
                    stroke={palette.ink.muted}
                    tick={{ fontSize: 11, fill: palette.ink.muted }}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke={palette.ink.muted}
                    tick={{ fontSize: 11, fill: palette.ink.muted }}
                    width={40}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      const point = (payload?.[0]?.payload ?? null) as ExposureTrendPoint | null;
                      if (!point) return null;
                      return (
                        <ChartTooltipCard
                          active={active}
                          heading={formatMonthLabel(point.month)}
                          rows={[
                            {
                              label: "At-risk categories",
                              value: point.atRiskCategoryCount.toLocaleString(),
                              color: palette.status.warning,
                            },
                            { label: "Total spend", value: formatCurrencyFull(point.totalSpend) },
                          ]}
                        />
                      );
                    }}
                    cursor={{ stroke: palette.ink.baseline }}
                  />
                  <Line
                    type="monotone"
                    dataKey="atRiskCategoryCount"
                    stroke={palette.status.warning}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </FullscreenResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
