import { FilterDropdown } from "@/components/filters/filter-dropdown";
import { cn } from "@/lib/utils";

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

interface FilterBarProps {
  visible: boolean;
}

/**
 * Shared global filter panel rendered by the layout wrapper on every route.
 * Always mounted — visibility is a width/opacity transition, not a mount/
 * unmount, so hiding it slides and fades instead of snapping away. The inner
 * wrapper stays a fixed 280px so its content doesn't reflow/wrap mid-transition;
 * the outer aside's overflow-hidden clips it as the width collapses to 0.
 * Individual pages read filter state from context/query params once wired —
 * this component only owns presentation.
 */
export function FilterBar({ visible }: FilterBarProps) {
  return (
    <aside
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        "hidden shrink-0 overflow-hidden border-slate-200 bg-slate-50/60 transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-900/40 lg:block",
        visible ? "w-[280px] border-r opacity-100" : "w-0 border-r-0 opacity-0"
      )}
    >
      <div className="w-[280px] px-5 py-6">
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
      </div>
    </aside>
  );
}
