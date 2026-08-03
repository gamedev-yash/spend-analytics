"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";
import { GeneratedWidget } from "@/components/generated-dashboard/generated-widget";
import type { DashboardPlan, WidgetSpec } from "@/types/generated-dashboard";
import { cn } from "@/lib/utils";

// Lays out an AI-generated dashboard plan: sections in priority order, each
// with a 12-column responsive grid of that section's widgets. Pure layout —
// GeneratedWidget owns everything about how one widget renders.

interface DashboardGridProps {
  plan: DashboardPlan;
  widgets: WidgetSpec[];
  rows: Record<string, unknown>[];
}

// Tailwind can't resolve dynamically interpolated classes like
// `col-span-${n}`, so the colSpan -> class mapping must be a static object.
// Mobile-first: every span collapses to full width below `md`.
const COL_SPAN_CLASS: Record<WidgetSpec["colSpan"], string> = {
  3: "col-span-12 sm:col-span-6 lg:col-span-3",
  4: "col-span-12 sm:col-span-6 lg:col-span-4",
  6: "col-span-12 md:col-span-6",
  8: "col-span-12 lg:col-span-8",
  12: "col-span-12",
};

function CaveatsNote({ caveats }: { caveats: string[] }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || caveats.length === 0) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <ul className="min-w-0 flex-1 list-disc space-y-0.5 pl-4">
        {caveats.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss caveats"
        className="shrink-0 rounded p-0.5 text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900 dark:text-amber-400 dark:hover:bg-amber-900/50 dark:hover:text-amber-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function DashboardGrid({ plan, widgets, rows }: DashboardGridProps) {
  const sortedSections = [...plan.sections].sort((a, b) => a.priority - b.priority);

  return (
    <div className="flex flex-col gap-8">
      {/* Data-quality caveats section disabled per user request; keeping CaveatsNote intact in case it's needed later. */}
      {/* <CaveatsNote caveats={plan.caveats ?? []} /> */}

      {sortedSections.map((section) => {
        const sectionWidgets = widgets.filter((w) => w.sectionId === section.id);
        if (sectionWidgets.length === 0) return null;

        return (
          <section key={section.id} className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{section.heading}</h2>
              {(section.intent || section.whyItMatters) && (
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {section.intent || section.whyItMatters}
                </p>
              )}
            </div>
            <div className="grid grid-cols-12 gap-4">
              {sectionWidgets.map((widget) => (
                <div key={widget.id} className={cn(COL_SPAN_CLASS[widget.colSpan] ?? COL_SPAN_CLASS[6])}>
                  <GeneratedWidget widget={widget} rows={rows} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
