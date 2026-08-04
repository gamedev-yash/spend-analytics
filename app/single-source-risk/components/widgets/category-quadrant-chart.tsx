"use client";

import { Crosshair } from "lucide-react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/dashboard/chart-card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { useSingleSourceRisk } from "../../provider";
import { aggregateCategoryRisk, type CategoryRiskAgg } from "../../selectors";
import { formatCurrencyCompact, formatCurrencyFull } from "../../constants";

export function CategoryQuadrantChart() {
  const palette = usePalette();
  const { baseFilteredInvoices, filters } = useSingleSourceRisk();
  const threshold = filters.supplierCountPerCategory;

  const rows = aggregateCategoryRisk(baseFilteredInvoices, threshold);
  const atRiskRows = rows.filter((row) => row.isAtRisk);
  const diversifiedRows = rows.filter((row) => !row.isAtRisk);

  return (
    <ChartCard
      title="Category Risk Quadrant"
      description={`All ${rows.length} categories — spend vs. supplier count (red = at or below ≤${threshold})`}
      icon={<Crosshair />}
      accent="red"
      action={
        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.status.critical }} />
            At risk
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.categorical.blue }} />
            Diversified
          </span>
        </div>
      }
    >
      <div style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid stroke={palette.ink.grid} />
            <XAxis
              type="number"
              dataKey="supplierCount"
              allowDecimals={false}
              name="Suppliers"
              stroke={palette.ink.muted}
              tick={{ fill: palette.ink.muted, fontSize: 12 }}
              tickLine={false}
              label={{
                value: "Distinct Suppliers",
                position: "insideBottom",
                offset: -16,
                fill: palette.ink.muted,
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="spend"
              scale="log"
              domain={["auto", "auto"]}
              allowDataOverflow
              name="Spend"
              tickFormatter={formatCurrencyCompact}
              stroke={palette.ink.muted}
              tick={{ fill: palette.ink.muted, fontSize: 12 }}
              tickLine={false}
              width={72}
              label={{
                value: "Spend (log scale)",
                angle: -90,
                position: "insideLeft",
                fill: palette.ink.muted,
                fontSize: 12,
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                const row = (payload?.[0]?.payload ?? null) as CategoryRiskAgg | null;
                if (!row) return null;
                return (
                  <ChartTooltipCard
                    active={active}
                    heading={row.label}
                    rows={[
                      { label: "Spend", value: formatCurrencyFull(row.spend) },
                      { label: "Suppliers", value: row.supplierCount.toLocaleString() },
                      { label: "Products", value: row.productCount.toLocaleString() },
                      { label: "Risk status", value: row.isAtRisk ? "At risk" : "Diversified" },
                    ]}
                  />
                );
              }}
              cursor={{ strokeDasharray: "3 3", stroke: palette.ink.grid }}
            />
            <Scatter name="At risk" data={atRiskRows} fill={palette.status.critical} />
            <Scatter name="Diversified" data={diversifiedRows} fill={palette.categorical.blue} fillOpacity={0.65} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
