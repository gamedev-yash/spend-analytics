"use client";

import { ShieldAlert, FileWarning, Users, Building2 } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SpendBarList } from "@/components/sap/spend-bar-list";
import { formatCr, formatPercentInr } from "@/lib/sap/format-inr";
import { useThresholds } from "@/context/ThresholdsContext";
import { thresholdEvaluationTitle } from "@/lib/threshold-format";
import type { ThresholdStatus } from "@/types/thresholds";
import type { AccentColor } from "@/lib/chart-colors";
import type {
  ComplianceHeadline,
  CategorySpendPoint,
  SupplierSpendPoint,
  BuSpendPoint,
} from "@/lib/sap/compliance";

const STATUS_ACCENT: Record<ThresholdStatus, AccentColor> = {
  success: "green",
  warning: "orange",
  danger: "red",
};

interface ComplianceCanvasProps {
  headline: ComplianceHeadline;
  offPoByCategory: CategorySpendPoint[];
  offContractByCategory: CategorySpendPoint[];
  unmanagedBySupplier: SupplierSpendPoint[];
  unmanagedByBu: BuSpendPoint[];
}

/**
 * Client canvas for the standalone Compliance page. No focus-parameter bar
 * or widget customization here on purpose — this page is deliberately a
 * fixed, small set of widgets (see SAP Spend Control Tower "Spend Overview -
 * Compliance" dashboard, pages 13-14), not a configurable canvas.
 */
export function ComplianceCanvas({
  headline,
  offPoByCategory,
  offContractByCategory,
  unmanagedBySupplier,
  unmanagedByBu,
}: ComplianceCanvasProps) {
  const { getThreshold, evaluate } = useThresholds();
  const unmanagedConfig = getThreshold("compliance.unmanaged-spend");
  const unmanagedStatus = evaluate("compliance.unmanaged-spend", headline.unmanagedSpendPercent);

  return (
    <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Unmanaged Spend"
          value={formatCr(headline.unmanagedSpendInr)}
          icon={<ShieldAlert />}
          accent={unmanagedStatus ? STATUS_ACCENT[unmanagedStatus] : "red"}
          status={unmanagedStatus}
          statusTitle={unmanagedConfig ? thresholdEvaluationTitle(headline.unmanagedSpendPercent, unmanagedConfig) : undefined}
          hint={`${formatPercentInr(headline.unmanagedSpendPercent)} of total spend`}
        />
        <KpiCard label="Unmanaged Invoices" value={headline.unmanagedInvoiceCount.toLocaleString()} icon={<FileWarning />} />
        <KpiCard label="Unmanaged Suppliers" value={headline.unmanagedSupplierCount.toLocaleString()} icon={<Users />} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          className="h-[420px]"
          title="Off-PO Spend by Categories"
          description="Invoices with no purchase order, by category"
          icon={<FileWarning />}
          accent="orange"
        >
          <SpendBarList
            rows={offPoByCategory.map((c) => ({ key: c.category, label: c.category, value: c.value, percent: c.percent }))}
            colorSlot="orange"
            percentHeader="% of Off-PO"
          />
        </ChartCard>
        <ChartCard
          className="h-[420px]"
          title="Off-Contract Spend by Categories"
          description="POs with no associated contract, by category"
          icon={<FileWarning />}
          accent="blue"
        >
          <SpendBarList
            rows={offContractByCategory.map((c) => ({ key: c.category, label: c.category, value: c.value, percent: c.percent }))}
            colorSlot="blue"
            percentHeader="% of Off-Contract"
          />
        </ChartCard>
        <ChartCard
          className="h-[420px]"
          title="Unmanaged Spend by BU"
          description="Off-PO + off-contract combined, by business unit"
          icon={<Building2 />}
          accent="green"
        >
          <SpendBarList
            rows={unmanagedByBu.map((b) => ({ key: b.plantCode, label: b.plantName, value: b.value, percent: b.percent }))}
            colorSlot="aqua"
            labelHeader="Business Unit"
            percentHeader="% of Unmanaged"
          />
        </ChartCard>
        <ChartCard
          className="h-[420px]"
          title="Unmanaged Spend by Suppliers"
          description="Off-PO + off-contract combined, by supplier"
          icon={<Users />}
          accent="violet"
        >
          <SpendBarList
            rows={unmanagedBySupplier.map((s) => ({ key: s.key, label: s.displayName, value: s.value, percent: s.percent }))}
            colorSlot="magenta"
            labelHeader="Supplier"
            percentHeader="% of Unmanaged"
          />
        </ChartCard>
      </div>
    </>
  );
}
