"use client";

import {
  Layers,
  PackageX,
  Receipt,
  Gauge,
  Users,
  UserX,
  Calculator,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";
import type { KPISummary } from "../tailSpendMock";
import { formatINR, formatCompactNumber } from "../tailSpendMock";
import { useThresholds } from "@/context/ThresholdsContext";
import { thresholdEvaluationTitle } from "@/lib/threshold-format";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ThresholdStatus } from "@/types/thresholds";

interface MicroPOStats {
  poCount: number;
  totalValue: number;
  processingCost: number;
}

interface TailKPICardsProps {
  kpi: KPISummary;
  microStats: MicroPOStats;
  threshold: number;
}

interface KPICardDef {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
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

export function TailKPICards({ kpi, microStats, threshold }: TailKPICardsProps) {
  const microPOPercent = (microStats.poCount / kpi.totalPOCount) * 100;
  const costToValueRatio = (microStats.processingCost / Math.max(microStats.totalValue, 1)) * 100;
  const singleUsePercentOfTail = (kpi.singleUseSupplierCount / kpi.tailSupplierCount) * 100;

  const tailShareBadge = useThresholdBadge("tail-spend.tail-share", kpi.tailSpendPercentOfValue);
  const savingsBadge = useThresholdBadge("tail-spend.savings-target", kpi.potentialConsolidationSavings);

  const cards: KPICardDef[] = [
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
      icon: PackageX,
      label: `Micro-POs (< ${formatINR(threshold)})`,
      value: formatCompactNumber(microStats.poCount),
      sub: `${microPOPercent.toFixed(1)}% of total PO volume`,
    },
    {
      icon: Receipt,
      label: "Micro-PO Processing Cost",
      value: formatINR(microStats.processingCost),
      sub: `${costToValueRatio.toFixed(0)}% of the ${formatINR(microStats.totalValue)} value they carry`,
    },
    {
      icon: Users,
      label: "Tail Suppliers",
      value: formatCompactNumber(kpi.tailSupplierCount),
      sub: `${((kpi.tailSupplierCount / kpi.totalActiveSuppliers) * 100).toFixed(0)}% of ${formatCompactNumber(kpi.totalActiveSuppliers)} active suppliers`,
    },
    {
      icon: UserX,
      label: "Single/Low-Use Suppliers",
      value: formatCompactNumber(kpi.singleUseSupplierCount),
      sub: `${singleUsePercentOfTail.toFixed(0)}% of tail suppliers`,
    },
    {
      icon: Calculator,
      label: "Avg. PO Processing Cost",
      value: formatINR(kpi.avgPOProcessingCost),
      sub: "SAP ECC administrative overhead assumption",
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
