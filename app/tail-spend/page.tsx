"use client";

import { useMemo, type ReactNode } from "react";
import { tailSpendMock, formatINR } from "./tailSpendMock";
import { buildTailSpendFromDataset } from "./fromDataset";
import { useDatasets } from "@/context/DatasetsContext";
import { useProviderPageData } from "@/hooks/use-provider-page-data";
import { loadTailSpendFromProvider } from "@/lib/page-data/tail-spend-from-provider";
import { DatasetUpload } from "@/components/dashboard/dataset-upload";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { DASHBOARD_CANVAS_ID } from "@/lib/snapshot";
import { WidgetGridSkeleton } from "@/components/dashboard/widget-grid-skeleton";
import { RevalidatingSection } from "@/components/dashboard/revalidating-section";
import { KpiRibbon } from "./components/KpiRibbon";
import { InvoiceValueBucketChart } from "./components/InvoiceValueBucketChart";
import { SupplierSpendRankChart } from "./components/SupplierSpendRankChart";
import { SpendByInvoiceValueDonut } from "./components/SpendByInvoiceValueDonut";
import { CategorySpendChart } from "./components/CategorySpendChart";
import { ParetoCurveChart } from "./components/ParetoCurveChart";
import { StrategicComparison } from "./components/StrategicComparison";
import { TailTrendChart } from "./components/TailTrendChart";
import { useFilterSlot } from "@/context/FilterContext";
import { useThresholds } from "@/context/ThresholdsContext";
import { FilterDateRange, FilterGroup, FilterSelect, FilterSlider } from "@/components/ui/filter-controls";
import { CustomizeViewDrawer } from "@/components/dashboard/customize-view-drawer";
import { FocusParameterBar } from "@/components/dashboard/focus-parameter-bar";
import { DASHBOARD_WIDGET_GROUPS } from "./components/dashboardParams";
import { FOCUS_PARAMETERS, FOCUS_PRESETS } from "./components/focusParams";
import { useDashboardCustomization } from "./components/useDashboardCustomization";
import {
  ALL_CATEGORIES,
  ALL_PLANTS,
  ALL_SOURCE_SYSTEMS,
  ALL_SUPPLIERS,
  DATE_MAX,
  DATE_MIN,
  useTailSpendStore,
} from "./lib/useTailSpendStore";
import { applyTailSpendFilters } from "./lib/reactiveFilters";

// Single card shell for every widget on the page — used inside the unified
// 2-column grid so every widget reads as one consistent visual system rather
// than two differently-styled tiers.
function Widget({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80 lg:p-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export default function TailSpendPage() {
  const { getDatasetForPage, providerType } = useDatasets();
  const dataset = getDatasetForPage("tail-spend");

  // Owns every sidebar filter (category, supplier, plant, date range,
  // bucket selection, pareto split) and is the ONLY place any of them
  // change — see useFilterSlot below.
  const store = useTailSpendStore();

  // The micro-PO boundary lives in ThresholdsContext so the sidebar slider,
  // the Thresholds popover, KPI badges, and chart accents all share one live,
  // localStorage-persisted value.
  const { getThreshold, setTargetValue } = useThresholds();
  const microPOThreshold = getThreshold("tail-spend.micro-po-value")?.targetValue ?? 25_000;

  // In Azure SQL mode the page reads fact_po_items through IDataProvider; the
  // threshold is part of the key because it changes the micro-PO query.
  const warehouse = useProviderPageData(
    (provider) => loadTailSpendFromProvider(provider, microPOThreshold),
    providerType === "azure-sql",
    `tail-spend:${microPOThreshold}`
  );

  const isAzureSqlMode = providerType === "azure-sql";
  // True only until the very first Azure SQL fetch of the session settles —
  // useProviderPageData's `ready` is sticky, so a later filter/threshold
  // change never re-triggers this once real data has rendered once.
  const isInitialAzureLoad = isAzureSqlMode && !warehouse.ready;
  // True while a filter/threshold change is re-querying Azure SQL for data
  // that's already on screen — drives the subtle in-place loading cue below,
  // never a reset to the skeleton or a flash of the CSV/mock fallback.
  const isRevalidating = isAzureSqlMode && warehouse.loading && warehouse.ready;

  const plantFilter = store.filters.plantSite !== ALL_PLANTS ? store.filters.plantSite : null;

  // Precedence: warehouse in Azure SQL mode, else an uploaded CSV, else the
  // static mock — so a widget never renders blank. Plant/BU is threaded in
  // here because it's the one filter that needs to be exact rather than
  // estimated (see fromDataset.ts) — CSV uploads carry real per-row plant
  // values that Category/Supplier/Date/Buckets don't need row access for.
  const data = useMemo(
    () =>
      warehouse.data?.data ??
      (dataset ? buildTailSpendFromDataset(dataset, microPOThreshold, plantFilter) : null) ??
      tailSpendMock,
    [warehouse.data, dataset, microPOThreshold, plantFilter]
  );

  // Every filter still in effect after buildTailSpendFromDataset (category,
  // supplier, date range, bucket selection) is applied here — this is what
  // every widget below actually renders, so any sidebar change recomputes
  // the whole page from one place.
  const filteredData = useMemo(() => applyTailSpendFilters(data, store.filters), [data, store.filters]);

  const {
    kpi,
    paretoDeciles,
    segmentComparison,
    monthlyTrend,
    sapKpiRibbon,
    invoiceValueBuckets,
    supplierSpendRank,
    sapCategoryRows,
  } = filteredData;

  // Filter dropdown OPTIONS always come from the unfiltered data, never from
  // filteredData — otherwise picking one category would erase every other
  // option from its own dropdown.
  const { categoryBreakdown, sapSupplierReport, sapFilterOptions } = data;

  const categoryNames = useMemo(
    () => Array.from(new Set(categoryBreakdown.map((c) => c.category))),
    [categoryBreakdown]
  );
  // De-duplicated: real extracts carry several supplier ids under one display
  // name, and the filter matches on the name — listing it twice would give the
  // dropdown duplicate option keys and two identical-looking choices.
  const supplierNames = useMemo(
    () =>
      Array.from(new Set(sapSupplierReport.map((s) => s.supplierName))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [sapSupplierReport]
  );

  const {
    activeParameters,
    toggleParameter,
    applyPreset,
    isWidgetEnabled,
    toggleWidgetEnabled,
    resetWidgetsToDefault,
    isWidgetVisible,
  } = useDashboardCustomization();

  useFilterSlot(
    <>
      <FilterGroup title="Global Filters">
        <FilterDateRange
          fromValue={store.filters.dateFrom}
          toValue={store.filters.dateTo}
          min={DATE_MIN}
          max={DATE_MAX}
          onFromChange={store.setDateFrom}
          onToChange={store.setDateTo}
        />
        <FilterSelect
          label="Category L1"
          value={store.filters.category}
          onChange={store.setCategory}
          options={[ALL_CATEGORIES, ...categoryNames].map((c) => ({ label: c, value: c }))}
        />
        <FilterSelect
          label="Supplier (Global Ultimate)"
          value={store.filters.supplierGlobalUltimate}
          onChange={store.setSupplier}
          options={[ALL_SUPPLIERS, ...supplierNames].map((s) => ({ label: s, value: s }))}
        />
        <FilterSelect
          label="Source System"
          value={store.filters.sourceSystem}
          onChange={store.setSourceSystem}
          options={[ALL_SOURCE_SYSTEMS, ...sapFilterOptions.sourceSystems].map((s) => ({ label: s, value: s }))}
        />
        <FilterSelect
          label="Plant / Site"
          value={store.filters.plantSite}
          onChange={store.setPlantSite}
          options={[ALL_PLANTS, ...sapFilterOptions.plantSites].map((p) => ({ label: p, value: p }))}
        />
      </FilterGroup>

      <FilterGroup title="Page Options" className="mt-6">
        <CustomizeViewDrawer
          groups={DASHBOARD_WIDGET_GROUPS}
          isWidgetEnabled={isWidgetEnabled}
          onToggleWidgetEnabled={toggleWidgetEnabled}
          onResetToDefault={resetWidgetsToDefault}
        />
        <FilterSlider
          label="Micro-PO Threshold"
          min={5_000}
          max={100_000}
          step={5_000}
          value={microPOThreshold}
          onChange={(v) => setTargetValue("tail-spend.micro-po-value", v)}
          formatValue={formatINR}
        />
        <FilterSlider
          label="Pareto Split"
          min={50}
          max={95}
          step={5}
          value={store.filters.paretoThreshold}
          onChange={store.setParetoThreshold}
          formatValue={(v) => `${v}%`}
        />
      </FilterGroup>
    </>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] rounded-xl bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 lg:p-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Spend Control Tower</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              SAP standard spend visibility for Vedanta&apos;s indirect spend base, extended with proactive
              tail-spend optimization insights.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <DatasetUpload pageKey="tail-spend" usingFallback={data === tailSpendMock} />
            <ExportSnapshotButton targetId={DASHBOARD_CANVAS_ID} dashboardTitle="Tail Spend" />
          </div>
        </div>

        <div id={DASHBOARD_CANVAS_ID} className="flex flex-col gap-6">
          <FocusParameterBar
            parameters={FOCUS_PARAMETERS}
            presets={FOCUS_PRESETS}
            activeParameters={activeParameters}
            onToggleParameter={toggleParameter}
            onApplyPreset={applyPreset}
            thresholdsPageKey="tail-spend"
          />

          {isInitialAzureLoad ? (
            <WidgetGridSkeleton kpiCount={8} widgetCount={7} />
          ) : (
            <RevalidatingSection isRevalidating={isRevalidating}>
              {/* ================= Executive KPI Ribbon ================= */}

              {isWidgetVisible("kpi-ribbon") && <KpiRibbon sapKpi={sapKpiRibbon} kpi={kpi} />}

              {/* ================= Dashboard Widgets — unified 2-column grid ================= */}

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {isWidgetVisible("invoice-value-bucket-chart") && (
                  <Widget title="Invoice Count by Invoice Value">
                    <InvoiceValueBucketChart
                      buckets={invoiceValueBuckets}
                      selectedBuckets={store.filters.selectedBuckets}
                      onToggleBucket={store.toggleBucket}
                      microThreshold={microPOThreshold}
                    />
                  </Widget>
                )}

                {isWidgetVisible("supplier-spend-rank-chart") && (
                  <Widget title="Spend by Supplier (Global Ultimate) for Selected Buckets">
                    <SupplierSpendRankChart suppliers={supplierSpendRank} />
                  </Widget>
                )}

                {isWidgetVisible("spend-by-invoice-value-donut") && (
                  <Widget title="Spend by Invoice Value">
                    <SpendByInvoiceValueDonut buckets={invoiceValueBuckets} selectedBuckets={store.filters.selectedBuckets} />
                  </Widget>
                )}

                {isWidgetVisible("category-spend-chart") && (
                  <Widget title="Spend by Category for Selected Buckets">
                    <CategorySpendChart categories={sapCategoryRows} />
                  </Widget>
                )}

                {isWidgetVisible("pareto-curve-chart") && (
                  <Widget
                    title="80/20 Pareto Distribution"
                    description="Suppliers ranked by spend, decile by decile — where the tail begins."
                  >
                    <ParetoCurveChart deciles={paretoDeciles} threshold={store.filters.paretoThreshold} />
                  </Widget>
                )}

                {isWidgetVisible("strategic-comparison") && (
                  <Widget
                    title="Strategic vs. Core vs. Tail"
                    description="How the three segments compare side by side."
                  >
                    <StrategicComparison segments={segmentComparison} />
                  </Widget>
                )}

                {isWidgetVisible("tail-trend-chart") && (
                  <Widget
                    title="12-Month Spend Trend"
                    description="Tail spend is climbing steadily while strategic/core swing with capex cycles."
                  >
                    <TailTrendChart months={monthlyTrend} />
                  </Widget>
                )}
              </div>
            </RevalidatingSection>
          )}
        </div>
      </div>
    </div>
  );
}
