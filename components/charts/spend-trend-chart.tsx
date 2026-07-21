"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsdCompact } from "@/lib/format";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import type { MonthlyTrendPoint } from "@/lib/aggregate-summary";

interface SpendTrendChartProps {
  data: MonthlyTrendPoint[];
}

/** Trend over time, one $ axis, three named series — never dual-axis. Legend is clickable to isolate a series. */
export function SpendTrendChart({ data }: SpendTrendChartProps) {
  const palette = usePalette();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const series = [
    { key: "totalSpend", label: "Total Spend", color: palette.categorical.blue },
    { key: "contractSpend", label: "Contract Spend", color: palette.categorical.green },
    { key: "nonContractSpend", label: "Non-Contract Spend", color: palette.categorical.orange },
  ] as const;

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={palette.ink.grid} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={{ stroke: palette.ink.baseline }}
          tick={{ fill: palette.ink.muted, fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: palette.ink.muted, fontSize: 12 }}
          tickFormatter={(v) => formatUsdCompact(v)}
          width={56}
        />
        <Tooltip
          content={({ active, label, payload }) => (
            <ChartTooltipCard
              active={active}
              heading={String(label)}
              rows={(payload ?? [])
                .filter((p) => !hidden.has(String(p.dataKey)))
                .map((p) => ({
                  label: series.find((s) => s.key === p.dataKey)?.label ?? String(p.dataKey),
                  value: formatUsdCompact(Number(p.value)),
                  color: String(p.color),
                }))}
            />
          )}
        />
        <Legend
          iconType="plainline"
          onClick={(entry) => toggle(String(entry.dataKey))}
          wrapperStyle={{ fontSize: 12, color: palette.ink.secondary, paddingTop: 8, cursor: "pointer" }}
          formatter={(value, entry) => (
            <span style={{ opacity: hidden.has(String(entry.dataKey)) ? 0.4 : 1 }}>{value}</span>
          )}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            hide={hidden.has(s.key)}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
