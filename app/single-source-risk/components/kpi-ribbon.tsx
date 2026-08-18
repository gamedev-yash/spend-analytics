"use client";

import { AlertTriangle, Boxes, Users, Wallet } from "lucide-react";
import { useSingleSourceRisk } from "../provider";
import { computeKpis } from "../selectors";
import { formatCurrencyFull } from "../constants";
import { useThresholds } from "@/context/ThresholdsContext";
import { thresholdEvaluationTitle } from "@/lib/threshold-format";
import { KpiCard } from "@/components/dashboard/kpi-card";

export function KpiRibbon() {
  const { filteredInvoices } = useSingleSourceRisk();
  const { totalSpend, supplierCount, productCount, categoryCount } = computeKpis(filteredInvoices);
  const { getThreshold, evaluate } = useThresholds();

  const categoryConfig = getThreshold("single-source-risk.category-count");
  const categoryStatus = evaluate("single-source-risk.category-count", categoryCount);

  return (
    <div className="kpi-ribbon grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard label="Total Spend" value={formatCurrencyFull(totalSpend)} icon={<Wallet />} accent="blue" />
      <KpiCard
        label="Suppliers"
        value={supplierCount.toLocaleString()}
        icon={<Users />}
        accent="violet"
      />
      <KpiCard label="Products" value={productCount.toLocaleString()} icon={<Boxes />} accent="green" />
      <KpiCard
        label="Categories"
        value={categoryCount.toLocaleString()}
        icon={<AlertTriangle />}
        accent="red"
        status={categoryStatus}
        statusTitle={categoryConfig ? thresholdEvaluationTitle(categoryCount, categoryConfig) : undefined}
      />
    </div>
  );
}
