"use client";

import { useMemo } from "react";
import {
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { formatInr, formatInrCompact } from "@/lib/sap/format-inr";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { useFragTheme } from "./fragTheme";
import { useFragmentation } from "./fragmentationStore";

interface BubbleDatum {
  categoryL2: string;
  categoryL1: string;
  spend: number;
  suppliers: number;
  pos: number;
  hhi: number;
  fragScore: number;
}

/**
 * View 3 — Fragmentation vs Spend: each bubble is one L2 category.
 * x = total spend (log), y = distinct suppliers, size = # POs, color =
 * fragmentation score. Median reference lines split four quadrants:
 * top-right = priority consolidation, top-left = tail-spend easy wins,
 * bottom-right = healthy/concentrated. Click a bubble to drill down.
 */
export function FragmentationBubbleChart() {
  const { derived, toggleCategory, crossFilter } = useFragmentation();
  const theme = useFragTheme();
  const { stats, medSpend, medSup } = derived.bubble;

  const data = useMemo<BubbleDatum[]>(
    () =>
      stats.map((s) => ({
        categoryL2: s.categoryL2,
        categoryL1: s.categoryL1,
        spend: Math.max(s.spend, 1), // log axis cannot take 0
        suppliers: s.nSuppliers,
        pos: s.nPos,
        hhi: s.hhi,
        fragScore: s.fragScore,
      })),
    [stats]
  );

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        No data for the current selection
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* quadrant labels — overlay, aligned to the plot corners */}
      <span className="pointer-events-none absolute right-2 top-1 z-10 rounded bg-black/5 px-1 text-[10px] dark:bg-black/25" style={{ color: theme.bad }}>
        Priority consolidation
      </span>
      <span className="pointer-events-none absolute left-16 top-1 z-10 rounded bg-black/5 px-1 text-[10px] dark:bg-black/25" style={{ color: theme.warn }}>
        Tail-spend — easy wins
      </span>
      <span className="pointer-events-none absolute bottom-9 right-2 z-10 rounded bg-black/5 px-1 text-[10px] dark:bg-black/25" style={{ color: theme.good }}>
        Healthy / concentrated
      </span>

      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 14, right: 12, bottom: 14, left: 8 }}>
          <XAxis
            type="number"
            dataKey="spend"
            scale="log"
            domain={["auto", "auto"]}
            stroke={theme.axis}
            axisLine={false}
            tickLine={false}
            tick={{ fill: theme.textMuted, fontSize: 10 }}
            tickFormatter={(v: number) => formatInrCompact(v, 0)}
            label={{
              value: "Total category spend (₹, log scale)",
              position: "insideBottom",
              offset: -8,
              fill: theme.textMuted,
              fontSize: 11,
            }}
          />
          <YAxis
            type="number"
            dataKey="suppliers"
            stroke={theme.axis}
            axisLine={false}
            tickLine={false}
            tick={{ fill: theme.textMuted, fontSize: 10 }}
            label={{
              value: "Distinct suppliers",
              angle: -90,
              position: "insideLeft",
              fill: theme.textMuted,
              fontSize: 11,
            }}
          />
          <ZAxis type="number" dataKey="pos" range={[36, 900]} name="POs" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: theme.axis }}
            content={({ active, payload }) => {
              const row = (payload?.[0]?.payload ?? null) as BubbleDatum | null;
              if (!row) return null;
              return (
                <ChartTooltipCard
                  active={active}
                  heading={`${row.categoryL2} (${row.categoryL1})`}
                  rows={[
                    { label: "Spend", value: formatInr(row.spend, 2) },
                    { label: "Suppliers", value: String(row.suppliers) },
                    { label: "POs", value: String(row.pos) },
                    { label: "HHI", value: row.hhi.toFixed(0) },
                    {
                      label: "Fragmentation",
                      value: `${(row.fragScore * 100).toFixed(0)}/100`,
                      color: theme.fragColor(row.fragScore),
                    },
                  ]}
                />
              );
            }}
          />
          {medSpend > 0 && (
            <ReferenceLine x={medSpend} stroke={theme.textMuted} strokeDasharray="2 4" />
          )}
          <ReferenceLine y={medSup} stroke={theme.textMuted} strokeDasharray="2 4" />
          <Scatter
            data={data}
            cursor="pointer"
            onClick={(entry) => {
              const datum = (entry as { payload?: BubbleDatum })?.payload ?? (entry as unknown as BubbleDatum);
              if (datum?.categoryL2) toggleCategory(datum.categoryL2);
            }}
          >
            {data.map((row) => (
              <Cell
                key={row.categoryL2}
                fill={theme.fragColor(row.fragScore)}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={1}
                fillOpacity={
                  crossFilter?.categoryL2 && crossFilter.categoryL2 !== row.categoryL2 ? 0.25 : 0.85
                }
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
