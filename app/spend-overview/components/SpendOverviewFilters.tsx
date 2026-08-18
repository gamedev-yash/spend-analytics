"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFilterSlot } from "@/context/FilterContext";
import { useSetDashboardActiveFilterSummary } from "@/context/DashboardActiveFiltersContext";
import { buildPlantCategoryDateFilterSummary } from "@/lib/dashboard-filters/format-filter-summary";
import { ClearFiltersButton, FilterDateRange, FilterGroup } from "@/components/ui/filter-controls";
import { MultiSelect } from "@/components/sap/multi-select";
import { ThresholdSettings } from "@/components/dashboard/threshold-settings";

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
  const vendorLabel = searchParams.get("vendor");
  const hasActiveFilters = searchParams.toString() !== "";

  // Lets the AI Assistant (mounted outside this page's tree — see
  // app/layout.tsx) answer relative to what's actually on screen instead of
  // the full unfiltered dataset. See DashboardActiveFiltersContext.tsx.
  useSetDashboardActiveFilterSummary(
    buildPlantCategoryDateFilterSummary({
      selectedPlantCodes: selectedPlants,
      plantOptions,
      selectedCategories,
      dateFrom,
      dateTo,
      defaultDateFrom,
      defaultDateTo,
      vendorLabel,
    })
  );

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  useFilterSlot(
    <div className="space-y-6">
      <FilterGroup title="Filters">
        <MultiSelect
          label="Business Unit / Plant"
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
        {hasActiveFilters && <ClearFiltersButton onClick={() => router.push(pathname)} />}
      </FilterGroup>

      {/*
        Same pageKey literal the canvas used when this lived in its Focus
        Parameter bar — the live values travel through ThresholdsContext
        (mounted above DashboardShell), so no prop needs threading from the
        canvas for an edit here to re-grade its YoY KPI badge.
      */}
      <FilterGroup title="Page Options">
        <ThresholdSettings pageKey="spend-overview" className="w-full justify-center" />
      </FilterGroup>
    </div>
  );

  return null;
}

