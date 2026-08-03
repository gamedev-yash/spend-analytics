"use client";

import { useMemo, useState } from "react";
import { Copy, Layers, Target, TrendingUp, Users } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { FocusParameterBar } from "@/components/dashboard/focus-parameter-bar";
import { supplierMock } from "./supplierMock";
import { buildSupplierFragmentationFromDataset } from "./fromDataset";
import { useDatasets } from "@/context/DatasetsContext";
import { useProviderPageData } from "@/hooks/use-provider-page-data";
import { loadSupplierFragmentationFromProvider } from "@/lib/page-data/supplier-fragmentation-from-provider";
import { DatasetUpload } from "@/components/dashboard/dataset-upload";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { DASHBOARD_CANVAS_ID } from "@/lib/snapshot";
import { SF_FOCUS_PARAMETERS, SF_FOCUS_PRESETS } from "./components/focusParams";
import { useSupplierFragmentationFocus } from "./components/useSupplierFragmentationFocus";
import { SupplierFragmentationFilters, ALL_CATEGORIES } from "./components/SupplierFragmentationFilters";
import { SupplierKpiCards } from "./components/SupplierKpiCards";
import { CategoryFragmentationChart } from "./components/CategoryFragmentationChart";
import { CategoryConcentrationChart } from "./components/CategoryConcentrationChart";
import { SupplierSizeChart } from "./components/SupplierSizeChart";
import { TopSupplierParetoChart } from "./components/TopSupplierParetoChart";
import { OnboardingTrendChart } from "./components/OnboardingTrendChart";
import { DuplicateSupplierTable } from "./components/DuplicateSupplierTable";

interface SupplierFragmentationFilterState {
  dateRange: string;
  category: string;
  sourceSystem: string;
  plantSite: string;
  concentrationThreshold: number;
}

export default function SupplierFragmentationPage() {
  const { getDatasetForPage, providerType } = useDatasets();
  const dataset = getDatasetForPage("supplier-fragmentation");

  // Azure SQL mode derives the category concentration table from fact_po_items.
  const warehouse = useProviderPageData(
    loadSupplierFragmentationFromProvider,
    providerType === "azure-sql",
    "supplier-fragmentation"
  );

  // Precedence: warehouse, then an uploaded CSV, then the static mock — so no
  // widget renders blank.
  const data = useMemo(
    () =>
      warehouse.data ??
      (dataset ? buildSupplierFragmentationFromDataset(dataset) : null) ??
      supplierMock,
    [warehouse.data, dataset]
  );

  const { categories, sizeBuckets, topSuppliers, monthlyOnboarding, duplicatePairs, filterOptions } = data;

  const categoryNames = useMemo(() => categories.map((c) => c.category), [categories]);

  const [filters, setFilters] = useState<SupplierFragmentationFilterState>(() => ({
    dateRange: filterOptions.dateRanges[0],
    category: ALL_CATEGORIES,
    sourceSystem: "All Source Systems",
    plantSite: "All Plants/Sites",
    concentrationThreshold: 40,
  }));

  function updateFilters(patch: Partial<SupplierFragmentationFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  const { activeParameters, toggleParameter, applyPreset, isWidgetVisible } = useSupplierFragmentationFocus();

  const filteredCategories = useMemo(
    () => categories.filter((c) => filters.category === ALL_CATEGORIES || c.category === filters.category),
    [categories, filters.category]
  );

  return (
    <div className="flex flex-col gap-6">
      <SupplierFragmentationFilters
        filterOptions={filterOptions}
        categories={categoryNames}
        dateRange={filters.dateRange}
        category={filters.category}
        sourceSystem={filters.sourceSystem}
        plantSite={filters.plantSite}
        concentrationThreshold={filters.concentrationThreshold}
        onChange={updateFilters}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Supplier Fragmentation</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Where the supplier base is fragmented, concentrated, or carrying duplicate records worth
            consolidating.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <DatasetUpload pageKey="supplier-fragmentation" usingFallback={data === supplierMock} />
          <ExportSnapshotButton targetId={DASHBOARD_CANVAS_ID} dashboardTitle="Supplier Fragmentation" />
        </div>
      </div>

      <div id={DASHBOARD_CANVAS_ID} className="flex flex-col gap-6">
        <FocusParameterBar
          parameters={SF_FOCUS_PARAMETERS}
          presets={SF_FOCUS_PRESETS}
          activeParameters={activeParameters}
          onToggleParameter={toggleParameter}
          onApplyPreset={applyPreset}
          thresholdsPageKey="supplier-fragmentation"
        />

        <SupplierKpiCards data={data} isWidgetVisible={isWidgetVisible} />

        {/* Trailing odd child spans the full row so hiding/filtering widgets never leaves a gap. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
          {isWidgetVisible("category-fragmentation") && (
            <ChartCard
              className="h-[420px]"
              title="Supplier Count by Category"
              description="Repeat vs. single-use suppliers per category"
              icon={<Layers />}
              accent="blue"
            >
              <CategoryFragmentationChart categories={filteredCategories} />
            </ChartCard>
          )}

          {isWidgetVisible("category-concentration") && (
            <ChartCard
              className="h-[420px]"
              title="Category Concentration"
              description="Top-3 supplier share vs. alert threshold"
              icon={<Target />}
              accent="orange"
            >
              <CategoryConcentrationChart categories={filteredCategories} threshold={filters.concentrationThreshold} />
            </ChartCard>
          )}

          {isWidgetVisible("size-distribution") && (
            <ChartCard
              className="h-[420px]"
              title="Suppliers by Annual Spend"
              description="Long low-value tail signals fragmentation"
              icon={<Users />}
              accent="green"
            >
              <SupplierSizeChart buckets={sizeBuckets} />
            </ChartCard>
          )}

          {isWidgetVisible("top-supplier-pareto") && (
            <ChartCard
              className="h-[420px]"
              title="Top 10 Suppliers"
              description="Spend and cumulative share of total"
              icon={<Target />}
              accent="violet"
            >
              <TopSupplierParetoChart suppliers={topSuppliers} />
            </ChartCard>
          )}

          {isWidgetVisible("onboarding-trend") && (
            <ChartCard
              className="h-[420px]"
              title="12-Month Onboarding Trend"
              description="New suppliers and the share that were single-use"
              icon={<TrendingUp />}
              accent="blue"
            >
              <OnboardingTrendChart months={monthlyOnboarding} />
            </ChartCard>
          )}
        </div>

        {isWidgetVisible("duplicate-table") && (
          <ChartCard
            title="Potential Duplicate Suppliers"
            description={`${duplicatePairs.length} name-similarity matches ranked highest-confidence first`}
            icon={<Copy />}
            accent="red"
          >
            <DuplicateSupplierTable pairs={duplicatePairs} />
          </ChartCard>
        )}
      </div>
    </div>
  );
}
