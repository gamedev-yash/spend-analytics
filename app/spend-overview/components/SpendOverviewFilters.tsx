"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useFilterSlot } from "@/context/FilterContext";
import { FilterDateRange, FilterGroup } from "@/components/ui/filter-controls";
import { MultiSelect } from "@/components/sap/multi-select";
import { CustomizeViewDrawer } from "@/components/dashboard/customize-view-drawer";
import { SO_WIDGET_GROUPS } from "./focusParams";
import { useSpendOverviewFocus } from "./useSpendOverviewFocus";

interface SpendOverviewFiltersProps {
  plantOptions: { code: string; name: string }[];
  categoryOptions: string[];
  dateMin: string;
  dateMax: string;
  defaultDateFrom: string;
  defaultDateTo: string;
}

/**
 * In-route fork of components/sap/spend-overview-filters.tsx (kept there,
 * unmodified, and no longer used by this page) — recreated here so the
 * "Clear filters" button stays inside app/spend-overview/.
 *
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
  const hasActiveFilters = searchParams.toString() !== "";

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const { isWidgetEnabled, toggleWidgetEnabled, resetWidgetsToDefault } = useSpendOverviewFocus();

  useFilterSlot(
    <div className="space-y-6">
      <FilterGroup title="Filters">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {hasActiveFilters ? "Filters applied" : "No filters applied"}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => router.push(pathname)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="Reset BU, Category, Date Range, and any cross-filters back to their defaults"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>
        <MultiSelect
          label="BU / Plant"
          options={plantOptions.map((p) => ({ value: p.code, label: p.name }))}
          selected={selectedPlants}
          onChange={(values) =>
            updateParams((params) => (values.length ? params.set("bu", values.join(",")) : params.delete("bu")))
          }
        />
        <MultiSelect
          label="Category"
          options={categoryOptions.map((c) => ({ value: c, label: c }))}
          selected={selectedCategories}
          onChange={(values) =>
            updateParams((params) => (values.length ? params.set("cat", values.join(",")) : params.delete("cat")))
          }
        />
        <FilterDateRange
          fromValue={dateFrom}
          toValue={dateTo}
          min={dateMin}
          max={dateMax}
          onFromChange={(value) =>
            updateParams((params) => (value ? params.set("from", value) : params.delete("from")))
          }
          onToChange={(value) => updateParams((params) => (value ? params.set("to", value) : params.delete("to")))}
        />
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
