"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ChartTooltipCard } from "@/components/charts/chart-tooltip";
import { usePalette } from "@/hooks/use-palette";
import type { AccentColor } from "@/lib/chart-colors";
import { formatPercent, formatUsdCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

type TrendFormat = "usd" | "percent";

const TREND_FORMATTERS: Record<TrendFormat, (value: number) => string> = {
  usd: formatUsdCompact,
  percent: (v) => formatPercent(v),
};

export interface HeroStatProps {
  eyebrow: string;
  value: string;
  description?: string;
  icon?: ReactNode;
  accent?: AccentColor;
  delta?: { value: string; direction: "up" | "down"; goodDirection?: "up" | "down" };
  /** Monthly values for the embedded trend chart, paired with month labels for the tooltip. */
  trend?: { month: string; value: number }[];
  /** Which formatter the trend tooltip uses — functions never cross the server/client boundary as props. */
  trendFormat?: TrendFormat;
  className?: string;
}

/**
 * The one number the dashboard leads with — bigger type, a tinted surface,
 * and a real (if minimal) trend chart rather than a KPI-card-sized sparkline.
 * This is the dataviz "hero figure" pattern: still the same sans typeface,
 * proportional figures, no dual axis crammed in alongside it.
 */
export function HeroStat({
  eyebrow,
  value,
  description,
  icon,
  accent = "blue",
  delta,
  trend,
  trendFormat = "usd",
  className,
}: HeroStatProps) {
  const palette = usePalette();
  const color = palette.accent(accent);
  const isGood = delta ? delta.direction === (delta.goodDirection ?? "up") : true;
  const gradientId = `hero-${accent}`;
  const trendValueFormatter = TREND_FORMATTERS[trendFormat];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={className}
    >
      <Card className="relative h-full overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ background: `radial-gradient(120% 100% at 0% 0%, ${color}, transparent 60%)` }}
        />
        <div className="relative flex h-full flex-col gap-5 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {eyebrow}
              </p>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground [font-variant-numeric:normal] sm:text-5xl">
                {value}
              </p>
            </div>
            {icon && (
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl [&_svg]:h-5 [&_svg]:w-5"
                style={{ backgroundColor: `${color}1f`, color }}
              >
                {icon}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            {delta && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium",
                  isGood ? "text-[#0ca30c]" : "text-[#d03b3b]"
                )}
              >
                {delta.direction === "up" ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                {delta.value}
              </span>
            )}
            {description && <span className="text-muted-foreground">{description}</span>}
          </div>

          {trend && trend.length > 1 && (
            <div className="-mx-2 -mb-2 mt-auto h-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    content={({ active, label, payload }) => (
                      <ChartTooltipCard
                        active={active}
                        heading={String(label)}
                        rows={
                          payload?.[0]
                            ? [
                                {
                                  label: eyebrow,
                                  value: trendValueFormatter(Number(payload[0].value)),
                                  color,
                                },
                              ]
                            : []
                        }
                      />
                    )}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
