"use client";

import { useMemo } from "react";
import { PlotlyChart, type PlotlyTrace } from "@/components/sap/plotly-chart";
import { usePalette } from "@/hooks/use-palette";
import type { MonthlyTrendPoint } from "@/lib/sap/aggregate";
import { formatInrCompact } from "@/lib/sap/format-inr";

interface SpendTrendChartProps {
  trend: MonthlyTrendPoint[];
  invoiceCountByMonth: Record<string, number>;
}

const MONTHS_SHOWN = 12;

function shiftMonth(month: string, years: number): string {
  const [y, m] = month.split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}`;
}

function shortLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${name} '${String(y).slice(2)}`;
}

/**
 * Spend (column) + Invoice Count (line) combo, mirroring the "Spend and
 * Invoice Count Trend" widget in the SAP Spend Control Tower dashboards.
 * Shows the trailing 12 months regardless of the date filter (matching this
 * chart's existing "trend always shows its own fixed window" convention),
 * each bar annotated with its YoY spend change vs the same month last year.
 */
export function SpendTrendChart({ trend, invoiceCountByMonth }: SpendTrendChartProps) {
  const palette = usePalette();

  const recent = useMemo(() => trend.slice(-MONTHS_SHOWN), [trend]);
  const byMonth = useMemo(() => new Map(trend.map((t) => [t.month, t.total])), [trend]);

  const labels = recent.map((t) => shortLabel(t.month));
  const spend = recent.map((t) => t.total);
  const invoices = recent.map((t) => invoiceCountByMonth[t.month] ?? 0);
  const yoy = recent.map((t) => {
    const prior = byMonth.get(shiftMonth(t.month, -1));
    return prior && prior > 0 ? ((t.total - prior) / prior) * 100 : null;
  });

  const data: PlotlyTrace[] = [
    {
      type: "bar",
      name: "Spend",
      x: labels,
      y: spend,
      marker: { color: palette.categorical.blue, cornerradius: 4 },
      text: spend.map((v) => formatInrCompact(v)),
      textposition: "outside",
      textfont: { size: 10, color: palette.ink.secondary },
      cliponaxis: false,
      hovertemplate: "<b>%{x}</b><br>Spend: ₹%{y:,.0f}<extra></extra>",
    },
    {
      type: "scatter",
      mode: "lines+markers+text",
      name: "Invoices",
      x: labels,
      y: invoices,
      yaxis: "y2",
      line: { color: palette.categorical.violet, width: 2 },
      marker: { color: palette.categorical.violet, size: 6 },
      text: invoices.map((v) => v.toLocaleString("en-IN")),
      textposition: "top center",
      textfont: { size: 10, color: palette.categorical.violet },
      hovertemplate: "<b>%{x}</b><br>Invoices: %{y:,.0f}<extra></extra>",
    },
  ];

  const maxSpend = Math.max(...spend, 1);
  const annotations = recent.map((t, i) => {
    const change = yoy[i];
    return {
      x: labels[i],
      y: spend[i] + maxSpend * 0.12,
      xref: "x" as const,
      yref: "y" as const,
      text: change === null ? "" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
      showarrow: false,
      font: { size: 9, color: change !== null && change < 0 ? palette.status.critical : palette.status.good },
    };
  });

  return (
    <div className="h-full">
      <PlotlyChart
        data={data}
        layout={{
          xaxis: { type: "category" },
          yaxis: { title: { text: "Spend" } },
          yaxis2: { overlaying: "y", side: "right", showgrid: false, title: { text: "Invoices" } },
          bargap: 0.35,
          legend: { orientation: "h", y: -0.16 },
          margin: { t: 32, r: 40, b: 16, l: 16 },
          annotations,
        }}
      />
    </div>
  );
}
