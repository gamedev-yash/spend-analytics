"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFilterSlot } from "@/context/FilterContext";
import { ClearFiltersButton, FilterDateRange, FilterGroup } from "@/components/ui/filter-controls";
import { MultiSelect } from "@/components/sap/multi-select";
import { CustomizeViewDrawer } from "@/components/dashboard/customize-view-drawer";
import { SnapshotHistoryDialog } from "@/components/dashboard/snapshot-history-dialog";
import type { SnapshotState } from "@/lib/local-snapshots";
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
        {hasActiveFilters && <ClearFiltersButton onClick={() => router.push(pathname)} />}
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

interface SpendOverviewSnapshotButtonProps {
  defaultDateFrom: string;
  defaultDateTo: string;
}

/**
 * Header-row counterpart to SpendOverviewFilters — same URL-search-param
 * state, but rendered as a visible button rather than registered into the
 * Filter Drawer slot. Reads/writes the same "bu"/"cat"/"from"/"to" params,
 * so a snapshot is just a saved copy of the URL's filter portion and restore
 * is the same router.push navigation a manual filter change would trigger.
 */
export function SpendOverviewSnapshotButton({ defaultDateFrom, defaultDateTo }: SpendOverviewSnapshotButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedPlants = searchParams.get("bu")?.split(",").filter(Boolean) ?? [];
  const selectedCategories = searchParams.get("cat")?.split(",").filter(Boolean) ?? [];
  const dateFrom = searchParams.get("from") ?? defaultDateFrom;
  const dateTo = searchParams.get("to") ?? defaultDateTo;

  function buildSnapshot(): SnapshotState {
    return {
      pageId: "spend-overview",
      filters: { dateFrom, dateTo, plants: selectedPlants, categories: selectedCategories },
      preview: [
        { label: "Date range", value: `${dateFrom} to ${dateTo}` },
        { label: "BU / Plant", value: selectedPlants.length ? `${selectedPlants.length} selected` : "All" },
        { label: "Category", value: selectedCategories.length ? selectedCategories.join(", ") : "All" },
      ],
    };
  }

  function restoreSnapshot(state: SnapshotState) {
    const f = state.filters;
    const params = new URLSearchParams();
    if (f.plants && f.plants.length > 0) params.set("bu", f.plants.join(","));
    if (f.categories && f.categories.length > 0) params.set("cat", f.categories.join(","));
    if (f.dateFrom) params.set("from", f.dateFrom);
    if (f.dateTo) params.set("to", f.dateTo);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <SnapshotHistoryDialog
      dashboardId="spend-overview"
      dashboardLabel="Spend Overview"
      buildSnapshot={buildSnapshot}
      onRestore={restoreSnapshot}
    />
  );
}
