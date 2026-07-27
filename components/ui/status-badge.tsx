import type { ThresholdStatus } from "@/types/thresholds";
import { cn } from "@/lib/utils";

/** Pill + dot classes per status — the single source for status colors. */
export const STATUS_PILL_CLASS: Record<ThresholdStatus, string> = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export const STATUS_DOT_CLASS: Record<ThresholdStatus, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

/** Hex accents for chart fills (recharts Cell etc.) per status. */
export const STATUS_CHART_COLOR: Record<ThresholdStatus, string> = {
  success: "#10b981", // emerald-500
  warning: "#f59e0b", // amber-500
  danger: "#f43f5e", // rose-500
};

const STATUS_FALLBACK_LABEL: Record<ThresholdStatus, string> = {
  success: "On target",
  warning: "Near limit",
  danger: "Off target",
};

interface StatusBadgeProps {
  status: ThresholdStatus;
  /** Pill text; defaults to "On target" / "Near limit" / "Off target". */
  label?: string;
  /** Tooltip explaining the evaluation, e.g. "20% vs target ≤ 20%". */
  title?: string;
  showDot?: boolean;
  className?: string;
}

/**
 * Subtle status pill for KPI cards, table cells, and chart legends —
 * green/amber/red per the evaluated threshold status.
 */
export function StatusBadge({ status, label, title, showDot = true, className }: StatusBadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        STATUS_PILL_CLASS[status],
        className
      )}
    >
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[status])} />}
      {label ?? STATUS_FALLBACK_LABEL[status]}
    </span>
  );
}
