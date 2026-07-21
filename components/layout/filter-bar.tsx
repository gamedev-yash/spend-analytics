"use client";

import { usePathname } from "next/navigation";
import { FilterDropdown } from "@/components/filters/filter-dropdown";

interface FilterConfig {
  label: string;
  placeholder: string;
}

const GLOBAL_FILTERS: FilterConfig[] = [
  { label: "Date Range", placeholder: "Last 12 months" },
  { label: "Category", placeholder: "All categories" },
  { label: "Supplier (Global Ultimate)", placeholder: "All suppliers" },
  { label: "Source System", placeholder: "All systems" },
  { label: "Plant / Site", placeholder: "All plants" },
];

/**
 * Shared global filter panel rendered by the layout wrapper on every route.
 * Individual pages read filter state from context/query params once wired —
 * this component only owns presentation. Hidden on /spend-overview, which
 * ships its own contextual, functional filter row instead of this inert one.
 */
export function FilterBar() {
  const pathname = usePathname();
  if (pathname?.startsWith("/spend-overview")) return null;

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-muted/30 px-5 py-6 lg:block">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Global Filters
      </h2>
      <div className="space-y-4">
        {GLOBAL_FILTERS.map((filter) => (
          <FilterDropdown
            key={filter.label}
            label={filter.label}
            placeholder={filter.placeholder}
          />
        ))}
      </div>
    </aside>
  );
}
