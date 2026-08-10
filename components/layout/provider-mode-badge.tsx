"use client";

// Header segmented control for which IDataProvider is answering widget
// queries. Two real, always-visible buttons rather than a native <select> —
// the choice is binary and permanent (not a long list), so a segmented
// toggle reads faster at a glance than a dropdown, and needs no popover
// machinery either.
//
// The active option reports the configured mode, not the route each query
// took: in Azure SQL mode an uploaded CSV is still aggregated in the
// browser, because the warehouse has no such table. Widgets on a warehouse
// dataset are the ones that travel over /api/v1/query.

import { Cloud, HardDrive } from "lucide-react";
import { useDatasets, type DataProviderType } from "@/context/DatasetsContext";
import { cn } from "@/lib/utils";

interface ModeOption {
  type: DataProviderType;
  label: string;
  icon: typeof Cloud;
  title: string;
  activeClassName: string;
}

const MODES: ModeOption[] = [
  {
    type: "client-csv",
    label: "CSV",
    icon: HardDrive,
    title: "CSV Mode — widgets aggregate in this browser, no API calls.",
    activeClassName: "bg-amber-500 text-white shadow-sm dark:bg-amber-600",
  },
  {
    type: "azure-sql",
    label: "Azure",
    icon: Cloud,
    title: "Azure SQL Mode — widgets query POST /api/v1/query. Uploaded CSVs are still aggregated in this browser.",
    activeClassName: "bg-sky-600 text-white shadow-sm dark:bg-sky-500",
  },
];

export function ProviderModeBadge({ className }: { className?: string }) {
  const { providerType, setProviderType } = useDatasets();

  return (
    <div
      role="group"
      aria-label="Data source provider"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800",
        className
      )}
    >
      {MODES.map(({ type, label, icon: Icon, title, activeClassName }) => {
        const isActive = providerType === type;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={isActive}
            title={title}
            onClick={() => setProviderType(type)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              isActive
                ? activeClassName
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
