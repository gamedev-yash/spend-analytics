"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PlotMouseEvent } from "plotly.js";
import { PlotlyChart, type PlotlyTrace } from "@/components/sap/plotly-chart";
import { usePalette } from "@/hooks/use-palette";
import { colorForL1 } from "@/lib/sap/theme";
import type { SunburstNode } from "@/lib/sap/aggregate";

interface SpendSunburstProps {
  nodes: SunburstNode[];
  plantNameToCode: Record<string, string>;
}

/** BU -> L1 -> L2 sunburst. Plotly gives click-to-drill for free; onClick also cross-filters BU/category. */
export function SpendSunburst({ nodes, plantNameToCode }: SpendSunburstProps) {
  const palette = usePalette();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleClick(event: Readonly<PlotMouseEvent>) {
    const point = event.points?.[0] as unknown as { id?: string };
    if (!point?.id) return;
    const parts = point.id.split("|");
    const params = new URLSearchParams(searchParams.toString());

    if (parts.length === 1) {
      const code = plantNameToCode[parts[0]];
      if (!code) return;
      if (params.get("bu") === code) params.delete("bu");
      else params.set("bu", code);
    } else {
      const categoryPath = parts.slice(1).join("|");
      if (params.get("catPath") === categoryPath) params.delete("catPath");
      else params.set("catPath", categoryPath);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const colors = nodes.map((n) => {
    const parts = n.id.split("|");
    if (parts.length === 1) return palette.ink.baseline; // BU ring — neutral, L1/L2 rings carry the color story
    return colorForL1(parts[1], palette);
  });

  const data: PlotlyTrace[] = [
    {
      type: "sunburst",
      ids: nodes.map((n) => n.id),
      labels: nodes.map((n) => n.label),
      parents: nodes.map((n) => n.parent),
      values: nodes.map((n) => n.value),
      branchvalues: "total",
      marker: { colors, line: { width: 1, color: palette.ink.surface } },
      hovertemplate: "<b>%{label}</b><br>₹%{value:,.0f}<extra></extra>",
    },
  ];

  return <PlotlyChart data={data} onClick={handleClick} layout={{ margin: { t: 8, r: 8, b: 8, l: 8 } }} />;
}
