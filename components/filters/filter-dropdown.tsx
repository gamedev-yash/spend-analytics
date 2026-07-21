"use client";

import { ChevronDown } from "lucide-react";

export interface FilterDropdownProps {
  label: string;
  placeholder?: string;
}

/**
 * Reusable, presentational filter control. Intentionally inert (no options
 * wired up yet) — feature branches attach real data sources per filter.
 */
export function FilterDropdown({
  label,
  placeholder = "All",
}: FilterDropdownProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:border-foreground/20"
      >
        <span className="truncate">{placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}
