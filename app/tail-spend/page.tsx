"use client";

import { useMemo, useState, type ReactNode } from "react";
import { tailSpendMock, formatINR } from "./tailSpendMock";
import { buildTailSpendFromDataset } from "./fromDataset";
import { useDatasets } from "@/context/DatasetsContext";
import { useProviderPageData } from "@/hooks/use-provider-page-data";
import { loadTailSpendFromProvider } from "@/lib/page-data/tail-spend-from-provider";
import { DatasetUpload } from "@/components/dashboard/dataset-upload";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { DASHBOARD_CANVAS_ID } from "@/lib/snapshot";
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
import { FilterGroup, FilterSelect, FilterSlider } from "@/components/ui/filter-controls";
import { CustomizeViewDrawer } from "@/components/dashboard/customize-view-drawer";
import { FocusParameterBar } from "@/components/dashboard/focus-parameter-bar";
import { DASHBOARD_WIDGET_GROUPS } from "./components/dashboardParams";
import { FOCUS_PARAMETERS, FOCUS_PRESETS } from "./components/focusParams";
import { useDashboardCustomization } from "./components/useDashboardCustomization";

const ALL_CATEGORIES = "All Categories";
const ALL_SUPPLIERS = "All Suppliers";
const ALL_SOURCE_SYSTEMS = "All Source Systems";
const ALL_PLANTS = "All Plants/Sites";

interface TailSpendFilters {
  dateRange: string;
  category: string;
  supplierGlobalUltimate: string;
  sourceSystem: string;
  plantSite: string;
  paretoThreshold: number;
}

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

  // Precedence: warehouse in Azure SQL mode, else an uploaded CSV, else the
  // static mock — so a widget never renders blank.
  const data = useMemo(
    () =>
      warehouse.data?.data ??
      (dataset ? buildTailSpendFromDataset(dataset, microPOThreshold) : null) ??
      tailSpendMock,
    [warehouse.data, dataset, microPOThreshold]
  );

  const {
    kpi,
    paretoDeciles,
    categoryBreakdown,
    segmentComparison,
    monthlyTrend,
    sapKpiRibbon,
    invoiceValueBuckets,
    supplierSpendRank,
    sapCategoryRows,
    sapSupplierReport,
    sapFilterOptions,
  } = data;

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

  // Single filter state shared by every widget on the page — the sidebar
  // drawer is the only place any of it is edited (see useFilterSlot below).
  const [filters, setFilters] = useState<TailSpendFilters>(() => ({
    dateRange: sapFilterOptions.dateRanges[0],
    category: ALL_CATEGORIES,
    supplierGlobalUltimate: ALL_SUPPLIERS,
    sourceSystem: ALL_SOURCE_SYSTEMS,
    plantSite: ALL_PLANTS,
    paretoThreshold: 80,
  }));

  function updateFilter<K extends keyof TailSpendFilters>(key: K, value: TailSpendFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

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
        <FilterSelect
          label="Date Range"
          value={filters.dateRange}
          onChange={(v) => updateFilter("dateRange", v)}
          options={sapFilterOptions.dateRanges.map((d) => ({ label: d, value: d }))}
        />
        <FilterSelect
          label="Category L1"
          value={filters.category}
          onChange={(v) => updateFilter("category", v)}
          options={[ALL_CATEGORIES, ...categoryNames].map((c) => ({ label: c, value: c }))}
        />
        <FilterSelect
          label="Supplier (Global Ultimate)"
          value={filters.supplierGlobalUltimate}
          onChange={(v) => updateFilter("supplierGlobalUltimate", v)}
          options={[ALL_SUPPLIERS, ...supplierNames].map((s) => ({ label: s, value: s }))}
        />
        <FilterSelect
          label="Source System"
          value={filters.sourceSystem}
          onChange={(v) => updateFilter("sourceSystem", v)}
          options={[ALL_SOURCE_SYSTEMS, ...sapFilterOptions.sourceSystems].map((s) => ({ label: s, value: s }))}
        />
        <FilterSelect
          label="Plant / Site"
          value={filters.plantSite}
          onChange={(v) => updateFilter("plantSite", v)}
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
          value={filters.paretoThreshold}
          onChange={(v) => updateFilter("paretoThreshold", v)}
          formatValue={(v) => `${v}%`}
        />
      </FilterGroup>
    </>
  );

  // --- Tier 1: SAP Spend Control Tower --------------------------------------
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(
    () => new Set(invoiceValueBuckets.map((b) => b.bucketLabel))
  );

  function toggleBucket(bucketLabel: string) {
    setSelectedBuckets((prev) => {
      const allSelected = prev.size === invoiceValueBuckets.length;
      if (allSelected) return new Set([bucketLabel]);
      const next = new Set(prev);
      if (next.has(bucketLabel)) {
        next.delete(bucketLabel);
      } else {
        next.add(bucketLabel);
      }
      return next.size === 0 ? new Set(invoiceValueBuckets.map((b) => b.bucketLabel)) : next;
    });
  }

  const selectedSpendFraction = useMemo(() => {
    const selectedPercent = invoiceValueBuckets
      .filter((b) => selectedBuckets.has(b.bucketLabel))
      .reduce((sum, b) => sum + b.spendPercent, 0);
    return selectedPercent / 100;
  }, [invoiceValueBuckets, selectedBuckets]);

  const scaledSupplierSpendRank = useMemo(
    () =>
      supplierSpendRank
        .filter((s) => filters.supplierGlobalUltimate === ALL_SUPPLIERS || s.supplierName === filters.supplierGlobalUltimate)
        .map((s) => ({ ...s, totalSpend: s.totalSpend * selectedSpendFraction })),
    [supplierSpendRank, filters.supplierGlobalUltimate, selectedSpendFraction]
  );

  const scaledCategoryRows = useMemo(
    () =>
      sapCategoryRows
        .filter((c) => filters.category === ALL_CATEGORIES || c.category === filters.category)
        .map((c) => ({ ...c, spend: c.spend * selectedSpendFraction })),
    [sapCategoryRows, filters.category, selectedSpendFraction]
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

          {/* ================= Executive KPI Ribbon ================= */}

          {isWidgetVisible("kpi-ribbon") && <KpiRibbon sapKpi={sapKpiRibbon} kpi={kpi} />}

          {/* ================= Dashboard Widgets — unified 2-column grid ================= */}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {isWidgetVisible("invoice-value-bucket-chart") && (
              <Widget title="Invoice Count by Invoice Value">
                <InvoiceValueBucketChart
                  buckets={invoiceValueBuckets}
                  selectedBuckets={selectedBuckets}
                  onToggleBucket={toggleBucket}
                  microThreshold={microPOThreshold}
                />
              </Widget>
            )}

            {isWidgetVisible("supplier-spend-rank-chart") && (
              <Widget title="Spend by Supplier (Global Ultimate) for Selected Buckets">
                <SupplierSpendRankChart suppliers={scaledSupplierSpendRank} />
              </Widget>
            )}

            {isWidgetVisible("spend-by-invoice-value-donut") && (
              <Widget title="Spend by Invoice Value">
                <SpendByInvoiceValueDonut buckets={invoiceValueBuckets} selectedBuckets={selectedBuckets} />
              </Widget>
            )}

            {isWidgetVisible("category-spend-chart") && (
              <Widget title="Spend by Category for Selected Buckets">
                <CategorySpendChart categories={scaledCategoryRows} />
              </Widget>
            )}

            {isWidgetVisible("pareto-curve-chart") && (
              <Widget
                title="80/20 Pareto Distribution"
                description="Suppliers ranked by spend, decile by decile — where the tail begins."
              >
                <ParetoCurveChart deciles={paretoDeciles} threshold={filters.paretoThreshold} />
              </Widget>
            )}

            {isWidgetVisible("strategic-comparison") && (
              <Widget title="Strategic vs. Core vs. Tail" description="How the three segments compare side by side.">
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
        </div>
      </div>
    </div>
  );
}
