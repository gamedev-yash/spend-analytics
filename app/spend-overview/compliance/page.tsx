import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { ComplianceFilters } from "./compliance-filters";
import { ComplianceCanvas } from "./ComplianceCanvas";
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

      <ComplianceCanvas
        headline={headline}
        riskDistribution={riskDistribution}
        dimensionPassRates={dimensionPassRates}
        trend={trend}
        violationTypes={violationTypes}
        worstSuppliers={worstSuppliers}
        recentViolations={recentViolations}
      />
    </div>
  );
}
