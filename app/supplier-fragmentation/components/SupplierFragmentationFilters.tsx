"use client";

import { useFilterSlot } from "@/context/FilterContext";
import { FilterGroup, FilterSelect, FilterSlider } from "@/components/ui/filter-controls";
import { CustomizeViewDrawer } from "@/components/dashboard/customize-view-drawer";
import { SF_WIDGET_GROUPS } from "./focusParams";
import { useSupplierFragmentationFocus } from "./useSupplierFragmentationFocus";
import type { SupplierFragmentationData } from "../supplierMock";

const ALL_CATEGORIES = "All Categories";

interface SupplierFragmentationFiltersProps {
  filterOptions: SupplierFragmentationData["filterOptions"];
  categories: string[];
  dateRange: string;
  category: string;
  sourceSystem: string;
  plantSite: string;
  concentrationThreshold: number;
  onChange: (patch: Partial<{
    dateRange: string;
    category: string;
    sourceSystem: string;
    plantSite: string;
    concentrationThreshold: number;
  }>) => void;
}

/** Registers Supplier Fragmentation's filters into the shell's sidebar Filter Drawer. */
export function SupplierFragmentationFilters({
  filterOptions,
  categories,
  dateRange,
  category,
  sourceSystem,
  plantSite,
  concentrationThreshold,
  onChange,
}: SupplierFragmentationFiltersProps) {
  const { isWidgetEnabled, toggleWidgetEnabled, resetWidgetsToDefault } = useSupplierFragmentationFocus();

  useFilterSlot(
    <>
      <FilterGroup title="Global Filters">
        <FilterSelect
          label="Date Range"
          value={dateRange}
          onChange={(v) => onChange({ dateRange: v })}
          options={filterOptions.dateRanges.map((d) => ({ label: d, value: d }))}
        />
        <FilterSelect
          label="Category L1"
          value={category}
          onChange={(v) => onChange({ category: v })}
          options={[ALL_CATEGORIES, ...categories].map((c) => ({ label: c, value: c }))}
        />
        <FilterSelect
          label="Source System"
          value={sourceSystem}
          onChange={(v) => onChange({ sourceSystem: v })}
          options={["All Source Systems", ...filterOptions.sourceSystems].map((s) => ({ label: s, value: s }))}
        />
        <FilterSelect
          label="Plant / Site"
          value={plantSite}
          onChange={(v) => onChange({ plantSite: v })}
          options={["All Plants/Sites", ...filterOptions.plantSites].map((p) => ({ label: p, value: p }))}
        />
      </FilterGroup>

      <FilterGroup title="Page Options" className="mt-6">
        <CustomizeViewDrawer
          groups={SF_WIDGET_GROUPS}
          isWidgetEnabled={isWidgetEnabled}
          onToggleWidgetEnabled={toggleWidgetEnabled}
          onResetToDefault={resetWidgetsToDefault}
        />
        <FilterSlider
          label="Concentration Alert Threshold"
          min={20}
          max={80}
          step={5}
          value={concentrationThreshold}
          onChange={(v) => onChange({ concentrationThreshold: v })}
          formatValue={(v) => `${v}%`}
        />
      </FilterGroup>
    </>
  );

  return null;
}

export { ALL_CATEGORIES };
