import { ClipboardCheck, FileWarning, PackageSearch, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { FilterSelect } from "@/components/dashboard/filter-select";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { ChartCard } from "@/components/dashboard/chart-card";
import { RiskDonutChart } from "@/components/charts/risk-donut-chart";
import { HorizontalBarChart } from "@/components/charts/horizontal-bar-chart";
import { ComplianceTrendChart } from "@/components/charts/compliance-trend-chart";
import { WorstSuppliersTable } from "@/components/tables/worst-suppliers-table";
import { RecentViolationsTable } from "@/components/tables/recent-violations-table";
import {
  getComplianceFilterOptions,
  getComplianceHeadline,
  getRiskDistribution,
  getDimensionPassRates,
  getComplianceTrend,
  getViolationTypeBreakdown,
  getWorstSuppliers,
  getRecentViolations,
} from "@/lib/aggregate-compliance";
import { formatPercent, formatNumber } from "@/lib/format";
import type { AccentColor } from "@/lib/chart-colors";
import type { RiskLevel } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ businessUnit?: string; riskLevel?: string }>;
}

export default async function CompliancePage({ searchParams }: PageProps) {
  const { businessUnit, riskLevel } = await searchParams;
  const filters = { businessUnit, riskLevel: riskLevel as RiskLevel | undefined };

  const { businessUnits, riskLevels } = getComplianceFilterOptions();
  const headline = getComplianceHeadline(filters);
  const riskDistribution = getRiskDistribution(filters);
  const dimensionPassRates = getDimensionPassRates(filters);
  const trend = getComplianceTrend(filters);
  const violationTypes = getViolationTypeBreakdown(filters);
  const worstSuppliers = getWorstSuppliers(filters, 10);
  const recentViolations = getRecentViolations(filters, 25);
  const isFiltered = Boolean(businessUnit || riskLevel);

  const heroAccent: AccentColor =
    headline.avgOverallCompliance >= 90 ? "green" : headline.avgOverallCompliance >= 75 ? "orange" : "red";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <DashboardTabs />
        <p className="text-xs text-muted-foreground">
          Fiscal Year 2025 · {headline.totalTransactions.toLocaleString()} transactions in slice
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <HeroStat
          className="xl:col-span-2"
          eyebrow="Overall Avg. Compliance"
          value={formatPercent(headline.avgOverallCompliance)}
          icon={<ClipboardCheck />}
          accent={heroAccent}
          description="Blended across contract, pricing, policy, approval & delivery checks"
          trend={trend.map((t) => ({ month: t.month, value: t.avgOverallCompliance }))}
          trendFormat="percent"
        />
        <div className="grid grid-cols-2 gap-4">
          <KpiCard
            size="compact"
            accent="blue"
            label="Contract Compliance"
            value={formatPercent(headline.contractCompliancePercent)}
            icon={<ShieldCheck />}
            hint="Target 88–95%"
          />
          <KpiCard
            size="compact"
            accent="green"
            label="On-Time Delivery"
            value={formatPercent(headline.onTimeDeliveryPercent)}
            icon={<PackageSearch />}
            hint="Target ~90%"
          />
          <KpiCard
            size="compact"
            accent="red"
            label="High-Risk Transactions"
            value={formatNumber(headline.highRiskCount)}
            icon={<FileWarning />}
            delta={{ value: `${headline.totalViolations.toLocaleString()} violations`, direction: "down", goodDirection: "down" }}
          />
          <KpiCard
            size="compact"
            accent="violet"
            label="Pricing Compliance"
            value={formatPercent(headline.pricingCompliancePercent)}
            icon={<TrendingUp />}
          />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-4">
        <KpiCard size="compact" label="Policy Compliance" value={formatPercent(headline.policyCompliancePercent)} icon={<ClipboardCheck />} />
        <KpiCard size="compact" label="Approval Compliance" value={formatPercent(headline.approvalCompliancePercent)} icon={<Users />} />
        <KpiCard size="compact" label="Delivery Compliance" value={formatPercent(headline.deliveryCompliancePercent)} icon={<PackageSearch />} />
      </section>

      <section className="flex flex-wrap items-end gap-4 rounded-lg border bg-muted/20 p-4">
        <FilterSelect paramKey="businessUnit" label="Business Unit" options={businessUnits} />
        <FilterSelect paramKey="riskLevel" label="Risk Level" options={riskLevels} />
        {isFiltered && (
          <p className="pb-2 text-xs text-muted-foreground">
            Showing {headline.totalTransactions.toLocaleString()} transactions for this slice.
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          title="Risk Distribution"
          description="Transactions by overall risk level"
          icon={<FileWarning />}
          accent="red"
          className="xl:col-span-1"
        >
          <RiskDonutChart data={riskDistribution} />
        </ChartCard>
        <ChartCard
          title="Compliance Trend"
          description="Average overall compliance % by month, vs. 90% target"
          icon={<TrendingUp />}
          accent="blue"
          className="xl:col-span-2"
        >
          <ComplianceTrendChart data={trend} />
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Compliance by Dimension"
          description="Pass rate per compliance check — colored by health threshold"
          icon={<ClipboardCheck />}
          accent="green"
        >
          <HorizontalBarChart
            data={dimensionPassRates.map((d) => ({ name: d.dimension, value: d.passRatePercent }))}
            format="percent"
            colorMode="threshold"
          />
        </ChartCard>
        <ChartCard
          title="Violation Types"
          description="Breakdown of the root cause behind non-compliant transactions"
          icon={<FileWarning />}
          accent="violet"
        >
          <HorizontalBarChart
            data={violationTypes.map((v) => ({ name: v.violationType, value: v.count }))}
            format="number"
            colorMode="entity"
            entityDimension="violationType"
          />
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Suppliers to Watch" description="Most violations and lowest average compliance in this slice" icon={<Users />} accent="orange">
          <WorstSuppliersTable data={worstSuppliers} />
        </ChartCard>
        <ChartCard title="Recent Violations" description="Most recent non-compliant transactions in this slice" icon={<FileWarning />} accent="red">
          <RecentViolationsTable data={recentViolations} />
        </ChartCard>
      </section>
    </div>
  );
}
