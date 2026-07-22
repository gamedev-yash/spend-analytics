"use client";

import { usePaymentTerms } from "../provider";
import { computeKpis } from "../selectors";
import { formatDays } from "../constants";

export function KpiRibbon() {
  const { filteredInvoices } = usePaymentTerms();
  const { distinctPaymentTerms, avgPaidDays } = computeKpis(filteredInvoices);

  return (
    <div className="w-full rounded-xl bg-slate-900 px-6 py-5">
      <div className="flex flex-wrap gap-8">
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Payment Terms
          </span>
          <span className="text-3xl font-semibold text-white">{distinctPaymentTerms}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Average Number of Paid Days
          </span>
          <span className="text-3xl font-semibold text-white">{formatDays(avgPaidDays)}</span>
        </div>
      </div>
    </div>
  );
}
