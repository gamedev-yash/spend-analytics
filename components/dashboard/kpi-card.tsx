"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { usePalette } from "@/hooks/use-palette";
import type { AccentColor } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  value: string;
  /** Pass an already-rendered icon element (e.g. `<Wallet className="h-4 w-4" />`) —
   *  component references can't cross the Server → Client Component boundary as props. */
  icon?: ReactNode;
  hint?: string;
  delta?: {
    value: string;
    direction: "up" | "down";
    /** Whether "up" is the desirable direction for this metric. */
    goodDirection?: "up" | "down";
  };
  /** Optional monthly values behind this KPI — rendered as a small trend sparkline. */
  sparkline?: number[];
  /** Tints the icon glyph and, when set, the hint text — "neutral" (default) keeps the card monochrome. */
  accent?: AccentColor;
  /** "compact" is for a secondary stat strip alongside a hero figure — smaller type, tighter padding. */
  size?: "default" | "compact";
}

/**
 * Headline stat tile, shared by every dashboard page. The number is still the
 * point — the optional sparkline is a minimal trend cue (dataviz's "stat tile
 * + sparkline" pattern), not a full chart: no axes, no tooltip, no legend.
 *
 * Threshold/status signal lives in the icon color and hint text, not a
 * card-level border — a stat tile going out-of-range shouldn't out-shout its
 * neighbors.
 */
export function KpiCard({
  label,
  value,
  icon,
  hint,
  delta,
  sparkline,
  accent = "neutral",
  size = "default",
}: KpiCardProps) {
  const palette = usePalette();
  const isGood = delta ? delta.direction === (delta.goodDirection ?? "up") : true;
  const deltaColor = isGood ? palette.status.good : palette.status.critical;
  const sparkColor = isGood ? palette.categorical.blue : palette.status.critical;
  const accentColor = accent !== "neutral" ? palette.accent(accent) : undefined;
  const isCompact = size === "compact";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="h-full"
    >
      <div
        className={cn(
          "h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/80",
          isCompact ? "space-y-1" : "space-y-2"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400",
              isCompact ? "text-[10px]" : "text-[11px]"
            )}
          >
            {label}
          </span>
          {icon && (
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-lg bg-slate-100 p-1.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                isCompact ? "[&_svg]:h-3.5 [&_svg]:w-3.5" : "[&_svg]:h-4 [&_svg]:w-4"
              )}
              style={accentColor ? { color: accentColor } : undefined}
            >
              {icon}
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3">
          <p
            className={cn(
              "font-bold text-slate-900 [font-variant-numeric:normal] dark:text-slate-100",
              isCompact ? "text-xl" : "text-2xl"
            )}
          >
            {value}
          </p>
          {sparkline && sparkline.length > 1 && !isCompact && (
            <div className="h-8 w-20 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkline.map((v) => ({ v }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`spark-${label.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={sparkColor} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={sparkColor}
                    strokeWidth={1.5}
                    fill={`url(#spark-${label.replace(/\s+/g, "")})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {(delta || hint) && (
          <div className={cn("flex items-center gap-1.5", isCompact ? "text-[11px]" : "text-xs")}>
            {delta && (
              <span className="inline-flex items-center gap-0.5 font-medium" style={{ color: deltaColor }}>
                {delta.direction === "up" ? (
                  <ArrowUpRight className={isCompact ? "h-3 w-3" : "h-3.5 w-3.5"} />
                ) : (
                  <ArrowDownRight className={isCompact ? "h-3 w-3" : "h-3.5 w-3.5"} />
                )}
                {delta.value}
              </span>
            )}
            {hint && (
              <span
                className={cn("truncate", !accentColor && "text-slate-500 dark:text-slate-400")}
                style={accentColor ? { color: accentColor } : undefined}
              >
                {hint}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
