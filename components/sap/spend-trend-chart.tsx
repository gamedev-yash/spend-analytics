"use client";

import { useMemo, useState } from "react";
import { PlotlyChart, type PlotlyTrace } from "@/components/sap/plotly-chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePalette } from "@/hooks/use-palette";
import type { MonthlyTrendPoint } from "@/lib/sap/aggregate";

interface SpendTrendChartProps {
  trend: MonthlyTrendPoint[];
}

type TrendMode = "total" | "yoy";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CRORE = 10_000_000;

export function SpendTrendChart({ trend }: SpendTrendChartProps) {
  const palette = usePalette();
  const [mode, setMode] = useState<TrendMode>("total");

  const data: PlotlyTrace[] = useMemo(() => {
    if (mode === "total") {
      return [
        {
          type: "bar",
          name: "Spend",
          x: trend.map((t) => t.month),
          y: trend.map((t) => t.total / CRORE),
          customdata: trend.map((t) => t.total),
          marker: { color: palette.categorical.blue, cornerradius: 4 },
          hovertemplate: "<b>%{x}</b><br>Spend: ₹%{customdata:,.0f}<extra></extra>",
        },
      ];
    }
    // yoy: overlay 2025 vs 2024 by month-of-year
    const byYear = (year: number) =>
      MONTH_NAMES.map((_, idx) => {
        const key = `${year}-${String(idx + 1).padStart(2, "0")}`;
        const total = trend.find((t) => t.month === key)?.total;
        return total !== undefined ? total / CRORE : null;
      });
    return [
      {
        type: "scatter",
        mode: "lines+markers",
        name: "2025",
        x: MONTH_NAMES,
        y: byYear(2025),
        line: { color: palette.categorical.blue, width: 2 },
        hovertemplate: "%{x} 2025: ₹%{y:,.1f} Cr<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines+markers",
        name: "2024",
        x: MONTH_NAMES,
        y: byYear(2024),
        line: { color: palette.categorical.orange, width: 2, dash: "dot" },
        hovertemplate: "%{x} 2024: ₹%{y:,.1f} Cr<extra></extra>",
      },
    ];
  }, [mode, trend, palette]);

  return (
    <div className="flex h-full flex-col gap-1.5">
      <Tabs value={mode} onValueChange={(v) => setMode(v as TrendMode)} className="shrink-0">
        <TabsList>
          <TabsTrigger value="total" className="text-xs">Total Spend</TabsTrigger>
          <TabsTrigger value="yoy" className="text-xs">YoY Comparison</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="min-h-0 flex-1">
        <PlotlyChart
          data={data}
          layout={{
            legend: { orientation: "h", y: -0.18 },
            xaxis: { type: mode === "yoy" ? "category" : undefined },
            yaxis: { title: { text: "Spend (₹ Cr)" } },
            bargap: 0.2,
            margin: { t: 16, r: 24, b: 16, l: 48 },
          }}
        />
      </div>
    </div>
  );
}
