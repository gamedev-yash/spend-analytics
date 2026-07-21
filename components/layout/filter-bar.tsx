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
 * this component only owns presentation.
 */
export function FilterBar() {
  return (
    <aside className="hidden w-[280px] shrink-0 border-r border-slate-200 bg-slate-50/60 px-5 py-6 dark:border-slate-800 dark:bg-slate-900/40 lg:block">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
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
