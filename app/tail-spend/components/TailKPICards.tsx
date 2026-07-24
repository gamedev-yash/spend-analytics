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
}

export function TailKPICards({ kpi, microStats, threshold }: TailKPICardsProps) {
  const microPOPercent = (microStats.poCount / kpi.totalPOCount) * 100;
  const costToValueRatio = (microStats.processingCost / Math.max(microStats.totalValue, 1)) * 100;
  const singleUsePercentOfTail = (kpi.singleUseSupplierCount / kpi.tailSupplierCount) * 100;

  const cards: KPICardDef[] = [
    {
      icon: Layers,
      label: "Tail Spend Value",
      value: formatINR(kpi.tailSpendValue),
      sub: `${kpi.tailSpendPercentOfValue}% of ₹${(kpi.totalAnnualSpend / 1_00_00_000).toFixed(0)} Cr total spend`,
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
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">{card.value}</p>
          <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
