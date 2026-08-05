"use client";

import { SingleSourceRiskProvider, useSingleSourceRisk } from "./provider";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { SnapshotHistoryDialog } from "@/components/dashboard/snapshot-history-dialog";
import type { SnapshotState } from "@/lib/local-snapshots";
import type { SupplierCountThreshold } from "./types";
import { DASHBOARD_CANVAS_ID } from "@/lib/snapshot";
import { KpiRibbon } from "./components/kpi-ribbon";
import { FilterPanel } from "./components/filter-panel";
import { CategoriesBySupplierCountChart } from "./components/widgets/categories-by-supplier-count-chart";
import { ProductsChart } from "./components/widgets/products-chart";
import { PlantsChart } from "./components/widgets/plants-chart";
import { SuppliersChart } from "./components/widgets/suppliers-chart";
import { ExposureTrendChart } from "./components/widgets/exposure-trend-chart";
import { DetailReportTable } from "./components/detail-report-table";
import { FocusParameterBar } from "@/components/dashboard/focus-parameter-bar";
import { SSR_FOCUS_PARAMETERS } from "./components/focusParams";
import { useSingleSourceRiskFocus } from "./components/useSingleSourceRiskFocus";

/** Lives inside SingleSourceRiskProvider so it can build/restore snapshots against the live provider state. */
function HeaderActions() {
  const { filters, setDateFrom, setDateTo, setCategories, setGlobalUltimates, setSourceSystems, setPlants, setSupplierCountPerCategory } =
    useSingleSourceRisk();

  function buildSnapshot(): SnapshotState {
    return {
      pageId: "single-source-risk",
      filters: {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        categories: filters.categoryCodes,
        suppliers: filters.globalUltimateIds,
        plants: filters.plantIds,
        sourceSystems: filters.sourceSystemIds,
        extra: { supplierCountPerCategory: filters.supplierCountPerCategory },
      },
      preview: [
        { label: "Date range", value: `${filters.dateFrom} to ${filters.dateTo}` },
        { label: "Category", value: filters.categoryCodes.length ? filters.categoryCodes.join(", ") : "All" },
        { label: "BU / Plant", value: filters.plantIds.length ? `${filters.plantIds.length} selected` : "All" },
        { label: "Suppliers per category", value: `≤ ${filters.supplierCountPerCategory}` },
      ],
    };
  }

  function restoreSnapshot(state: SnapshotState) {
    const f = state.filters;
    if (f.dateFrom) setDateFrom(f.dateFrom);
    if (f.dateTo) setDateTo(f.dateTo);
    setCategories(f.categories ?? []);
    setGlobalUltimates(f.suppliers ?? []);
    setPlants(f.plants ?? []);
    setSourceSystems(f.sourceSystems ?? []);
    const extra = f.extra ?? {};
    if (extra.supplierCountPerCategory === 1 || extra.supplierCountPerCategory === 2 || extra.supplierCountPerCategory === 3) {
      setSupplierCountPerCategory(extra.supplierCountPerCategory as SupplierCountThreshold);
    }
  }

  return (
    <SnapshotHistoryDialog
      dashboardId="single-source-risk"
      dashboardLabel="Single Source Risk"
      buildSnapshot={buildSnapshot}
      onRestore={restoreSnapshot}
    />
  );
}

export default function SingleSourceRiskPage() {
  const { activeParameters, toggleParameter, applyPreset, isWidgetVisible } = useSingleSourceRiskFocus();

  return (
    <SingleSourceRiskProvider>
      <FilterPanel />
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Single Source Risk</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Spend Assessment: which categories depend on too few suppliers, and how much exposure that
              concentration carries across products, plants, and suppliers.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <HeaderActions />
            <ExportSnapshotButton targetId={DASHBOARD_CANVAS_ID} dashboardTitle="Single Source Risk" />
          </div>
        </div>

        <div id={DASHBOARD_CANVAS_ID} className="flex flex-col gap-6">
          <FocusParameterBar
            title="Show Sections"
            description="Toggle which parts of the dashboard are visible — these don't change any numbers."
            parameters={SSR_FOCUS_PARAMETERS}
            activeParameters={activeParameters}
            onToggleParameter={toggleParameter}
            onSelectAll={() => applyPreset(SSR_FOCUS_PARAMETERS.map((parameter) => parameter.id))}
            thresholdsPageKey="single-source-risk"
          />

          {isWidgetVisible("kpi-ribbon") && <KpiRibbon />}
          {/* Trailing odd child spans the full row so hiding/filtering widgets never leaves a gap. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
            {isWidgetVisible("category-chart") && <CategoriesBySupplierCountChart />}
            {isWidgetVisible("product-chart") && <ProductsChart />}
            {isWidgetVisible("plant-chart") && <PlantsChart />}
            {isWidgetVisible("supplier-chart") && <SuppliersChart />}
          </div>

          {isWidgetVisible("exposure-trend-chart") && <ExposureTrendChart />}
          {isWidgetVisible("detail-table") && <DetailReportTable />}
        </div>
      </div>
    </SingleSourceRiskProvider>
  );
}
