"use client";

import { useMemo, type ReactNode } from "react";
import { tailSpendMock, formatINR } from "./tailSpendMock";
import { useProviderPageData } from "@/hooks/use-provider-page-data";
import { loadTailSpendFromProvider } from "@/lib/page-data/tail-spend-from-provider";
import { useDatasets } from "@/context/DatasetsContext";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { DASHBOARD_CANVAS_ID } from "@/lib/snapshot";
import { WidgetGridSkeleton } from "@/components/dashboard/widget-grid-skeleton";
import { RevalidatingSection } from "@/components/dashboard/revalidating-section";
import { useFullscreen, FullscreenOverlay, MaximizeButton } from "@/components/dashboard/fullscreen-overlay";
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
import { ClearFiltersButton, FilterDateRange, FilterGroup, FilterSlider } from "@/components/ui/filter-controls";
import { MultiSelect } from "@/components/sap/multi-select";
import { CustomizeViewDrawer } from "@/components/dashboard/customize-view-drawer";
import { FocusParameterBar } from "@/components/dashboard/focus-parameter-bar";
import { DASHBOARD_WIDGET_GROUPS } from "./components/dashboardParams";
import { FOCUS_PARAMETERS, FOCUS_PRESETS } from "./components/focusParams";
import { useDashboardCustomization } from "./components/useDashboardCustomization";
import { DATE_MAX, DATE_MIN, useTailSpendStore } from "./lib/useTailSpendStore";
import { applyTailSpendFilters } from "./lib/reactiveFilters";

function toOptions(values: string[]) {
  return values.map((v) => ({ value: v, label: v }));
}

// Single card shell for every widget on the page — used inside the unified
// 2-column grid so every widget reads as one consistent visual system rather
// than two differently-styled tiers. Every widget is fullscreen-expandable.
function Widget({
  title,
  description,
  activeFilters,
  children,
}: {
  title: string;
  description?: string;
  activeFilters?: string;
  children: ReactNode;
}) {
  const { isFullscreen, setIsFullscreen } = useFullscreen();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        <MaximizeButton onClick={() => setIsFullscreen(true)} />
      </div>
      {children}
      <FullscreenOverlay
        open={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        title={title}
        description={description}
        activeFilters={activeFilters}
      >
        {children}
      </FullscreenOverlay>
    </div>
  );
}

export default function TailSpendPage() {
  const { providerType } = useDatasets();

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
  // never a reset to the skeleton or a flash of the mock fallback.
  const isRevalidating = isAzureSqlMode && warehouse.loading && warehouse.ready;

  // The active Data Provider (Azure SQL, sample-CSV fallback under the hood
  // when no warehouse is configured), else the static mock — never a
  // client-uploaded CSV, so this page never depends on DatasetsContext's
  // upload path.
  const data = useMemo(() => warehouse.data?.data ?? tailSpendMock, [warehouse.data]);

  // Owns every sidebar filter (category, supplier, plant, source system,
  // date range, bucket selection, pareto split), cascades Category<->Supplier
  // options against `data`, and is the ONLY place any of them change — see
  // useFilterSlot below.
  const store = useTailSpendStore(data);

  // Every filter still in effect (category, supplier, date range, bucket
  // selection) is applied here — this is what every widget below actually
  // renders, so any sidebar change recomputes the whole page from one place.
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

  const {
    activeParameters,
    toggleParameter,
    applyPreset,
    isWidgetEnabled,
    toggleWidgetEnabled,
    resetWidgetsToDefault,
    isWidgetVisible,
  } = useDashboardCustomization();

  const hasActiveFilters =
    store.filters.categories.length > 0 ||
    store.filters.suppliers.length > 0 ||
    store.filters.plants.length > 0 ||
    store.filters.sourceSystems.length > 0 ||
    store.filters.dateFrom !== DATE_MIN ||
    store.filters.dateTo !== DATE_MAX;

  const activeFiltersSummary = useMemo(() => {
    const parts: string[] = [];
    if (store.filters.categories.length) parts.push(`Category: ${store.filters.categories.join(", ")}`);
    if (store.filters.suppliers.length) parts.push(`Supplier: ${store.filters.suppliers.join(", ")}`);
    if (store.filters.plants.length) parts.push(`BU / Plant: ${store.filters.plants.join(", ")}`);
    if (store.filters.sourceSystems.length) parts.push(`Source System: ${store.filters.sourceSystems.join(", ")}`);
    if (store.filters.dateFrom !== DATE_MIN || store.filters.dateTo !== DATE_MAX) {
      parts.push(`Date: ${store.filters.dateFrom} to ${store.filters.dateTo}`);
    }
    return parts.join(" · ");
  }, [store.filters]);

  useFilterSlot(
    <>
      <FilterGroup title="Filters">
        <FilterDateRange
          fromValue={store.filters.dateFrom}
          toValue={store.filters.dateTo}
          min={DATE_MIN}
          max={DATE_MAX}
          onFromChange={store.setDateFrom}
          onToChange={store.setDateTo}
        />
        <MultiSelect
          label="Category"
          allLabel="All categories"
          options={toOptions(store.options.categories)}
          selected={store.filters.categories}
          onChange={store.setCategories}
        />
        <MultiSelect
          label="Supplier"
          allLabel="All suppliers"
          options={toOptions(store.options.suppliers)}
          selected={store.filters.suppliers}
          onChange={store.setSuppliers}
        />
        <MultiSelect
          label="Source System"
          allLabel="All source systems"
          options={toOptions(store.options.sourceSystems)}
          selected={store.filters.sourceSystems}
          onChange={store.setSourceSystems}
        />
        <MultiSelect
          label="BU / Plant"
          allLabel="All plants"
          options={toOptions(store.options.plants)}
          selected={store.filters.plants}
          onChange={store.setPlants}
        />
        {hasActiveFilters && <ClearFiltersButton onClick={store.resetFilters} />}
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
                  <Widget title="Invoice Count by Invoice Value" activeFilters={activeFiltersSummary}>
                    <InvoiceValueBucketChart
                      buckets={invoiceValueBuckets}
                      selectedBuckets={store.filters.selectedBuckets}
                      onToggleBucket={store.toggleBucket}
                      microThreshold={microPOThreshold}
                    />
                  </Widget>
                )}

                {isWidgetVisible("supplier-spend-rank-chart") && (
                  <Widget title="Spend by Supplier for Selected Buckets" activeFilters={activeFiltersSummary}>
                    <SupplierSpendRankChart suppliers={supplierSpendRank} />
                  </Widget>
                )}

                {isWidgetVisible("spend-by-invoice-value-donut") && (
                  <Widget title="Spend by Invoice Value" activeFilters={activeFiltersSummary}>
                    <SpendByInvoiceValueDonut buckets={invoiceValueBuckets} selectedBuckets={store.filters.selectedBuckets} />
                  </Widget>
                )}

                {isWidgetVisible("category-spend-chart") && (
                  <Widget title="Spend by Category for Selected Buckets" activeFilters={activeFiltersSummary}>
                    <CategorySpendChart categories={sapCategoryRows} />
                  </Widget>
                )}

                {isWidgetVisible("pareto-curve-chart") && (
                  <Widget
                    title="80/20 Pareto Distribution"
                    description="Suppliers ranked by spend, decile by decile — where the tail begins."
                    activeFilters={activeFiltersSummary}
                  >
                    <ParetoCurveChart deciles={paretoDeciles} threshold={store.filters.paretoThreshold} />
                  </Widget>
                )}

                {isWidgetVisible("strategic-comparison") && (
                  <Widget
                    title="Strategic vs. Core vs. Tail"
                    description="How the three segments compare side by side."
                    activeFilters={activeFiltersSummary}
                  >
                    <StrategicComparison segments={segmentComparison} />
                  </Widget>
                )}

                {isWidgetVisible("tail-trend-chart") && (
                  <Widget
                    title="12-Month Spend Trend"
                    description="Tail spend is climbing steadily while strategic/core swing with capex cycles."
                    activeFilters={activeFiltersSummary}
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
