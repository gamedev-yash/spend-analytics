"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, formatPercent, formatUsdCompact } from "@/lib/format";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import { BUSINESS_UNIT_ORDER, CATEGORY_ORDER, VIOLATION_TYPE_ORDER } from "@/lib/chart-colors";

export interface HorizontalBarDatum {
  name: string;
  value: number;
  subtitle?: string;
  /** Entity used for fixed-order color lookup when it differs from `name` (e.g. a plant's business unit). */
  colorKey?: string;
}

type ValueFormat = "usd" | "percent" | "number";
type EntityDimension = "businessUnit" | "violationType" | "category";

const ENTITY_ORDERS: Record<EntityDimension, string[]> = {
  businessUnit: BUSINESS_UNIT_ORDER,
  violationType: VIOLATION_TYPE_ORDER,
  category: CATEGORY_ORDER,
};

interface HorizontalBarChartProps {
  data: HorizontalBarDatum[];
  format: ValueFormat;
  /** "threshold" colors each bar by compliance health; "entity" colors by a fixed-order dimension (with a legend). */
  colorMode?: "single" | "threshold" | "entity";
  entityDimension?: EntityDimension;
  height?: number;
  /** When set, clicking a bar toggles this searchParam to the bar's colorKey/name — click again to clear. */
  filterParamKey?: string;
}

/**
 * Magnitude comparison across nominal categories. Single-hue by default (no
 * value-ramp on categories with no natural order); "entity" mode assigns a
 * fixed-order categorical color per entity plus a legend, for dimensions
 * with a real, stable identity (business unit, violation type).
 */
export function HorizontalBarChart({
  data,
  format,
  colorMode = "single",
  entityDimension,
  height,
  filterParamKey,
}: HorizontalBarChartProps) {
  const palette = usePalette();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rowHeight = 34;
  const chartHeight = height ?? Math.max(160, data.length * rowHeight);
  const formatters: Record<ValueFormat, (v: number) => string> = {
    usd: formatUsdCompact,
    percent: (v) => formatPercent(v),
    number: formatNumber,
  };
  const valueFormatter = formatters[format];

  const order = entityDimension ? ENTITY_ORDERS[entityDimension] : null;
  function colorFor(d: HorizontalBarDatum): string {
    if (colorMode === "threshold") return palette.complianceStatusColor(d.value);
    if (colorMode === "entity" && order) {
      const idx = order.indexOf(d.colorKey ?? d.name);
      return idx === -1 ? palette.ink.muted : palette.colorForIndex(idx);
    }
    return palette.categorical.blue;
  }

  const activeFilterValue = filterParamKey ? searchParams.get(filterParamKey) : null;

  function handleBarClick(clicked: { payload?: HorizontalBarDatum }) {
    const d = clicked.payload;
    if (!filterParamKey || !d) return;
    const key = d.colorKey ?? d.name;
    const params = new URLSearchParams(searchParams.toString());
    if (activeFilterValue === key) params.delete(filterParamKey);
    else params.set(filterParamKey, key);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const legendEntities =
    colorMode === "entity" && order
      ? Array.from(new Set(data.map((d) => d.colorKey ?? d.name))).sort(
          (a, b) => order.indexOf(a) - order.indexOf(b)
        )
      : [];

  return (
    <div className="space-y-3">
      {legendEntities.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {legendEntities.map((entity) => {
            const idx = order!.indexOf(entity);
            const color = idx === -1 ? palette.ink.muted : palette.colorForIndex(idx);
            return (
              <span key={entity} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                {entity}
              </span>
            );
          })}
        </div>
      )}
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
          barCategoryGap={10}
        >
          <CartesianGrid horizontal={false} stroke={palette.ink.grid} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            tickLine={false}
            axisLine={false}
            width={168}
            tick={{ fill: palette.ink.secondary, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: palette.ink.grid, opacity: 0.4 }}
            content={({ active, payload }) => (
              <ChartTooltipCard
                active={active}
                heading={payload?.[0]?.payload?.name}
                rows={
                  payload?.[0]
                    ? [
                        {
                          label: payload[0].payload.subtitle ?? "Value",
                          value: valueFormatter(Number(payload[0].value)),
                          color: String(payload[0].color ?? palette.categorical.blue),
                        },
                      ]
                    : []
                }
              />
            )}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            onClick={filterParamKey ? handleBarClick : undefined}
            style={filterParamKey ? { cursor: "pointer" } : undefined}
          >
            {data.map((d) => {
              const key = d.colorKey ?? d.name;
              const isDimmed = Boolean(activeFilterValue) && activeFilterValue !== key;
              return (
                <Cell key={d.name} fill={colorFor(d)} opacity={isDimmed ? 0.35 : 1} />
              );
            })}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: unknown) => valueFormatter(Number(v))}
              style={{ fill: palette.ink.primary, fontSize: 12, fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
