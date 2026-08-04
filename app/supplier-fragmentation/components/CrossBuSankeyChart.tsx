"use client";

import { useMemo } from "react";
import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip } from "recharts";
import { formatInr } from "@/lib/sap/format-inr";
import { useFragTheme } from "./fragTheme";
import { useFragmentation } from "./fragmentationStore";

interface NodeDatum {
  name: string;
  kind: "bu" | "supplier";
}

interface SankeyNodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: NodeDatum & { value: number };
}

/** Node bar + label; BU nodes (left column) label right, suppliers label left. */
function SankeyNodeShape(
  props: SankeyNodeProps & { buColor: string; supplierColor: string; textColor: string }
) {
  const { x, y, width, height, payload, buColor, supplierColor, textColor } = props;
  const isBu = payload.kind === "bu";
  const label = payload.name.length > 24 ? `${payload.name.slice(0, 23)}…` : payload.name;

  return (
    <Layer>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={isBu ? buColor : supplierColor}
        fillOpacity={0.9}
      />
      <text
        x={isBu ? x + width + 5 : x - 5}
        y={y + height / 2}
        textAnchor={isBu ? "start" : "end"}
        dominantBaseline="middle"
        fontSize={10}
        fill={textColor}
      >
        {label}
      </text>
    </Layer>
  );
}

/**
 * View 4 — Cross-BU Supplier Overlap (Sankey): suppliers serving the SAME
 * category across multiple business units. Left nodes = BUs, right nodes =
 * top shared suppliers, flow width = spend — vendors several BUs buy from
 * independently are contract-consolidation leverage.
 */
export function CrossBuSankeyChart() {
  const { derived } = useFragmentation();
  const theme = useFragTheme();
  const { nodes, links } = derived.sankey;

  const data = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ name: n.name, kind: n.kind })),
      links: links.map((l) => ({
        source: l.source,
        target: l.target,
        value: l.value,
        label: l.label,
      })),
    }),
    [nodes, links]
  );

  if (links.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        No suppliers span multiple BUs in this selection
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Sankey
        data={data}
        nodePadding={12}
        nodeWidth={12}
        margin={{ top: 8, right: 150, bottom: 8, left: 8 }}
        link={{ stroke: theme.accent, strokeOpacity: theme.isDark ? 0.3 : 0.25 }}
        node={(nodeProps: unknown) => (
          <SankeyNodeShape
            {...(nodeProps as SankeyNodeProps)}
            buColor={theme.accent}
            supplierColor={theme.teal}
            textColor={theme.textMuted}
          />
        )}
      >
        <Tooltip
          content={({ active, payload }) => {
            const item = payload?.[0];
            if (!active || !item) return null;
            const p = item.payload as { label?: string; name?: string; value?: number };
            const text = p.label ?? (p.name ? `${p.name}: ${formatInr(p.value ?? 0, 2)}` : "");
            if (!text) return null;
            return (
              <div className="rounded-lg border bg-popover px-3 py-2 text-xs font-medium text-popover-foreground shadow-md">
                {text}
              </div>
            );
          }}
        />
      </Sankey>
    </ResponsiveContainer>
  );
}
