"use client";

import dynamic from "next/dynamic";
import type { Layout, Config, PlotMouseEvent } from "plotly.js";
import { Skeleton } from "@/components/ui/skeleton";
import { usePalette } from "@/hooks/use-palette";
import { cn } from "@/lib/utils";

const Plot = dynamic(() => import("@/components/sap/plotly-base"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/**
 * @types/plotly.js's `Data` union omits treemap/sunburst trace shapes
 * entirely (only scatter/bar/box/violin/ohlc/candlestick/pie/sankey are
 * covered), so traces here are typed as plain records rather than fighting
 * incomplete community types for the two chart forms this dashboard needs most.
 */
export type PlotlyTrace = { type: string } & Record<string, unknown>;

export interface PlotlyChartProps {
  data: PlotlyTrace[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  onClick?: (event: Readonly<PlotMouseEvent>) => void;
  /** Omit to fill the parent container's height instead (the dashboard grid cells define it) — pass a number only for a genuinely intrinsic size. */
  height?: number;
  className?: string;
}

/**
 * Theme-aware Plotly shell — every chart in Initiative 18 renders through
 * this so dark/light, fonts, and margins stay consistent without each chart
 * re-deriving them. Plotly is client-only (touches `document`), hence the
 * `ssr:false` dynamic import above.
 */
export function PlotlyChart({ data, layout, config, onClick, height, className }: PlotlyChartProps) {
  const palette = usePalette();

  const mergedLayout: Partial<Layout> = {
    autosize: true,
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { family: "system-ui, -apple-system, Segoe UI, sans-serif", color: palette.ink.secondary, size: 12 },
    margin: { t: 24, r: 24, b: 36, l: 16 },
    hoverlabel: {
      bgcolor: palette.isDark ? "#1e293b" : "#ffffff",
      bordercolor: palette.ink.grid,
      font: { color: palette.ink.primary, size: 12 },
    },
    xaxis: { gridcolor: palette.ink.grid, linecolor: palette.ink.baseline, zerolinecolor: palette.ink.grid, ...layout?.xaxis },
    yaxis: { gridcolor: palette.ink.grid, linecolor: palette.ink.baseline, zerolinecolor: palette.ink.grid, ...layout?.yaxis },
    legend: { font: { color: palette.ink.secondary, size: 11 }, ...layout?.legend },
    ...layout,
  };

  return (
    <div className={cn(!height && "h-full", className)} style={height ? { height } : undefined}>
      <Plot
        data={data}
        layout={mergedLayout}
        config={{ displayModeBar: false, responsive: true, ...config }}
        onClick={onClick}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    </div>
  );
}
