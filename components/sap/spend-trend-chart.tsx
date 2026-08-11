"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { formatInr } from "@/lib/sap/format-inr";
import type { MonthlyTrendPoint } from "@/lib/sap/aggregate";

interface SpendTrendChartProps {
  trend: MonthlyTrendPoint[];
}

type TrendMode = "total" | "yoy";

interface TotalDatum {
  month: string;
  valueCr: number;
  totalInr: number;
}

interface YoyDatum {
  month: string;
  y2025: number | null;
  y2024: number | null;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CRORE = 10_000_000;

export function SpendTrendChart({ trend }: SpendTrendChartProps) {
  const palette = usePalette();
  const [mode, setMode] = useState<TrendMode>("total");

  const totalData: TotalDatum[] = useMemo(
    () => trend.map((t) => ({ month: t.month, valueCr: t.total / CRORE, totalInr: t.total })),
    [trend]
  );

  const yoyData: YoyDatum[] = useMemo(() => {
    const byYear = (year: number) =>
      MONTH_NAMES.map((_, idx) => {
        const key = `${year}-${String(idx + 1).padStart(2, "0")}`;
        const total = trend.find((t) => t.month === key)?.total;
        return total !== undefined ? total / CRORE : null;
      });
    const y2025 = byYear(2025);
    const y2024 = byYear(2024);
    return MONTH_NAMES.map((m, idx) => ({ month: m, y2025: y2025[idx], y2024: y2024[idx] }));
  }, [trend]);

  return (
    <div className="flex h-full flex-col gap-1.5">
      <Tabs value={mode} onValueChange={(v) => setMode(v as TrendMode)} className="shrink-0">
        <TabsList>
          <TabsTrigger value="total" className="text-xs">Total Spend</TabsTrigger>
          <TabsTrigger value="yoy" className="text-xs">YoY Comparison</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "total" ? (
            <BarChart data={totalData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.ink.grid} />
              <XAxis
                dataKey="month"
                stroke={palette.ink.baseline}
                tick={{ fontSize: 11, fill: palette.ink.muted }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => v.toFixed(0)}
                stroke={palette.ink.baseline}
                tick={{ fontSize: 11, fill: palette.ink.muted }}
                tickLine={false}
                width={44}
                label={{ value: "₹ Cr", angle: -90, position: "insideLeft", fontSize: 11, fill: palette.ink.muted }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  const row = (payload?.[0]?.payload ?? null) as TotalDatum | null;
                  if (!row) return null;
                  return (
                    <ChartTooltipCard active={active} heading={String(label)} rows={[{ label: "Spend", value: formatInr(row.totalInr) }]} />
                  );
                }}
                cursor={{ fill: palette.isDark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.05)" }}
              />
              <Bar dataKey="valueCr" name="Spend" fill={palette.categorical.blue} radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={yoyData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.ink.grid} />
              <XAxis
                dataKey="month"
                stroke={palette.ink.baseline}
                tick={{ fontSize: 11, fill: palette.ink.muted }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => v.toFixed(0)}
                stroke={palette.ink.baseline}
                tick={{ fontSize: 11, fill: palette.ink.muted }}
                tickLine={false}
                width={44}
                label={{ value: "₹ Cr", angle: -90, position: "insideLeft", fontSize: 11, fill: palette.ink.muted }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <ChartTooltipCard
                      active={active}
                      heading={String(label)}
                      rows={payload.map((p) => ({
                        label: p.dataKey === "y2025" ? "2025" : "2024",
                        value: p.value == null ? "–" : `₹${Number(p.value).toFixed(1)} Cr`,
                        color: String(p.color ?? ""),
                      }))}
                    />
                  );
                }}
                cursor={{ stroke: palette.ink.baseline, strokeWidth: 1 }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: palette.ink.muted }} />
              <Line dataKey="y2025" name="2025" stroke={palette.categorical.blue} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              <Line
                dataKey="y2024"
                name="2024"
                stroke={palette.categorical.orange}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 3 }}
                connectNulls={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
