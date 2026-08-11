"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { usePalette } from "@/hooks/use-palette";
import type { AccentColor } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";
import { FullscreenOverlay, MaximizeButton, useFullscreen } from "@/components/dashboard/fullscreen-overlay";

interface ChartCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  accent?: AccentColor;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Set false to omit the fullscreen button — e.g. for a preview/thumbnail instance of a card. Defaults to true. */
  expandable?: boolean;
  /** Short summary of the filters currently narrowing this widget's data, shown in the fullscreen header only. */
  activeFilters?: string;
}

/**
 * Consistent title/description/content shell every chart and table renders
 * inside — matches app/tail-spend/'s card structure (explicit slate borders
 * and a tinted header strip) rather than the generic Card primitive's
 * CSS-variable-based styling, so header alignment and padding stay pixel-
 * identical across every dashboard page.
 *
 * Every card is fullscreen-expandable by default (via the shared
 * FullscreenOverlay) — no per-call-site wiring needed.
 */
export function ChartCard({
  title,
  description,
  icon,
  accent = "neutral",
  action,
  children,
  className,
  expandable = true,
  activeFilters,
}: ChartCardProps) {
  const palette = usePalette();
  const accentColor = accent !== "neutral" ? palette.accent(accent) : undefined;
  const { isFullscreen, setIsFullscreen } = useFullscreen();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:border-slate-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-slate-600",
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
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {expandable && <MaximizeButton onClick={() => setIsFullscreen(true)} />}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-5">{children}</div>

      {expandable && (
        <FullscreenOverlay
          open={isFullscreen}
          onClose={() => setIsFullscreen(false)}
          title={title}
          description={description}
          activeFilters={activeFilters}
          action={action}
        >
          {children}
        </FullscreenOverlay>
      )}
    </motion.div>
  );
}
