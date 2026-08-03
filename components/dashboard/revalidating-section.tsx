"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

interface RevalidatingSectionProps {
  /** True while a background refetch is updating data that's already on screen. */
  isRevalidating: boolean;
  children: ReactNode;
}

/**
 * Wraps a dashboard's already-rendered KPI/widget content so a background
 * refetch — a filter or threshold change re-querying data that's already on
 * screen — dims the content slightly and shows a small "Refreshing…" cue,
 * instead of resetting to a skeleton or flashing a fallback dataset.
 */
export function RevalidatingSection({ isRevalidating, children }: RevalidatingSectionProps) {
  return (
    <div className="relative flex flex-col gap-6">
      {isRevalidating && (
        <div className="pointer-events-none absolute right-0 top-0 z-10 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Refreshing…
        </div>
      )}
      <div className={`flex flex-col gap-6 transition-opacity duration-300 ${isRevalidating ? "opacity-60" : ""}`}>
        {children}
      </div>
    </div>
  );
}
