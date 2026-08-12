"use client";

import { SingleSourceRiskProvider } from "./provider";
import { useProviderPageData } from "@/hooks/use-provider-page-data";
import { loadSingleSourceRiskFromProvider } from "@/lib/page-data/single-source-risk-from-provider";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { DASHBOARD_CANVAS_ID } from "@/lib/snapshot";
import { WidgetGridSkeleton } from "@/components/dashboard/widget-grid-skeleton";
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

export default function SingleSourceRiskPage() {
  const { activeParameters, toggleParameter, applyPreset, isWidgetVisible } = useSingleSourceRiskFocus();

  // Always on: /single-source-risk/api/master reads the canonical
  // fact_po_items sample directly, independent of the CSV/Azure toggle —
  // that toggle only governs client-uploaded datasets and ad hoc widget
  // queries elsewhere, not this page's per-PO-line data.
  //
  // fact_po_items has no material or cost-center grain (see
  // single-source-risk-from-provider.ts), so the Products widget and the
  // detail table's cost-center column read a clearly-labelled placeholder —
  // everything else here (category/supplier/plant/global-ultimate
  // concentration, this dashboard's actual subject) is real.
  const warehouse = useProviderPageData(() => loadSingleSourceRiskFromProvider(), true, "single-source-risk");

  if (!warehouse.ready) {
    return <WidgetGridSkeleton kpiCount={5} widgetCount={5} />;
  }

  return (
    // Not mounted until the fetch above has settled — see provider.tsx's prop comment.
    <SingleSourceRiskProvider
      invoices={warehouse.data?.invoices ?? []}
      sourceSystemDims={warehouse.data?.sourceSystemDims ?? []}
    >
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
          />

          {isWidgetVisible("kpi-ribbon") && <KpiRibbon />}
          {/* Trailing odd child spans the full row so hiding/filtering widgets never leaves a gap. */}
          <div id="primary-charts" className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
            {isWidgetVisible("category-chart") && <CategoriesBySupplierCountChart />}
            {isWidgetVisible("product-chart") && <ProductsChart />}
            {isWidgetVisible("plant-chart") && <PlantsChart />}
            {isWidgetVisible("supplier-chart") && <SuppliersChart />}
          </div>

          {isWidgetVisible("exposure-trend-chart") && (
            <div id="secondary-charts">
              <ExposureTrendChart />
            </div>
          )}
          {isWidgetVisible("detail-table") && <DetailReportTable />}
        </div>
      </div>
    </SingleSourceRiskProvider>
  );
}
