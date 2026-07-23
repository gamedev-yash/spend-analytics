"use client";

import { usePaymentTerms } from "../provider";
import { computeKpis } from "../selectors";
import { formatDays } from "../constants";

export function KpiRibbon() {
  const { filteredInvoices } = usePaymentTerms();
  const { distinctPaymentTerms, avgPaidDays } = computeKpis(filteredInvoices);

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
      <div className="flex flex-wrap gap-8">
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Payment Terms
          </span>
          <span className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{distinctPaymentTerms}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Average Number of Paid Days
          </span>
          <span className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{formatDays(avgPaidDays)}</span>
        </div>
      </div>
    </div>
  );
}
