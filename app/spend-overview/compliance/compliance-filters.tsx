"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFilterSlot } from "@/context/FilterContext";
import { FilterGroup, FilterSelect } from "@/components/ui/filter-controls";
import { CustomizeViewDrawer } from "@/components/dashboard/customize-view-drawer";
import { SO_WIDGET_GROUPS } from "../components/focusParams";
import { useSpendOverviewFocus } from "../components/useSpendOverviewFocus";

interface ComplianceFiltersProps {
  businessUnits: string[];
  riskLevels: string[];
}

/**
 * Registers the Compliance dashboard's filters into the shell's sidebar
 * Filter Drawer (see context/FilterContext.tsx) instead of an in-canvas
 * filter bar. Mutates the same URL search params the server component reads,
 * so a change triggers a normal navigation that re-slices the data.
 */
export function ComplianceFilters({ businessUnits, riskLevels }: ComplianceFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "") params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const { isWidgetEnabled, toggleWidgetEnabled, resetWidgetsToDefault } = useSpendOverviewFocus();

  useFilterSlot(
    <>
      <FilterGroup title="Global Filters">
        <FilterSelect
          label="Business Unit"
          value={searchParams.get("businessUnit") ?? ""}
          options={[
            { value: "", label: "All Business Units" },
            ...businessUnits.map((bu) => ({ value: bu, label: bu })),
          ]}
          onChange={(value) => setParam("businessUnit", value)}
        />
        <FilterSelect
          label="Risk Level"
          value={searchParams.get("riskLevel") ?? ""}
          options={[
            { value: "", label: "All Risk Levels" },
            ...riskLevels.map((level) => ({ value: level, label: level })),
          ]}
          onChange={(value) => setParam("riskLevel", value)}
        />
      </FilterGroup>

      <FilterGroup title="Page Options" className="mt-6">
        <CustomizeViewDrawer
          groups={SO_WIDGET_GROUPS}
          isWidgetEnabled={isWidgetEnabled}
          onToggleWidgetEnabled={toggleWidgetEnabled}
          onResetToDefault={resetWidgetsToDefault}
        />
      </FilterGroup>
    </>
  );

  return null;
}
