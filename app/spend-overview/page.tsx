import {
  Building2,
  FileCheck2,
  Handshake,
  PackageSearch,
  PiggyBank,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { FilterSelect } from "@/components/dashboard/filter-select";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SpendTrendChart } from "@/components/charts/spend-trend-chart";
import { HorizontalBarChart } from "@/components/charts/horizontal-bar-chart";
import { SavingsAreaChart } from "@/components/charts/savings-area-chart";
import { TopSuppliersTable } from "@/components/tables/top-suppliers-table";
import { kpis } from "@/lib/raw-data";
import {
  getSummaryFilterOptions,
  getMonthlySpendTrend,
  getCategorySpend,
  getPlantSpend,
  getTopSuppliers,
  getSavingsTrend,
  getFilteredHeadline,
} from "@/lib/aggregate-summary";
import { formatUsdCompact, formatPercent, formatSignedPercent } from "@/lib/format";

interface PageProps {
  searchParams: Promise<{ businessUnit?: string; category?: string }>;
}

export default async function SpendOverviewPage({ searchParams }: PageProps) {
  const { businessUnit, category } = await searchParams;
  const filters = { businessUnit, category };

  const { categories, businessUnits } = getSummaryFilterOptions();
  const monthlyTrend = getMonthlySpendTrend(filters);
  const categorySpend = getCategorySpend(filters);
  const plantSpend = getPlantSpend(filters);
  const topSuppliers = getTopSuppliers(filters, 10);
  const savingsTrend = getSavingsTrend();
  const headline = getFilteredHeadline(filters);
  const isFiltered = Boolean(businessUnit || category);

  const contractSharePercent = kpis.totalSpend > 0
    ? Math.round((kpis.spendUnderContract / kpis.totalSpend) * 1000) / 10
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <DashboardTabs />
        <p className="text-xs text-muted-foreground">Fiscal Year 2025 · Jan – Dec</p>
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <HeroStat
          className="xl:col-span-2"
          eyebrow="Total Spend"
          value={formatUsdCompact(kpis.totalSpend)}
          icon={<Wallet />}
          accent="blue"
          delta={{ value: formatSignedPercent(kpis.spendGrowthPercent), direction: kpis.spendGrowthPercent >= 0 ? "up" : "down" }}
          description="H2 vs H1 · Fiscal Year 2025"
          trend={kpis.monthlySpendTrend.map((m) => ({ month: m.month.slice(5), value: m.spend }))}
          trendFormat="usd"
        />
        <div className="grid grid-cols-2 gap-4">
          <KpiCard
            size="compact"
            accent="violet"
            label="Spend Under Contract"
            value={formatPercent(contractSharePercent)}
            icon={<Handshake />}
            hint={formatUsdCompact(kpis.spendUnderContract)}
          />
          <KpiCard
            size="compact"
            accent="red"
            label="Maverick Spend"
            value={formatUsdCompact(kpis.maverickSpend)}
            icon={<ShieldAlert />}
            hint="Non-contract exceptions"
          />
          <KpiCard
            size="compact"
            accent="green"
            label="Savings Achieved"
            value={formatUsdCompact(kpis.savingsAchieved)}
            icon={<PiggyBank />}
            hint="From repricing"
          />
          <KpiCard
            size="compact"
            accent="orange"
            label="Avg. PO Value"
            value={formatUsdCompact(kpis.averagePOValue)}
            icon={<FileCheck2 />}
            hint={`${kpis.totalPurchaseOrders.toLocaleString()} POs`}
          />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-4">
        <KpiCard
          size="compact"
          label="Preferred Suppliers"
          value={`${kpis.preferredSuppliers} / ${kpis.totalSuppliers}`}
          icon={<Building2 />}
          hint={`Avg. rating ${kpis.averageSupplierRating.toFixed(2)}`}
        />
        <KpiCard size="compact" label="Active Contracts" value={String(kpis.activeContracts)} icon={<FileCheck2 />} />
        <KpiCard
          size="compact"
          label="Total Purchase Orders"
          value={kpis.totalPurchaseOrders.toLocaleString()}
          icon={<FileCheck2 />}
        />
      </section>

      <section className="flex flex-wrap items-end gap-4 rounded-lg border bg-muted/20 p-4">
        <FilterSelect paramKey="businessUnit" label="Business Unit" options={businessUnits} />
        <FilterSelect paramKey="category" label="Category" options={categories} />
        {isFiltered && (
          <p className="pb-2 text-xs text-muted-foreground">
            Showing {formatUsdCompact(headline.totalSpend)} across {headline.poCount.toLocaleString()} POs and{" "}
            {headline.supplierCount} suppliers for this slice.
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          title="Monthly Spend Trend"
          description="Total, contract, and non-contract spend by month"
          icon={<TrendingUp />}
          accent="blue"
          className="xl:col-span-2"
        >
          <SpendTrendChart data={monthlyTrend} />
        </ChartCard>
        <ChartCard
          title="Realized Savings"
          description="Monthly savings from repricing and contract renewal"
          icon={<PiggyBank />}
          accent="green"
        >
          <SavingsAreaChart data={savingsTrend} />
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Spend by Category"
          description="Click a bar to drill into that category"
          icon={<PackageSearch />}
          accent="violet"
        >
          <HorizontalBarChart
            data={categorySpend.map((c) => ({ name: c.category, value: c.spend, subtitle: `${c.percentage}% of slice` }))}
            format="usd"
            colorMode="entity"
            entityDimension="category"
            filterParamKey="category"
          />
        </ChartCard>
        <ChartCard
          title="Spend by Plant"
          description="Colored by business unit — click a bar to drill in"
          icon={<Building2 />}
          accent="orange"
        >
          <HorizontalBarChart
            data={plantSpend.map((p) => ({ name: p.plant, value: p.spend, subtitle: p.businessUnit, colorKey: p.businessUnit }))}
            format="usd"
            colorMode="entity"
            entityDimension="businessUnit"
            filterParamKey="businessUnit"
          />
        </ChartCard>
      </section>

      <ChartCard
        title="Top Suppliers"
        description="Ranked by spend for the current filter slice — sortable"
        icon={<Handshake />}
        accent="blue"
      >
        <TopSuppliersTable data={topSuppliers} />
      </ChartCard>
    </div>
  );
}
