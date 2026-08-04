"use client";

import { Flame, Gauge, Layers, PiggyBank, Users, type LucideIcon } from "lucide-react";
import { formatInr } from "@/lib/sap/format-inr";
import { useFragmentation } from "./fragmentationStore";

interface KpiCardDef {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  accentClass: string;
}

function formatInt(value: number): string {
  return Math.round(value).toLocaleString("en-IN");
}

/** The five KPI cards, recomputed from the store on every filter change. */
export function FragmentationKpis() {
  const { derived } = useFragmentation();
  const k = derived.kpiSet;

  const cards: KpiCardDef[] = [
    {
      icon: Users,
      label: "Total Active Suppliers",
      value: formatInt(k.totalSuppliers),
      sub: "in current selection",
      accentClass: "text-blue-600 dark:text-blue-400",
    },
    {
      icon: Layers,
      label: "Avg Suppliers / Category",
      value: k.avgSuppliers.toFixed(1),
      sub: "across categories",
      accentClass: "text-teal-600 dark:text-teal-400",
    },
    {
      icon: Flame,
      label: "Most Fragmented Category",
      value: k.mostFragName,
      sub: k.mostFragCount ? `${k.mostFragCount} suppliers` : "—",
      accentClass: "text-red-600 dark:text-red-400",
    },
    {
      icon: Gauge,
      label: "Fragmentation Index",
      value: k.fragIndex.toFixed(0),
      sub: "0 = concentrated · 100 = fragmented",
      accentClass: "text-amber-600 dark:text-amber-400",
    },
    {
      icon: PiggyBank,
      label: "Consolidation Opportunity",
      value: formatInr(k.consolidationValue, 2),
      sub: `across ${k.consolidationCats} over-fragmented categories`,
      accentClass: "text-violet-600 dark:text-violet-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80"
        >
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <card.icon className={`h-4 w-4 shrink-0 ${card.accentClass}`} />
            <span className="truncate text-xs font-medium uppercase tracking-wide">{card.label}</span>
          </div>
          <p
            className="mt-2 truncate text-2xl font-semibold text-slate-900 dark:text-slate-50"
            title={card.value}
          >
            {card.value}
          </p>
          <p className="mt-1 truncate text-xs leading-snug text-slate-500 dark:text-slate-400">
            {card.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
