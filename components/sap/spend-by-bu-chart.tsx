"use client";

import { PlotlyChart, type PlotlyTrace } from "@/components/sap/plotly-chart";
import { usePalette } from "@/hooks/use-palette";
import type { BuSpendRow } from "@/lib/sap/aggregate";

interface SpendByBuChartProps {
  rows: BuSpendRow[];
}

const CRORE = 10_000_000;

/**
 * Vertical bar of total spend by business unit / plant (x = BU, y = spend in
 * ₹ Cr — the axis title and unit avoid Plotly's default raw-number "0B"
 * auto-formatting), with a % of total annotation above each bar.
 */
export function SpendByBuChart({ rows }: SpendByBuChartProps) {
  const palette = usePalette();

  const ordered = [...rows].sort((a, b) => b.total - a.total);
  const valuesCr = ordered.map((r) => r.total / CRORE);

  const data: PlotlyTrace[] = [
    {
      type: "bar",
      x: ordered.map((r) => r.plantName),
      y: valuesCr,
      customdata: ordered.map((r) => r.total),
      marker: { color: palette.categorical.orange, cornerradius: 4 },
      hovertemplate: "<b>%{x}</b><br>Spend: ₹%{customdata:,.0f}<extra></extra>",
    },
  ];

  const annotations = ordered.map((r, i) => ({
    x: r.plantName,
    y: valuesCr[i],
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
        yaxis: { title: { text: "Spend (₹ Cr)" } },
        bargap: 0.4,
        margin: { t: 24, r: 16, b: 16, l: 48 },
        annotations,
      }}
    />
  );
}
