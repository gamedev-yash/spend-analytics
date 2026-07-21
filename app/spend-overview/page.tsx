import { Building2, FileCheck2, ShieldAlert, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SapFilterBar } from "@/components/sap/filter-bar";
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <DashboardTabs />
        <p className="text-xs text-muted-foreground">
          Initiative 18 · Dashboard 1 of 6{activeFilterCount > 0 ? ` · ${activeFilterCount} filter(s) active` : ""}
        </p>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Spend Overview — Vedanta</h1>
        <p className="text-sm text-muted-foreground">
          How much are we spending, on what, with whom, and is it going up or down?
        </p>
      </div>

      <InsightBox text={insightText} />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total Spend" value={formatCr(kpis.totalSpendInr)} icon={<Wallet />} accent="blue" />
        <KpiCard label="Total PO Count" value={kpis.poCount.toLocaleString()} icon={<FileCheck2 />} />
        <KpiCard label="Active Suppliers" value={kpis.activeSupplierCount.toLocaleString()} icon={<Users />} />
        <KpiCard label="Avg. PO Value" value={formatInr(kpis.avgPoValueInr)} icon={<FileCheck2 />} />
        <KpiCard
          label="YoY Spend Change"
          value={formatSignedPercentInr(kpis.yoyChangePercent)}
          icon={kpis.yoyChangePercent > 0 ? <TrendingUp /> : <TrendingDown />}
          accent={kpis.yoyChangePercent > 0 ? "red" : "green"}
          delta={{
            value: formatSignedPercentInr(kpis.yoyChangePercent),
            direction: kpis.yoyChangePercent >= 0 ? "up" : "down",
            goodDirection: "down",
          }}
        />
        <KpiCard
          label="Off-Contract Spend"
          value={formatPercentInr(kpis.offContractPercent)}
          icon={<ShieldAlert />}
          accent={kpis.offContractPercent > 25 ? "red" : "green"}
          hint={kpis.offContractPercent > 25 ? "Above 25% threshold" : "Within threshold"}
        />
      </section>

      <SapFilterBar
        plantOptions={filterOptions.plants}
        categoryOptions={filterOptions.categoriesL1}
        dateMin={filterOptions.dateMin}
        dateMax={filterOptions.dateMax}
      />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <ChartCard
          title="Spend by Category"
          description="L1 → L2 treemap, sized by spend, colored by YoY change — click to drill in"
          icon={<TrendingUp />}
          accent="blue"
          className="xl:col-span-2"
        >
          <CategoryTreemap nodes={treemapNodes} />
        </ChartCard>
        <ChartCard
          title="Top 20 Suppliers"
          description="Subsidiaries rolled up to parent group — stacked by category, with a Pareto cumulative line"
          icon={<Users />}
          accent="violet"
          className="xl:col-span-3"
        >
          <TopSuppliersChart rows={topSuppliers.rows} allL1={topSuppliers.allL1} top5Percent={topSuppliers.top5Percent} />
        </ChartCard>
      </section>

      <ChartCard
        title="Spend Trend Over Time"
        description="Jan 2023 – Dec 2025, always full history regardless of the Time Period filter above"
        icon={<TrendingUp />}
        accent="blue"
      >
        <SpendTrendChart trend={trend} spikes={spikes} />
      </ChartCard>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Spend by Business Unit"
          description="Which BU is spending the most, and on what — click a bar to drill in"
          icon={<Building2 />}
          accent="orange"
        >
          <SpendByBuChart rows={buSpend} />
        </ChartCard>
        <ChartCard
          title="Spend Composition"
          description="Business Unit → Category → Subcategory — click any ring to drill in"
          icon={<Building2 />}
          accent="green"
        >
          <SpendSunburst nodes={sunburstNodes} plantNameToCode={plantNameToCode} />
        </ChartCard>
      </section>

      <ChartCard
        title="Key Metrics Summary"
        description="One row per L1 category — sortable, exportable, thresholds flagged in red"
        icon={<FileCheck2 />}
        accent="blue"
      >
        <MetricsTable rows={metricsRows} />
      </ChartCard>
    </div>
  );
}
