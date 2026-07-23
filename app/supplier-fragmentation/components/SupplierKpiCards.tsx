"use client";

import { Copy, Layers, Target, UserPlus, Users, UserX, type LucideIcon } from "lucide-react";
import type { SupplierFragmentationData } from "../supplierMock";

interface SupplierKpiCardsProps {
  data: SupplierFragmentationData;
}

interface KpiDef {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
}

export function SupplierKpiCards({ data }: SupplierKpiCardsProps) {
  const singleUsePercent = Math.round((data.singleUseSupplierCount / data.totalActiveSuppliers) * 100);

  const cards: KpiDef[] = [
    {
      icon: Users,
      label: "Active Suppliers",
      value: data.totalActiveSuppliers.toLocaleString("en-IN"),
      sub: "Across all categories and plants",
    },
    {
      icon: UserX,
      label: "Single-Use Suppliers",
      value: data.singleUseSupplierCount.toLocaleString("en-IN"),
      sub: `${singleUsePercent}% of the active base`,
    },
    {
      icon: Target,
      label: "Top-10 Concentration",
      value: `${data.top10ConcentrationPercent}%`,
      sub: "Share of spend with top 10 suppliers",
    },
    {
      icon: Layers,
      label: "Avg. Suppliers per Category",
      value: data.avgSuppliersPerCategory.toLocaleString("en-IN"),
      sub: "Signals category-level fragmentation",
    },
    {
      icon: Copy,
      label: "Potential Duplicate Pairs",
      value: data.duplicatePairCount.toLocaleString("en-IN"),
      sub: "Name-similarity matches to review",
    },
    {
      icon: UserPlus,
      label: "New Suppliers (12M)",
      value: data.newSuppliersLast12M.toLocaleString("en-IN"),
      sub: "Onboarded in the trailing year",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80"
        >
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <card.icon className="h-4 w-4 shrink-0" />
            <span className="text-xs font-medium uppercase tracking-wide">{card.label}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">{card.value}</p>
          <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
