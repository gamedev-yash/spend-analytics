"use client";

// Header indicator for which IDataProvider is answering widget queries, doubling
// as the switcher. A native <select> so it stays keyboard-accessible and needs no
// popover machinery for what is a two-option control.
//
// The badge reports the configured mode, not the route each query took: in Azure
// SQL mode an uploaded CSV is still aggregated in the browser, because the
// warehouse has no such table. Widgets on a warehouse dataset are the ones that
// travel over /api/v1/query.

import { Cloud, HardDrive } from "lucide-react";
import {
  DATA_PROVIDER_LABELS,
  useDatasets,
  type DataProviderType,
} from "@/context/DatasetsContext";
import { cn } from "@/lib/utils";

const MODES: DataProviderType[] = ["azure-sql", "client-csv"];

export function ProviderModeBadge({ className }: { className?: string }) {
  const { providerType, setProviderType } = useDatasets();
  const isAzure = providerType === "azure-sql";
  const Icon = isAzure ? Cloud : HardDrive;

  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1.5 text-xs font-medium transition-colors",
        isAzure
          ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
          : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
        className
      )}
      title={
        isAzure
          ? "Widgets query POST /api/v1/query. Uploaded CSVs are still aggregated in this browser."
          : "Widgets aggregate in this browser — no API calls."
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {DATA_PROVIDER_LABELS[providerType]}
      {/* Transparent select over the badge: the pill is the control. */}
      <select
        aria-label="Data source provider"
        value={providerType}
        onChange={(event) => setProviderType(event.target.value as DataProviderType)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
      >
        {MODES.map((mode) => (
          <option key={mode} value={mode}>
            {DATA_PROVIDER_LABELS[mode]}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 10 6"
        className="h-2 w-2 shrink-0 opacity-60"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
