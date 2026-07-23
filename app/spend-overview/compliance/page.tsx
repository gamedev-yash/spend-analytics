import { ClipboardCheck, FileWarning, PackageSearch, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { ComplianceFilters } from "./compliance-filters";
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
    <div className="flex flex-col gap-6">
      <ComplianceFilters businessUnits={businessUnits} riskLevels={riskLevels} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Spend Compliance — Vedanta
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Contract, pricing, policy, approval, and delivery compliance across the same spend base.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <DashboardTabs />
          <p className="text-xs text-muted-foreground">
            Fiscal Year 2025 · {headline.totalTransactions.toLocaleString()} transactions
            {isFiltered ? " in slice" : ""}
          </p>
        </div>
      </div>

      <section className="grid grid-cols-4 gap-3 lg:grid-cols-8">
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

      {/* Trailing odd child spans the full row so hiding widgets never leaves a gap. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
        <ChartCard className="h-[420px]" title="Risk Distribution" description="By overall risk level" icon={<FileWarning />} accent="red">
          <RiskDonutChart data={riskDistribution} />
        </ChartCard>
        <ChartCard className="h-[420px]" title="Compliance Trend" description="Monthly avg. vs. 90% target" icon={<TrendingUp />} accent="blue">
          <ComplianceTrendChart data={trend} />
        </ChartCard>
        <ChartCard className="h-[420px]" title="Compliance by Dimension" description="Colored by health threshold" icon={<ClipboardCheck />} accent="green">
          <HorizontalBarChart
            data={dimensionPassRates.map((d) => ({ name: d.dimension, value: d.passRatePercent }))}
            format="percent"
            colorMode="threshold"
          />
        </ChartCard>
        <ChartCard className="h-[420px]" title="Violation Types" description="Root cause breakdown" icon={<FileWarning />} accent="violet">
          <HorizontalBarChart
            data={violationTypes.map((v) => ({ name: v.violationType, value: v.count }))}
            format="number"
            colorMode="entity"
            entityDimension="violationType"
          />
        </ChartCard>
        <ChartCard className="h-[420px]" title="Suppliers to Watch" description="Most violations in this slice" icon={<Users />} accent="orange">
          <WorstSuppliersTable data={worstSuppliers} />
        </ChartCard>
        <ChartCard className="h-[420px]" title="Recent Violations" description="Most recent non-compliant POs" icon={<FileWarning />} accent="red">
          <RecentViolationsTable data={recentViolations} />
        </ChartCard>
      </div>
    </div>
  );
}
