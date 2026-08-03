"use client";

import { PlotlyChart, type PlotlyTrace } from "@/components/sap/plotly-chart";
import { usePalette } from "@/hooks/use-palette";
import type { BuSpendRow } from "@/lib/sap/aggregate";

interface SpendByBuChartProps {
  rows: BuSpendRow[];
}

/** Vertical bar of total spend by business unit / plant, with a % annotation above each bar. */
export function SpendByBuChart({ rows }: SpendByBuChartProps) {
  const palette = usePalette();

  const ordered = [...rows].sort((a, b) => b.total - a.total);

  const data: PlotlyTrace[] = [
    {
      type: "bar",
      x: ordered.map((r) => r.plantName),
      y: ordered.map((r) => r.total),
      marker: { color: palette.categorical.orange, cornerradius: 4 },
      hovertemplate: "<b>%{x}</b><br>Spend: ₹%{y:,.0f}<extra></extra>",
    },
  ];

  const annotations = ordered.map((r) => ({
    x: r.plantName,
    y: r.total,
    xref: "x" as const,
    yref: "y" as const,
    text: `${r.percentOfTotal.toFixed(1)}%`,
    showarrow: false,
    yanchor: "bottom" as const,
    yshift: 4,
    font: { size: 11, color: palette.ink.secondary },
  }));

  return (
    <PlotlyChart
      data={data}
      layout={{
        xaxis: { automargin: true },
        bargap: 0.4,
        margin: { t: 24, r: 16, b: 16, l: 16 },
        annotations,
      }}
    />
  );
}
