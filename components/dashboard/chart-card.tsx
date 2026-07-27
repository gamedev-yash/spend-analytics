"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { usePalette } from "@/hooks/use-palette";
import type { AccentColor } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  accent?: AccentColor;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Consistent title/description/content shell every chart and table renders
 * inside — matches app/tail-spend/'s card structure (explicit slate borders
 * and a tinted header strip) rather than the generic Card primitive's
 * CSS-variable-based styling, so header alignment and padding stay pixel-
 * identical across every dashboard page.
 */
export function ChartCard({ title, description, icon, accent = "neutral", action, children, className }: ChartCardProps) {
  const palette = usePalette();
  const accentColor = accent !== "neutral" ? palette.accent(accent) : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80",
        className
      )}
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-200 bg-slate-100/50 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-900/90">
        {icon && (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 [&_svg]:h-4 [&_svg]:w-4"
            style={accentColor ? { color: accentColor } : undefined}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{title}</p>
          {description && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-5">{children}</div>
    </motion.div>
  );
}
