"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PlotMouseEvent } from "plotly.js";
import { PlotlyChart, type PlotlyTrace } from "@/components/sap/plotly-chart";
import { usePalette } from "@/hooks/use-palette";
import { colorForL1, orderL1s } from "@/lib/sap/theme";
import type { BuSpendRow } from "@/lib/sap/aggregate";

interface SpendByBuChartProps {
  rows: BuSpendRow[];
}

/** Horizontal stacked bar by BU, segments by L1, with a % annotation past each bar's end. Bars cross-filter to that BU. */
export function SpendByBuChart({ rows }: SpendByBuChartProps) {
  const palette = usePalette();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const ordered = [...rows].reverse(); // highest spend renders at top
  const allL1 = orderL1s(Array.from(new Set(rows.flatMap((r) => Object.keys(r.byL1)))));

  function handleClick(event: Readonly<PlotMouseEvent>) {
    const point = event.points?.[0] as unknown as { y?: string };
    const row = ordered.find((r) => r.plantName === point?.y);
    if (!row) return;
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("bu") === row.plantCode) params.delete("bu");
    else params.set("bu", row.plantCode);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const barTraces: PlotlyTrace[] = allL1.map((l1) => ({
    type: "bar",
    orientation: "h",
    name: l1,
    x: ordered.map((r) => r.byL1[l1] ?? 0),
    y: ordered.map((r) => r.plantName),
    marker: { color: colorForL1(l1, palette) },
    hovertemplate: `<b>%{y}</b><br>${l1}: ₹%{x:,.0f}<extra></extra>`,
  }));

  const annotations = ordered.map((r) => ({
    x: r.total,
    y: r.plantName,
    xref: "x" as const,
    yref: "y" as const,
    text: `${r.percentOfTotal.toFixed(1)}%`,
    showarrow: false,
    xanchor: "left" as const,
    xshift: 8,
    font: { size: 11, color: palette.ink.secondary },
  }));

  return (
    <PlotlyChart
      data={barTraces}
      height={Math.max(280, ordered.length * 44)}
      onClick={handleClick}
      layout={{
        barmode: "stack",
        yaxis: { automargin: true },
        legend: { orientation: "h", y: -0.12 },
        margin: { t: 24, r: 56, b: 36, l: 16 },
        annotations,
      }}
    />
  );
}
