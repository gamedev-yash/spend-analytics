"use client";

import {
  FileText,
  Building2,
  Landmark,
  Repeat,
  Layers,
  Gauge,
  Users,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";
import type { KPISummary, SapKpiRibbon as SapKpiRibbonData } from "../tailSpendMock";
import { formatINR, formatCompactNumber } from "../tailSpendMock";
import { useThresholds } from "@/context/ThresholdsContext";
import { thresholdEvaluationTitle } from "@/lib/threshold-format";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ThresholdStatus } from "@/types/thresholds";

interface KpiRibbonProps {
  sapKpi: SapKpiRibbonData;
  kpi: KPISummary;
}

interface KPICardDef {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  badge?: { status: ThresholdStatus; title: string } | null;
}

/** Evaluate a threshold id against a live value, packaged for a card badge. */
function useThresholdBadge(id: string, value: number): KPICardDef["badge"] {
  const { getThreshold, evaluate } = useThresholds();
  const config = getThreshold(id);
  const status = evaluate(id, value);
  if (!config || !status) return null;
  return { status, title: thresholdEvaluationTitle(value, config) };
}

/**
 * Single executive KPI ribbon: the SAP standard metrics (Invoices, Suppliers,
 * mean-per-supplier figures) plus the four tail-spend optimization metrics
 * that matter for consolidation decisions, combined into one responsive grid
 * instead of two separately-styled tiers.
 */
export function KpiRibbon({ sapKpi, kpi }: KpiRibbonProps) {
  const tailShareBadge = useThresholdBadge("tail-spend.tail-share", kpi.tailSpendPercentOfValue);
  const savingsBadge = useThresholdBadge("tail-spend.savings-target", kpi.potentialConsolidationSavings);

  const cards: KPICardDef[] = [
    // Default SAP standard KPIs
    {
      icon: FileText,
      label: "Invoices",
      value: formatCompactNumber(sapKpi.invoiceCount),
    },
    {
      icon: Building2,
      label: "Suppliers (Global Ultimate)",
      value: formatCompactNumber(sapKpi.supplierCountGlobalUltimate),
    },
    {
      icon: Landmark,
      label: "Mean Invoice Amount / Supplier",
      value: formatINR(sapKpi.meanInvoiceAmountPerSupplier),
    },
    {
      icon: Repeat,
      label: "Mean Invoices / Supplier",
      value: sapKpi.meanInvoicesPerSupplier.toFixed(1),
    },

    // Tail-spend optimization KPIs
    {
      icon: Layers,
      label: "Tail Spend Value",
      value: formatINR(kpi.tailSpendValue),
      sub: `${kpi.tailSpendPercentOfValue}% of ₹${(kpi.totalAnnualSpend / 1_00_00_000).toFixed(0)} Cr total spend`,
      badge: tailShareBadge,
    },
    {
      icon: Gauge,
      label: "Tail Share of PO Volume",
      value: `${kpi.tailSpendPercentOfPOs}%`,
      sub: `${formatCompactNumber(kpi.tailPOCount)} of ${formatCompactNumber(kpi.totalPOCount)} POs`,
    },
    {
      icon: Users,
      label: "Tail Suppliers",
      value: formatCompactNumber(kpi.tailSupplierCount),
      sub: `${((kpi.tailSupplierCount / kpi.totalActiveSuppliers) * 100).toFixed(0)}% of ${formatCompactNumber(kpi.totalActiveSuppliers)} active suppliers`,
    },
    {
      icon: PiggyBank,
      label: "Potential Consolidation Savings",
      value: formatINR(kpi.potentialConsolidationSavings),
      sub: "Annualized, via blanket POs & catalogs",
      badge: savingsBadge,
    },
  ];

  return (
    <div className="kpi-ribbon grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80"
        >
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <card.icon className="h-4 w-4 shrink-0" />
            <span className="text-xs font-medium uppercase tracking-wide">
              {card.label}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{card.value}</p>
            {card.badge && <StatusBadge status={card.badge.status} title={card.badge.title} />}
          </div>
          {card.sub && <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{card.sub}</p>}
        </div>
      ))}
    </div>
  );
}
