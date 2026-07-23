"use client";

import { useMemo, useState } from "react";
import { Copy, Layers, Target, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { FocusParameterBar } from "@/components/dashboard/focus-parameter-bar";
import { supplierMock } from "./supplierMock";
import { SF_FOCUS_PARAMETERS, SF_FOCUS_PRESETS } from "./components/focusParams";
import { useSupplierFocus } from "./components/useSupplierFocus";
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
  const { categories, sizeBuckets, topSuppliers, monthlyOnboarding, duplicatePairs, filterOptions } = supplierMock;

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

  const { activeParameters, toggleParameter, applyPreset, isVisible } = useSupplierFocus();

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

      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Supplier Fragmentation</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Where the supplier base is fragmented, concentrated, or carrying duplicate records worth
          consolidating.
        </p>
      </div>

      <SupplierKpiCards data={supplierMock} />

      <FocusParameterBar
        parameters={SF_FOCUS_PARAMETERS}
        presets={SF_FOCUS_PRESETS}
        activeParameters={activeParameters}
        onToggleParameter={toggleParameter}
        onApplyPreset={applyPreset}
      />

      {/* Trailing odd child spans the full row so hiding/filtering widgets never leaves a gap. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
        {isVisible("category-fragmentation") && (
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

        {isVisible("category-concentration") && (
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

        {isVisible("size-distribution") && (
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

        {isVisible("top-supplier-pareto") && (
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

        {isVisible("onboarding-trend") && (
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

      {isVisible("duplicate-table") && (
        <Card>
          <CardHeader className="flex-row items-center gap-2.5 space-y-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 [&_svg]:h-4 [&_svg]:w-4">
              <Copy />
            </span>
            <div>
              <CardTitle className="text-sm">Potential Duplicate Suppliers</CardTitle>
              <p className="text-xs text-muted-foreground">
                {duplicatePairs.length} name-similarity matches ranked highest-confidence first
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <DuplicateSupplierTable pairs={duplicatePairs} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
