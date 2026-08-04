"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFilterSlot } from "@/context/FilterContext";
import { FilterGroup } from "@/components/ui/filter-controls";
import { MultiSelect } from "@/components/sap/multi-select";
import { CustomizeViewDrawer } from "@/components/dashboard/customize-view-drawer";
import { SO_WIDGET_GROUPS } from "@/app/spend-overview/components/focusParams";
import { useSpendOverviewFocus } from "@/app/spend-overview/components/useSpendOverviewFocus";

interface SpendOverviewFiltersProps {
  plantOptions: { code: string; name: string }[];
  categoryOptions: string[];
  dateMin: string;
  dateMax: string;
  defaultDateFrom: string;
  defaultDateTo: string;
}

/**
 * Registers Spend Overview's filters into the shell's sidebar Filter Drawer
 * (see context/FilterContext.tsx) instead of an in-canvas filter bar. Renders
 * nothing itself — it mutates the same URL search params the page's server
 * component reads, so a change here triggers a normal Next.js navigation
 * that re-runs the server-side aggregation with the new filters.
 */
export function SpendOverviewFilters({
  plantOptions,
  categoryOptions,
  dateMin,
  dateMax,
  defaultDateFrom,
  defaultDateTo,
}: SpendOverviewFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedPlants = searchParams.get("bu")?.split(",").filter(Boolean) ?? [];
  const selectedCategories = searchParams.get("cat")?.split(",").filter(Boolean) ?? [];
  const dateFrom = searchParams.get("from") ?? defaultDateFrom;
  const dateTo = searchParams.get("to") ?? defaultDateTo;

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const { isWidgetEnabled, toggleWidgetEnabled, resetWidgetsToDefault } = useSpendOverviewFocus();

  useFilterSlot(
    <div className="space-y-6">
      <FilterGroup title="Global Filters">
        <MultiSelect
          label="BU / Plant"
          options={plantOptions.map((p) => ({ value: p.code, label: p.name }))}
          selected={selectedPlants}
          onChange={(values) =>
            updateParams((params) => (values.length ? params.set("bu", values.join(",")) : params.delete("bu")))
          }
        />
        <MultiSelect
          label="Category (L1)"
          options={categoryOptions.map((c) => ({ value: c, label: c }))}
          selected={selectedCategories}
          onChange={(values) =>
            updateParams((params) => (values.length ? params.set("cat", values.join(",")) : params.delete("cat")))
          }
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Date Range
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              min={dateMin}
              max={dateMax}
              onChange={(e) =>
                updateParams((params) => (e.target.value ? params.set("from", e.target.value) : params.delete("from")))
              }
              className="h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            />
            <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">to</span>
            <input
              type="date"
              value={dateTo}
              min={dateMin}
              max={dateMax}
              onChange={(e) =>
                updateParams((params) => (e.target.value ? params.set("to", e.target.value) : params.delete("to")))
              }
              className="h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            />
          </div>
        </div>
      </FilterGroup>

      <FilterGroup title="Page Options">
        <CustomizeViewDrawer
          groups={SO_WIDGET_GROUPS}
          isWidgetEnabled={isWidgetEnabled}
          onToggleWidgetEnabled={toggleWidgetEnabled}
          onResetToDefault={resetWidgetsToDefault}
        />
      </FilterGroup>
    </div>
  );

  return null;
}
