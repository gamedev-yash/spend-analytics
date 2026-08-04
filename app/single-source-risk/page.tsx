"use client";

import { useMemo } from "react";
import { SingleSourceRiskProvider } from "./provider";
import { buildInvoicesFromDataset } from "./fromDataset";
import { useDatasets } from "@/context/DatasetsContext";
import { DatasetUpload } from "@/components/dashboard/dataset-upload";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
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

export default function SingleSourceRiskPage() {
  const { activeParameters, toggleParameter, applyPreset, isWidgetVisible } = useSingleSourceRiskFocus();
  const { getDatasetForPage } = useDatasets();
  const dataset = getDatasetForPage("single-source-risk");

  // Uploaded CSV (when present and usable) replaces the mock invoice list —
  // every widget, KPI, and filter option derives from it. The key remounts
  // the provider so filter state resets against the new data.
  const datasetInvoices = useMemo(
    () => (dataset ? buildInvoicesFromDataset(dataset) : null),
    [dataset]
  );

  return (
    <SingleSourceRiskProvider
      key={datasetInvoices ? dataset!.id : "static"}
      invoices={datasetInvoices ?? undefined}
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
            <DatasetUpload pageKey="single-source-risk" usingFallback={datasetInvoices === null} />
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
