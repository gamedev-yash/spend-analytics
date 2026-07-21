import { ClipboardCheck, FileWarning, PackageSearch, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { FilterSelect } from "@/components/dashboard/filter-select";
import { KpiCard } from "@/components/dashboard/kpi-card";
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

  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <DashboardTabs />
        <p className="shrink-0 text-xs text-muted-foreground">
          Fiscal Year 2025 · {headline.totalTransactions.toLocaleString()} transactions
          {isFiltered ? " in slice" : ""}
        </p>
      </div>

      <section className="grid shrink-0 grid-cols-4 gap-2.5 lg:grid-cols-8">
        <KpiCard size="compact" accent="blue" label="Overall Avg. Compliance" value={formatPercent(headline.avgOverallCompliance)} icon={<ClipboardCheck />} />
        <KpiCard size="compact" accent="violet" label="Contract Compliance" value={formatPercent(headline.contractCompliancePercent)} icon={<ShieldCheck />} hint="Target 88–95%" />
        <KpiCard size="compact" accent="green" label="On-Time Delivery" value={formatPercent(headline.onTimeDeliveryPercent)} icon={<PackageSearch />} hint="Target ~90%" />
        <KpiCard
          size="compact"
          accent="red"
          label="High-Risk Transactions"
          value={formatNumber(headline.highRiskCount)}
          icon={<FileWarning />}
          hint={`${headline.totalViolations.toLocaleString()} violations`}
        />
        <KpiCard size="compact" label="Pricing Compliance" value={formatPercent(headline.pricingCompliancePercent)} icon={<TrendingUp />} />
        <KpiCard size="compact" label="Policy Compliance" value={formatPercent(headline.policyCompliancePercent)} icon={<ClipboardCheck />} />
        <KpiCard size="compact" label="Approval Compliance" value={formatPercent(headline.approvalCompliancePercent)} icon={<Users />} />
        <KpiCard size="compact" label="Delivery Compliance" value={formatPercent(headline.deliveryCompliancePercent)} icon={<PackageSearch />} />
      </section>

      <div className="flex shrink-0 flex-wrap items-end gap-3 rounded-md border bg-muted/20 px-3 py-1.5">
        <FilterSelect paramKey="businessUnit" label="Business Unit" options={businessUnits} />
        <FilterSelect paramKey="riskLevel" label="Risk Level" options={riskLevels} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-2.5">
        <ChartCard title="Risk Distribution" description="By overall risk level" icon={<FileWarning />} accent="red">
          <RiskDonutChart data={riskDistribution} />
        </ChartCard>
        <ChartCard title="Compliance Trend" description="Monthly avg. vs. 90% target" icon={<TrendingUp />} accent="blue">
          <ComplianceTrendChart data={trend} />
        </ChartCard>
        <ChartCard title="Compliance by Dimension" description="Colored by health threshold" icon={<ClipboardCheck />} accent="green">
          <HorizontalBarChart
            data={dimensionPassRates.map((d) => ({ name: d.dimension, value: d.passRatePercent }))}
            format="percent"
            colorMode="threshold"
          />
        </ChartCard>
        <ChartCard title="Violation Types" description="Root cause breakdown" icon={<FileWarning />} accent="violet">
          <HorizontalBarChart
            data={violationTypes.map((v) => ({ name: v.violationType, value: v.count }))}
            format="number"
            colorMode="entity"
            entityDimension="violationType"
          />
        </ChartCard>
        <ChartCard title="Suppliers to Watch" description="Most violations in this slice" icon={<Users />} accent="orange">
          <WorstSuppliersTable data={worstSuppliers} />
        </ChartCard>
        <ChartCard title="Recent Violations" description="Most recent non-compliant POs" icon={<FileWarning />} accent="red">
          <RecentViolationsTable data={recentViolations} />
        </ChartCard>
      </div>
    </div>
  );
}
