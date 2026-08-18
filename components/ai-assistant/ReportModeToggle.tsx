"use client";

import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportModeToggleProps {
  reportMode: boolean;
  onToggle: () => void;
  /** Label from the action registry (lib/ai/actions/assistant-actions.ts) — never hardcoded here, so a renamed or added action needs no change in this file. */
  label: string;
  /** Measured expectation from the same registry entry. */
  estimatedSeconds: number;
  /** Smaller pill for the header toolbar (popover mode) — the composer toolbar (fullscreen mode) uses the default size. Same control either way, just two possible homes; see AssistantHeader/Composer. */
  compact?: boolean;
}

/**
 * The Report Mode pill — a sticky per-conversation toggle (see
 * DashboardAssistant's `reportMode` state doc comment for the full
 * turn-based lifecycle). Lives in the header toolbar in popover mode and the
 * composer toolbar in fullscreen mode. No persistent explanatory banner —
 * what it does lives entirely in the hover tooltip.
 */
export function ReportModeToggle({ reportMode, onToggle, label, estimatedSeconds, compact = false }: ReportModeToggleProps) {
  const minutes = Math.max(1, Math.round(estimatedSeconds / 60));
  const tooltip = reportMode
    ? `Report Mode active — ask an analytical question to generate a structured report (${label}, ~${minutes} min). Click to disable.`
    : `Report Mode — ask an analytical question to generate a structured report instead of a chat answer (${label}, ~${minutes} min).`;

  return (
    <button
      type="button"
      aria-pressed={reportMode}
      onClick={onToggle}
      title={tooltip}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1",
        compact ? "px-2.5 py-1 text-[0.68rem]" : "px-3 py-1 text-[0.7rem] shadow-sm",
        reportMode
          ? "border-sky-500/40 bg-sky-500/10 text-sky-600 shadow-[0_0_0_3px_rgba(14,165,233,0.12)] dark:border-sky-400/40 dark:bg-sky-400/10 dark:text-sky-400"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      )}
    >
      <BarChart3 className="h-3 w-3" />
      Report Mode: {reportMode ? "ON" : "OFF"}
    </button>
  );
}
