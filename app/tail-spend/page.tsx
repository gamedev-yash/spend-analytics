"use client";

import { useMemo, useState, type ReactNode } from "react";
import { tailSpendMock, estimateMicroPOStats, formatINR } from "./tailSpendMock";
import { buildTailSpendFromDataset } from "./fromDataset";
import { useDatasets } from "@/context/DatasetsContext";
import { useProviderPageData } from "@/hooks/use-provider-page-data";
import { loadTailSpendFromProvider } from "@/lib/page-data/tail-spend-from-provider";
import { DatasetUpload } from "@/components/dashboard/dataset-upload";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { DASHBOARD_CANVAS_ID } from "@/lib/snapshot";
import { SapKpiRibbon } from "./components/SapKpiRibbon";
import { InvoiceValueBucketChart } from "./components/InvoiceValueBucketChart";
import { SupplierSpendRankChart } from "./components/SupplierSpendRankChart";
import { SpendByInvoiceValueDonut } from "./components/SpendByInvoiceValueDonut";
import { CategorySpendHybrid } from "./components/CategorySpendHybrid";
import { SapDetailTable } from "./components/SapDetailTable";
import { TailKPICards } from "./components/TailKPICards";
import { ParetoCurveChart } from "./components/ParetoCurveChart";
import { TailCategoryChart } from "./components/TailCategoryChart";
import { TailBubbleChart } from "./components/TailBubbleChart";
import { StrategicComparison } from "./components/StrategicComparison";
import { TailTrendChart } from "./components/TailTrendChart";
import { ConsolidationTable } from "./components/ConsolidationTable";
import { MicroPOAnalysis } from "./components/MicroPOAnalysis";
import { useFilterSlot } from "@/context/FilterContext";
import { useThresholds } from "@/context/ThresholdsContext";
import { FilterGroup, FilterSelect, FilterSlider, FilterToggle } from "@/components/ui/filter-controls";
import { CustomizeViewDrawer } from "@/components/dashboard/customize-view-drawer";
import { FocusParameterBar } from "@/components/dashboard/focus-parameter-bar";
import { DASHBOARD_WIDGET_GROUPS } from "./components/dashboardParams";
import { FOCUS_PARAMETERS, FOCUS_PRESETS } from "./components/focusParams";
import { useDashboardCustomization } from "./components/useDashboardCustomization";
import { cn } from "@/lib/utils";

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
  microPOOnly: boolean;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80 lg:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Widget({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80",
        className
      )}
    >
      <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {children}
    </div>
  );
}

// When an odd number of the 4 chart widgets below are visible, the last one
// would otherwise sit alone in a half-empty row at the xl 2-column
// breakpoint — this expands it to fill the row instead of leaving a gap.
const LAST_ODD_SPANS_FULL = "xl:[&:last-child:nth-child(odd)]:col-span-2";

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
    supplierBubbles,
    segmentComparison,
    monthlyTrend,
    consolidationCandidates,
    poValueBuckets,
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
    microPOOnly: false,
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
        <FilterToggle
          label="Micro-POs only"
          checked={filters.microPOOnly}
          onChange={(v) => updateFilter("microPOOnly", v)}
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

  const filteredSupplierReport = useMemo(
    () =>
      sapSupplierReport.filter(
        (r) => filters.supplierGlobalUltimate === ALL_SUPPLIERS || r.supplierName === filters.supplierGlobalUltimate
      ),
    [sapSupplierReport, filters.supplierGlobalUltimate]
  );

  // --- Tier 2: Advanced AI & Tail Spend Optimization ------------------------
  const sortedCategories = useMemo(
    () =>
      [...categoryBreakdown]
        .filter((c) => filters.category === ALL_CATEGORIES || c.category === filters.category)
        .sort((a, b) => b.tailPercent - a.tailPercent),
    [categoryBreakdown, filters.category]
  );

  const filteredBubbles = useMemo(
    () => supplierBubbles.filter((s) => filters.category === ALL_CATEGORIES || s.category === filters.category),
    [supplierBubbles, filters.category]
  );

  const filteredCandidates = useMemo(
    () =>
      consolidationCandidates.filter(
        (c) =>
          (filters.category === ALL_CATEGORIES || c.category === filters.category) &&
          (!filters.microPOOnly || c.microPOCount / c.poCount >= 0.5)
      ),
    [consolidationCandidates, filters.category, filters.microPOOnly]
  );

  const microStats = useMemo(
    () => estimateMicroPOStats(poValueBuckets, microPOThreshold),
    [poValueBuckets, microPOThreshold]
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

          {/* ================= TIER 1: SAP Spend Control Tower ================= */}

          {isWidgetVisible("sap-kpi-ribbon") && <SapKpiRibbon kpi={sapKpiRibbon} />}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {isWidgetVisible("invoice-value-bucket-chart") && (
              <Widget title="Invoice Count by Invoice Value" className={LAST_ODD_SPANS_FULL}>
                <InvoiceValueBucketChart
                  buckets={invoiceValueBuckets}
                  selectedBuckets={selectedBuckets}
                  onToggleBucket={toggleBucket}
                  microThreshold={microPOThreshold}
                />
              </Widget>
            )}

            {isWidgetVisible("supplier-spend-rank-chart") && (
              <Widget title="Spend by Supplier (Global Ultimate) for Selected Buckets" className={LAST_ODD_SPANS_FULL}>
                <SupplierSpendRankChart suppliers={scaledSupplierSpendRank} />
              </Widget>
            )}

            {isWidgetVisible("spend-by-invoice-value-donut") && (
              <Widget title="Spend by Invoice Value" className={LAST_ODD_SPANS_FULL}>
                <SpendByInvoiceValueDonut buckets={invoiceValueBuckets} selectedBuckets={selectedBuckets} />
              </Widget>
            )}

            {isWidgetVisible("category-spend-hybrid") && (
              <Widget title="Spend by Category for Selected Buckets" className={LAST_ODD_SPANS_FULL}>
                <CategorySpendHybrid categories={scaledCategoryRows} />
              </Widget>
            )}
          </div>

          {isWidgetVisible("sap-detail-table") && (
            <Section title="Supplier (Global Ultimate) Detail Report">
              <SapDetailTable rows={filteredSupplierReport} />
            </Section>
          )}

          {/* ================= Tier divider ================= */}
          <div className="flex items-center gap-4 py-2">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            <p className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Extended AI &amp; Value-Add Optimization Insights
            </p>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>

          {/* ================= TIER 2: Advanced AI & Tail Spend Optimization ================= */}

          {isWidgetVisible("tail-kpi-cards") && (
            <TailKPICards kpi={kpi} microStats={microStats} threshold={microPOThreshold} />
          )}

          {isWidgetVisible("pareto-curve-chart") && (
            <Section
              title="80/20 Pareto Distribution"
              description="Suppliers ranked by spend, decile by decile — where the tail begins."
            >
              <ParetoCurveChart deciles={paretoDeciles} threshold={filters.paretoThreshold} />
            </Section>
          )}

          {isWidgetVisible("tail-category-chart") && (
            <Section
              title="Spend by Category"
              description="Strategic / Core / Tail split per category, ranked by tail-spend share."
            >
              <TailCategoryChart categories={sortedCategories} />
            </Section>
          )}

          {isWidgetVisible("tail-bubble-chart") && (
            <Section
              title="Supplier Segmentation Matrix"
              description="PO count vs. avg PO value, sized by total spend."
            >
              <TailBubbleChart suppliers={filteredBubbles} />
            </Section>
          )}

          {isWidgetVisible("strategic-comparison") && (
            <Section title="Strategic vs. Core vs. Tail" description="How the three segments compare side by side.">
              <StrategicComparison segments={segmentComparison} />
            </Section>
          )}

          {isWidgetVisible("tail-trend-chart") && (
            <Section
              title="12-Month Spend Trend"
              description="Tail spend is climbing steadily while strategic/core swing with capex cycles."
            >
              <TailTrendChart months={monthlyTrend} />
            </Section>
          )}

          {isWidgetVisible("consolidation-table") && (
            <Section
              title="Consolidation Candidates"
              description="Tail suppliers ranked by consolidation opportunity — highest potential savings first."
            >
              <ConsolidationTable candidates={filteredCandidates} />
            </Section>
          )}

          {isWidgetVisible("micro-po-analysis") && (
            <Section
              title="Micro-PO Value Distribution"
              description={`${kpi.totalPOCount.toLocaleString("en-IN")} POs bucketed by value — the smallest buckets cost more to process than they're worth.`}
            >
              <MicroPOAnalysis buckets={poValueBuckets} threshold={microPOThreshold} />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
