import { Building2, FileCheck2, ShieldAlert, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SpendOverviewFilters } from "@/components/sap/spend-overview-filters";
import { InsightBox } from "@/components/sap/insight-box";
import { CategoryTreemap } from "@/components/sap/category-treemap";
import { TopSuppliersChart } from "@/components/sap/top-suppliers-chart";
import { SpendTrendChart } from "@/components/sap/spend-trend-chart";
import { SpendByBuChart } from "@/components/sap/spend-by-bu-chart";
import { SpendSunburst } from "@/components/sap/spend-sunburst";
import { MetricsTable } from "@/components/sap/metrics-table";
import { plants } from "@/lib/sap/raw-data";
import {
  getFilterOptions,
  getHeadlineKpis,
  getCategoryTreemapData,
  getTopSuppliersData,
  getSpendTrendData,
  getSpikeMarkers,
  getSpendByBuData,
  getSunburstData,
  getMetricsTableData,
  generateInsightText,
} from "@/lib/sap/aggregate";
import { formatCr, formatInr, formatPercentInr, formatSignedPercentInr } from "@/lib/sap/format-inr";
import type { SapFilters, SpendType } from "@/lib/sap/types";

interface PageProps {
  searchParams: Promise<{
    bu?: string;
    cat?: string;
    from?: string;
    to?: string;
    spend?: string;
    vendor?: string;
    catPath?: string;
  }>;
}

export default async function SpendOverviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters: SapFilters = {
    plants: params.bu?.split(",").filter(Boolean),
    categoriesL1: params.cat?.split(",").filter(Boolean),
    dateFrom: params.from,
    dateTo: params.to,
    spendType: (params.spend as SpendType) ?? "po",
    vendorId: params.vendor,
    categoryPath: params.catPath,
  };

  const filterOptions = getFilterOptions();
  const kpis = getHeadlineKpis(filters);
  const treemapNodes = getCategoryTreemapData(filters);
  const topSuppliers = getTopSuppliersData(filters, 20);
  const trend = getSpendTrendData(filters);
  const spikes = getSpikeMarkers(trend);
  const buSpend = getSpendByBuData(filters);
  const sunburstNodes = getSunburstData(filters);
  const metricsRows = getMetricsTableData(filters);
  const insightText = generateInsightText(filters);
  const plantNameToCode = Object.fromEntries(plants.map((p) => [p.plant_name, p.plant_code]));

  const activeFilterCount =
    (filters.plants?.length ?? 0) +
    (filters.categoriesL1?.length ?? 0) +
    (filters.vendorId ? 1 : 0) +
    (filters.categoryPath ? 1 : 0);

  return (
    <div className="flex flex-col gap-6">
      <SpendOverviewFilters
        plantOptions={filterOptions.plants}
        categoryOptions={filterOptions.categoriesL1}
        dateMin={filterOptions.dateMin}
        dateMax={filterOptions.dateMax}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Spend Overview — Vedanta
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enterprise-wide spend visibility across business units, categories, and suppliers.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <DashboardTabs />
          <p className="text-xs text-muted-foreground">
            Initiative 18 · Dashboard 1 of 6{activeFilterCount > 0 ? ` · ${activeFilterCount} filter(s) active` : ""}
          </p>
        </div>
      </div>

      <InsightBox text={insightText} />

      <section className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        <KpiCard size="compact" label="Total Spend" value={formatCr(kpis.totalSpendInr)} icon={<Wallet />} accent="blue" />
        <KpiCard size="compact" label="Total PO Count" value={kpis.poCount.toLocaleString()} icon={<FileCheck2 />} />
        <KpiCard size="compact" label="Active Suppliers" value={kpis.activeSupplierCount.toLocaleString()} icon={<Users />} />
        <KpiCard size="compact" label="Avg. PO Value" value={formatInr(kpis.avgPoValueInr)} icon={<FileCheck2 />} />
        <KpiCard
          size="compact"
          label="YoY Spend Change"
          value={formatSignedPercentInr(kpis.yoyChangePercent)}
          icon={kpis.yoyChangePercent > 0 ? <TrendingUp /> : <TrendingDown />}
          accent={kpis.yoyChangePercent > 0 ? "red" : "green"}
        />
        <KpiCard
          size="compact"
          label="Off-Contract Spend"
          value={formatPercentInr(kpis.offContractPercent)}
          icon={<ShieldAlert />}
          accent={kpis.offContractPercent > 25 ? "red" : "green"}
          hint={kpis.offContractPercent > 25 ? "Above 25% threshold" : "Within threshold"}
        />
      </section>

      {/* Trailing odd child spans the full row so hiding widgets never leaves a gap. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
        <ChartCard className="h-[420px]" title="Spend by Category" description="Click to drill in" icon={<TrendingUp />} accent="blue">
          <CategoryTreemap nodes={treemapNodes} />
        </ChartCard>
        <ChartCard className="h-[420px]" title="Top 20 Suppliers" description="Stacked by category + Pareto line" icon={<Users />} accent="violet">
          <TopSuppliersChart rows={topSuppliers.rows} allL1={topSuppliers.allL1} top5Percent={topSuppliers.top5Percent} />
        </ChartCard>
        <ChartCard className="h-[420px]" title="Spend Trend" description="Jan 2023 – Dec 2025, full history" icon={<TrendingUp />} accent="blue">
          <SpendTrendChart trend={trend} spikes={spikes} />
        </ChartCard>
        <ChartCard className="h-[420px]" title="Spend by Business Unit" description="Click a bar to drill in" icon={<Building2 />} accent="orange">
          <SpendByBuChart rows={buSpend} />
        </ChartCard>
        <ChartCard className="h-[420px]" title="Spend Composition" description="BU → Category → Subcategory" icon={<Building2 />} accent="green">
          <SpendSunburst nodes={sunburstNodes} plantNameToCode={plantNameToCode} />
        </ChartCard>
        <ChartCard className="h-[420px]" title="Key Metrics Summary" description="Sortable, exportable" icon={<FileCheck2 />} accent="blue">
          <MetricsTable rows={metricsRows} />
        </ChartCard>
      </div>
    </div>
  );
}
