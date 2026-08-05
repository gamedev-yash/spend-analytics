"use client";

import { cn } from "@/lib/utils";
import { formatCrINR, type DuplicateAction, type DuplicateSupplierPair } from "../supplierMock";

interface DuplicateSupplierTableProps {
  pairs: DuplicateSupplierPair[];
}

const ACTION_STYLE: Record<DuplicateAction, string> = {
  Merge: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  Review: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Monitor: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
};

/** Candidate duplicate supplier records ranked by name-similarity, for master-data cleanup. */
export function DuplicateSupplierTable({ pairs }: DuplicateSupplierTableProps) {
  const sorted = [...pairs].sort((a, b) => b.similarityPercent - a.similarityPercent);

  return (
    <div className="overflow-x-auto">
      <table className="fullscreen-natural-table w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <th className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-200">Primary Supplier</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-200">Possible Duplicate</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-200">Category</th>
            <th className="px-4 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200">Combined Spend</th>
            <th className="px-4 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200">Invoices</th>
            <th className="px-4 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200">Similarity</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-200">Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((pair) => (
            <tr
              key={`${pair.primaryName}-${pair.duplicateName}`}
              className="border-b border-slate-100 last:border-b-0 dark:border-slate-800/60"
            >
              <td className="px-4 py-2.5 text-left text-slate-900 dark:text-slate-100">{pair.primaryName}</td>
              <td className="px-4 py-2.5 text-left text-slate-700 dark:text-slate-300">{pair.duplicateName}</td>
              <td className="px-4 py-2.5 text-left text-slate-500 dark:text-slate-400">{pair.category}</td>
              <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">
                {formatCrINR(pair.combinedSpendCr)}
              </td>
              <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{pair.invoiceCount}</td>
              <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{pair.similarityPercent}%</td>
              <td className="px-4 py-2.5 text-left">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                    ACTION_STYLE[pair.action]
                  )}
                >
                  {pair.action}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
