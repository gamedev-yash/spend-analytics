"use client";

import { usePathname } from "next/navigation";
import { FilterDropdown } from "@/components/filters/filter-dropdown";
import { NAV_ITEMS } from "@/lib/nav";

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
 * Routes that need a different filter set (real options, dashboard-specific
 * dimensions) set `hasCustomFilterPanel` in lib/nav.ts and render their own
 * filter panel inline instead — this component then renders nothing for them.
 */
export function FilterBar() {
  const pathname = usePathname();
  const activeItem = NAV_ITEMS.find((item) => pathname?.startsWith(item.href));

  if (activeItem?.hasCustomFilterPanel) {
    return null;
  }

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-50/60 px-5 py-6 lg:block">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
