"use client";

import { ClipboardCheck, FileWarning, PackageSearch, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { FocusParameterBar } from "@/components/dashboard/focus-parameter-bar";
import { RiskDonutChart } from "@/components/charts/risk-donut-chart";
import { HorizontalBarChart } from "@/components/charts/horizontal-bar-chart";
import { ComplianceTrendChart } from "@/components/charts/compliance-trend-chart";
import { WorstSuppliersTable } from "@/components/tables/worst-suppliers-table";
import { RecentViolationsTable } from "@/components/tables/recent-violations-table";
import type {
  ComplianceHeadline,
  RiskDistributionPoint,
  DimensionPassRate,
  ComplianceTrendPoint,
  ViolationTypeCount,
  WorstSupplierRow,
  RecentViolationRow,
} from "@/lib/aggregate-compliance";
import { formatPercent, formatNumber } from "@/lib/format";
import { SO_FOCUS_PARAMETERS, SO_FOCUS_PRESETS } from "../components/focusParams";
import { useSpendOverviewFocus } from "../components/useSpendOverviewFocus";

interface ComplianceCanvasProps {
  headline: ComplianceHeadline;
  riskDistribution: RiskDistributionPoint[];
  dimensionPassRates: DimensionPassRate[];
  trend: ComplianceTrendPoint[];
  violationTypes: ViolationTypeCount[];
  worstSuppliers: WorstSupplierRow[];
  recentViolations: RecentViolationRow[];
}

/**
 * Client-side canvas for the Compliance tab. Shares the Summary tab's
 * useSpendOverviewFocus store — same module, same localStorage key — so
 * Focus Parameter and Customize-drawer state carries across both tabs.
 */
export function ComplianceCanvas({
  headline,
  riskDistribution,
  dimensionPassRates,
  trend,
  violationTypes,
  worstSuppliers,
  recentViolations,
}: ComplianceCanvasProps) {
  const { activeParameters, toggleParameter, applyPreset, isWidgetVisible } = useSpendOverviewFocus();

  return (
    <>
      <FocusParameterBar
        parameters={SO_FOCUS_PARAMETERS}
        presets={SO_FOCUS_PRESETS}
        activeParameters={activeParameters}
        onToggleParameter={toggleParameter}
        onApplyPreset={applyPreset}
      />

      {isWidgetVisible("kpi-compliance-headline") && (
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
      )}

      {/* Trailing odd child spans the full row so hiding widgets never leaves a gap. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
        {isWidgetVisible("risk-donut-chart") && (
          <ChartCard className="h-[420px]" title="Risk Distribution" description="By overall risk level" icon={<FileWarning />} accent="red">
            <RiskDonutChart data={riskDistribution} />
          </ChartCard>
        )}
        {isWidgetVisible("compliance-trend-chart") && (
          <ChartCard className="h-[420px]" title="Compliance Trend" description="Monthly avg. vs. 90% target" icon={<TrendingUp />} accent="blue">
            <ComplianceTrendChart data={trend} />
          </ChartCard>
        )}
        {isWidgetVisible("dimension-pass-rates-chart") && (
          <ChartCard className="h-[420px]" title="Compliance by Dimension" description="Colored by health threshold" icon={<ClipboardCheck />} accent="green">
            <HorizontalBarChart
              data={dimensionPassRates.map((d) => ({ name: d.dimension, value: d.passRatePercent }))}
              format="percent"
              colorMode="threshold"
            />
          </ChartCard>
        )}
        {isWidgetVisible("violation-types-chart") && (
          <ChartCard className="h-[420px]" title="Violation Types" description="Root cause breakdown" icon={<FileWarning />} accent="violet">
            <HorizontalBarChart
              data={violationTypes.map((v) => ({ name: v.violationType, value: v.count }))}
              format="number"
              colorMode="entity"
              entityDimension="violationType"
            />
          </ChartCard>
        )}
        {isWidgetVisible("worst-suppliers-table") && (
          <ChartCard className="h-[420px]" title="Suppliers to Watch" description="Most violations in this slice" icon={<Users />} accent="orange">
            <WorstSuppliersTable data={worstSuppliers} />
          </ChartCard>
        )}
        {isWidgetVisible("recent-violations-table") && (
          <ChartCard className="h-[420px]" title="Recent Violations" description="Most recent non-compliant POs" icon={<FileWarning />} accent="red">
            <RecentViolationsTable data={recentViolations} />
          </ChartCard>
        )}
      </div>
    </>
  );
}
