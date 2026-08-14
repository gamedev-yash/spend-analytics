"use client";

import { ChevronRight, Database, Upload, type LucideIcon } from "lucide-react";
import type { GeneratedDashboardSourceKind } from "@/types/generated-dashboard";

// First screen of Generate Custom Dashboard: which data is this dashboard
// being built from. Two cards rather than a dropdown because the choice
// branches the whole flow — one continues into the platform's spend tables,
// the other into a file upload — and a card can say what happens next, which
// is the part that actually distinguishes them.

interface DataSourceOption {
  kind: GeneratedDashboardSourceKind;
  icon: LucideIcon;
  title: string;
  description: string;
  /** What the user lands on after choosing. Sets the expectation the card sets up. */
  next: string;
}

const OPTIONS: DataSourceOption[] = [
  {
    kind: "spend",
    icon: Database,
    title: "Spend Analytics Data",
    description: "Use existing platform spend data to create a custom dashboard.",
    next: "Pick a spend table, then choose its fields",
  },
  {
    kind: "csv",
    icon: Upload,
    title: "Upload CSV",
    description: "Bring your own dataset and build a dashboard from its columns.",
    next: "Drop in a file, then choose its fields",
  },
];

export function DataSourceStep({
  onSelect,
}: {
  onSelect: (kind: GeneratedDashboardSourceKind) => void;
}) {
  return (
    <>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Choose where this dashboard&apos;s data comes from. Either way you pick the fields next,
        and Claude plans the charts around them.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.kind}
              type="button"
              onClick={() => onSelect(option.kind)}
              className="group flex flex-col items-start gap-2 rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-600 dark:hover:bg-slate-800/60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-slate-700">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {option.title}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {option.description}
              </span>
              <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-medium text-slate-400 transition-colors group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300">
                {option.next}
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
