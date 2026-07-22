"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PlotMouseEvent } from "plotly.js";
import { PlotlyChart, type PlotlyTrace } from "@/components/sap/plotly-chart";
import { usePalette } from "@/hooks/use-palette";
import { colorForL1, orderL1s } from "@/lib/sap/theme";
import type { TopSupplierRow } from "@/lib/sap/aggregate";

interface TopSuppliersChartProps {
  rows: TopSupplierRow[];
  allL1: string[];
  top5Percent: number;
}

/**
 * Horizontal stacked bar (composition by L1) + a Pareto cumulative-% line on
 * a secondary top x-axis sharing the same categorical y-axis. Clicking a
 * bar cross-filters the dashboard to that supplier/group.
 */
export function TopSuppliersChart({ rows, allL1, top5Percent }: TopSuppliersChartProps) {
  const palette = usePalette();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Reverse so the #1 supplier renders at the top of the horizontal bar chart.
  const ordered = [...rows].reverse();
  const l1Order = orderL1s(allL1);

  function handleClick(event: Readonly<PlotMouseEvent>) {
    const point = event.points?.[0] as unknown as { y?: string };
    if (!point?.y) return;
    const supplier = ordered.find((r) => r.displayName === point.y);
    if (!supplier) return;
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("vendor") === supplier.key) params.delete("vendor");
    else params.set("vendor", supplier.key);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const barTraces: PlotlyTrace[] = l1Order.map((l1) => ({
    type: "bar",
    orientation: "h",
    name: l1,
    x: ordered.map((r) => r.byL1[l1] ?? 0),
    y: ordered.map((r) => r.displayName),
    marker: { color: colorForL1(l1, palette) },
    hovertemplate: `<b>%{y}</b><br>${l1}: ₹%{x:,.0f}<extra></extra>`,
  }));

  const paretoTrace: PlotlyTrace = {
    type: "scatter",
    mode: "lines+markers",
    name: "Cumulative %",
    x: ordered.map((r) => r.cumulativePercent),
    y: ordered.map((r) => r.displayName),
    xaxis: "x2",
    line: { color: palette.categorical.red, width: 2 },
    marker: { color: palette.categorical.red, size: 6 },
    hovertemplate: "Cumulative: %{x:.1f}%<extra></extra>",
  };

  return (
    <div className="flex h-full flex-col gap-1">
      <p className="shrink-0 text-xs text-muted-foreground">
        Top 5 suppliers = <span className="font-medium text-foreground">{top5Percent.toFixed(1)}%</span> of total spend
      </p>
      <div className="min-h-0 flex-1">
        <PlotlyChart
          data={[...barTraces, paretoTrace]}
          onClick={handleClick}
          layout={{
            barmode: "stack",
            xaxis: { title: { text: "Spend" } },
            xaxis2: { overlaying: "x", side: "top", range: [0, 100], ticksuffix: "%", showgrid: false, title: { text: "Cumulative %" } },
            yaxis: { automargin: true },
            legend: { orientation: "h", y: -0.12 },
            margin: { t: 24, r: 24, b: 16, l: 16 },
          }}
        />
      </div>
    </div>
  );
}
