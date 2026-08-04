"use client";

import { Sparkles, X } from "lucide-react";
import { useFragmentation } from "./fragmentationStore";

/**
 * The auto-generated insight sentence (global filters only) plus the
 * cross-filter badge with its ✕ clear button.
 */
export function FragmentationInsight() {
  const { derived, crossFilter, crossFilterLabel, clearCrossFilter } = useFragmentation();

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="flex flex-1 items-start gap-2.5 rounded-xl border border-blue-200/70 bg-blue-50/60 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {derived.insight.map((segment, i) =>
            segment.strong ? (
              <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">
                {segment.text}
              </strong>
            ) : (
              <span key={i}>{segment.text}</span>
            )
          )}
        </p>
      </div>

      {crossFilter && (
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-amber-300 bg-amber-50 py-1.5 pl-3.5 pr-1.5 text-sm dark:border-amber-700/60 dark:bg-amber-950/40">
          <span className="text-slate-500 dark:text-slate-400">Focused on:</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{crossFilterLabel}</span>
          <button
            type="button"
            onClick={clearCrossFilter}
            className="flex items-center gap-1 rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-300/70 dark:bg-amber-800/50 dark:text-amber-100 dark:hover:bg-amber-700/60"
          >
            <X className="h-3 w-3" /> clear
          </button>
        </div>
      )}
    </div>
  );
}
