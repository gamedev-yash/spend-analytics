"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PlotMouseEvent } from "plotly.js";
import { PlotlyChart, type PlotlyTrace } from "@/components/sap/plotly-chart";
import { usePalette } from "@/hooks/use-palette";
import type { TreemapNode } from "@/lib/sap/aggregate";

interface CategoryTreemapProps {
  nodes: TreemapNode[];
}

/**
 * L1 -> L2 treemap. Plotly's own ids/parents hierarchy gives click-to-drill
 * for free; the onClick handler additionally cross-filters the rest of the
 * dashboard via the `cat` URL param (categoryPath = "L1" or "L1|L2").
 */
export function CategoryTreemap({ nodes }: CategoryTreemapProps) {
  const palette = usePalette();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleClick(event: Readonly<PlotMouseEvent>) {
    const point = event.points?.[0] as unknown as { id?: string; parent?: string };
    if (!point?.id || point.id === "All Spend") return;
    const params = new URLSearchParams(searchParams.toString());
    const current = params.get("catPath");
    if (current === point.id) params.delete("catPath");
    else params.set("catPath", point.id);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const data: PlotlyTrace[] = [
    {
      type: "treemap",
      ids: nodes.map((n) => n.id),
      labels: nodes.map((n) => n.label),
      parents: nodes.map((n) => n.parent),
      values: nodes.map((n) => n.value),
      branchvalues: "total",
      customdata: nodes.map((n) => [n.percentOfTotal, n.yoyChangePercent, n.supplierCount, n.poCount]),
      marker: {
        colors: nodes.map((n) => n.yoyChangePercent),
        colorscale: [
          [0, palette.status.good],
          [0.5, palette.ink.grid],
          [1, palette.status.critical],
        ],
        cmid: 0,
        cmin: -30,
        cmax: 30,
        line: { width: 2, color: palette.ink.surface },
      },
      textinfo: "label",
      hovertemplate:
        "<b>%{label}</b><br>Spend: ₹%{value:,.0f}<br>%{customdata[0]:.1f}% of total<br>YoY: %{customdata[1]:+.1f}%<br>Suppliers: %{customdata[2]}<br>POs: %{customdata[3]}<extra></extra>",
      pathbar: { visible: true, thickness: 20 },
    },
  ];

  return <PlotlyChart data={data} onClick={handleClick} />;
}
