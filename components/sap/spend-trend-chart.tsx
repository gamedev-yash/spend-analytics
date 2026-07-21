"use client";

import { useMemo, useState } from "react";
import { PlotlyChart, type PlotlyTrace } from "@/components/sap/plotly-chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePalette } from "@/hooks/use-palette";
import { colorForL1, orderL1s } from "@/lib/sap/theme";
import type { MonthlyTrendPoint, SpikeMarker } from "@/lib/sap/aggregate";

interface SpendTrendChartProps {
  trend: MonthlyTrendPoint[];
  spikes: SpikeMarker[];
}

type TrendMode = "stacked" | "line" | "yoy";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function SpendTrendChart({ trend, spikes }: SpendTrendChartProps) {
  const palette = usePalette();
  const [mode, setMode] = useState<TrendMode>("stacked");

  const allL1 = useMemo(
    () => orderL1s(Array.from(new Set(trend.flatMap((t) => Object.keys(t.byL1))))),
    [trend]
  );
  const spikeMonths = useMemo(() => new Set(spikes.map((s) => s.month)), [spikes]);

  const data: PlotlyTrace[] = useMemo(() => {
    if (mode === "stacked") {
      return allL1.map((l1) => ({
        type: "scatter",
        mode: "lines",
        name: l1,
        stackgroup: "spend",
        x: trend.map((t) => t.month),
        y: trend.map((t) => t.byL1[l1] ?? 0),
        line: { width: 0.5, color: colorForL1(l1, palette) },
        fillcolor: colorForL1(l1, palette),
        hovertemplate: `<b>${l1}</b><br>%{x}: ₹%{y:,.0f}<extra></extra>`,
      }));
    }
    if (mode === "line") {
      const spikeX = trend.filter((t) => spikeMonths.has(t.month)).map((t) => t.month);
      const spikeY = trend.filter((t) => spikeMonths.has(t.month)).map((t) => t.total);
      return [
        {
          type: "scatter",
          mode: "lines",
          name: "Total Spend",
          x: trend.map((t) => t.month),
          y: trend.map((t) => t.total),
          line: { color: palette.categorical.blue, width: 2 },
          hovertemplate: "%{x}: ₹%{y:,.0f}<extra></extra>",
        },
        {
          type: "scatter",
          mode: "markers",
          name: "Significant spike (>2σ)",
          x: spikeX,
          y: spikeY,
          marker: { color: palette.status.critical, size: 10, symbol: "diamond" },
          hovertemplate: "Spike — %{x}: ₹%{y:,.0f}<extra></extra>",
        },
      ];
    }
    // yoy: overlay 2025 vs 2024 by month-of-year
    const byYear = (year: number) =>
      MONTH_NAMES.map((_, idx) => {
        const key = `${year}-${String(idx + 1).padStart(2, "0")}`;
        return trend.find((t) => t.month === key)?.total ?? null;
      });
    return [
      {
        type: "scatter",
        mode: "lines+markers",
        name: "2025",
        x: MONTH_NAMES,
        y: byYear(2025),
        line: { color: palette.categorical.blue, width: 2 },
      },
      {
        type: "scatter",
        mode: "lines+markers",
        name: "2024",
        x: MONTH_NAMES,
        y: byYear(2024),
        line: { color: palette.categorical.orange, width: 2, dash: "dot" },
      },
    ];
  }, [mode, trend, allL1, palette, spikeMonths]);

  return (
    <div className="flex h-full flex-col gap-1.5">
      <Tabs value={mode} onValueChange={(v) => setMode(v as TrendMode)} className="shrink-0">
        <TabsList>
          <TabsTrigger value="stacked" className="text-xs">Stacked Area</TabsTrigger>
          <TabsTrigger value="line" className="text-xs">Line (Total)</TabsTrigger>
          <TabsTrigger value="yoy" className="text-xs">YoY Comparison</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="min-h-0 flex-1">
        <PlotlyChart
          data={data}
          layout={{
            legend: { orientation: "h", y: -0.18 },
            xaxis: { type: mode === "yoy" ? "category" : undefined },
            margin: { t: 16, r: 24, b: 16, l: 16 },
          }}
        />
      </div>
    </div>
  );
}
