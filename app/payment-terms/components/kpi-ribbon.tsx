"use client";

import { usePaymentTerms } from "../provider";
import { computeKpis } from "../selectors";
import { formatDays } from "../constants";
import { useThresholds } from "@/context/ThresholdsContext";
import { thresholdEvaluationTitle } from "@/lib/threshold-format";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ThresholdStatus } from "@/types/thresholds";

interface RibbonStat {
  label: string;
  value: string;
  badge?: { status: ThresholdStatus; title: string } | null;
}

export function KpiRibbon() {
  const { filteredInvoices } = usePaymentTerms();
  const { distinctPaymentTerms, avgPaidDays } = computeKpis(filteredInvoices);
  const { getThreshold, evaluate } = useThresholds();

  const badgeFor = (id: string, value: number | null): RibbonStat["badge"] => {
    if (value === null) return null;
    const config = getThreshold(id);
    const status = evaluate(id, value);
    if (!config || !status) return null;
    return { status, title: thresholdEvaluationTitle(value, config) };
  };

  const stats: RibbonStat[] = [
    {
      label: "Payment Terms",
      value: String(distinctPaymentTerms),
    },
    {
      label: "Average Number of Paid Days",
      value: formatDays(avgPaidDays),
      badge: badgeFor("payment-terms.avg-paid-days", avgPaidDays),
    },
  ];

  return (
    <div className="kpi-ribbon w-full rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
      <div className="flex flex-wrap gap-8">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {stat.label}
            </span>
            <span className="flex flex-wrap items-center gap-2.5">
              <span className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{stat.value}</span>
              {stat.badge && <StatusBadge status={stat.badge.status} title={stat.badge.title} />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
