"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFilterSlot } from "@/context/FilterContext";
import { useSetDashboardActiveFilterSummary } from "@/context/DashboardActiveFiltersContext";
import { buildPlantCategoryDateFilterSummary } from "@/lib/dashboard-filters/format-filter-summary";
import { ClearFiltersButton, FilterGroup } from "@/components/ui/filter-controls";
import { MultiSelect } from "@/components/sap/multi-select";

interface ComplianceFiltersProps {
  plantOptions: { code: string; name: string }[];
  categoryOptions: string[];
  dateMin: string;
  dateMax: string;
  defaultDateFrom: string;
  defaultDateTo: string;
}

/**
 * Registers the Compliance page's filters into the shell's sidebar Filter
 * Drawer (see context/FilterContext.tsx) — same BU / Category / Date Range
 * shape as Spend Overview's filters, since both read from the same lib/sap
 * dataset. Renders nothing itself; mutates URL search params the page's
 * server component reads.
 */
export function ComplianceFilters({
  plantOptions,
  categoryOptions,
  dateMin,
  dateMax,
  defaultDateFrom,
  defaultDateTo,
}: ComplianceFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedPlants = searchParams.get("bu")?.split(",").filter(Boolean) ?? [];
  const selectedCategories = searchParams.get("cat")?.split(",").filter(Boolean) ?? [];
  const dateFrom = searchParams.get("from") ?? defaultDateFrom;
  const dateTo = searchParams.get("to") ?? defaultDateTo;
  const hasActiveFilters = searchParams.toString() !== "";

  // See SpendOverviewFilters.tsx's identical call for why this exists.
  useSetDashboardActiveFilterSummary(
    buildPlantCategoryDateFilterSummary({
      selectedPlantCodes: selectedPlants,
      plantOptions,
      selectedCategories,
      dateFrom,
      dateTo,
      defaultDateFrom,
      defaultDateTo,
    })
  );

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  useFilterSlot(
    <FilterGroup title="Global Filters">
      <MultiSelect
        label="Business Unit / Plant"
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
      {hasActiveFilters && <ClearFiltersButton onClick={() => router.push(pathname)} />}
    </FilterGroup>
  );

  return null;
}

