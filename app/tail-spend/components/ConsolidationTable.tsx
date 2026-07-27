"use client";

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, Download } from "lucide-react";
import type { ConsolidationCandidate, ConsolidationAction } from "../tailSpendMock";
import { formatINRFull, formatINR } from "../tailSpendMock";
import { useTailSpendTheme } from "../theme";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ThresholdStatus } from "@/types/thresholds";

interface ConsolidationTableProps {
  candidates: ConsolidationCandidate[];
}

type SortKey = keyof Pick<
  ConsolidationCandidate,
  "supplierName" | "category" | "poCount" | "microPOCount" | "totalSpend" | "avgPOValue" | "processingCost" | "potentialSavings" | "consolidationScore"
>;

const COLUMNS: Array<{ key: SortKey; label: string; align: "left" | "right" }> = [
  { key: "supplierName", label: "Supplier", align: "left" },
  { key: "category", label: "Category", align: "left" },
  { key: "poCount", label: "PO Count", align: "right" },
  { key: "microPOCount", label: "Micro-POs", align: "right" },
  { key: "totalSpend", label: "Total Spend", align: "right" },
  { key: "avgPOValue", label: "Avg PO Value", align: "right" },
  { key: "processingCost", label: "Processing Cost", align: "right" },
  { key: "potentialSavings", label: "Potential Savings", align: "right" },
  { key: "consolidationScore", label: "Score", align: "right" },
];

/** Risk-level pill per recommended action: urgent = rose, review = amber, fine = green. */
const ACTION_STATUS: Record<ConsolidationAction, ThresholdStatus> = {
  Consolidate: "danger",
  Contract: "warning",
  Monitor: "success",
};

function toCsv(rows: ConsolidationCandidate[]): string {
  const header = [
    "Supplier",
    "Category",
    "PO Count",
    "Micro-POs",
    "Total Spend",
    "Avg PO Value",
    "Processing Cost",
    "Potential Savings",
    "Consolidation Score",
    "Recommended Action",
  ];
  const lines = rows.map((r) =>
    [
      r.supplierName,
      r.category,
      r.poCount,
      r.microPOCount,
      r.totalSpend,
      r.avgPOValue,
      r.processingCost,
      r.potentialSavings,
      r.consolidationScore,
      r.recommendedAction,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

function downloadCsv(rows: ConsolidationCandidate[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tail-spend-consolidation-candidates.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Sortable consolidation candidate list. Sorting and export both act on the
 * already-filtered set the page hands down, so the CSV always matches what's
 * on screen.
 */
export function ConsolidationTable({ candidates }: ConsolidationTableProps) {
  const theme = useTailSpendTheme();
  const [sortKey, setSortKey] = useState<SortKey>("potentialSavings");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...candidates];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [candidates, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {candidates.length} tail supplier{candidates.length === 1 ? "" : "s"} ranked by consolidation opportunity
        </p>
        <button
          type="button"
          onClick={() => downloadCsv(sorted)}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  aria-sort={
                    sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                  }
                  className={`px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 ${
                      col.align === "right" ? "flex-row-reverse" : ""
                    }`}
                  >
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-slate-400 dark:text-slate-600" />
                    )}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No suppliers match these filters.
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
              return (
                <tr
                  key={row.supplierId}
                  className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">{row.supplierName}</td>
                  <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{row.category}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{row.poCount}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{row.microPOCount}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatINRFull(row.totalSpend)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatINRFull(row.avgPOValue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatINR(row.processingCost)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                    {formatINR(row.potentialSavings)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="tabular-nums text-slate-700 dark:text-slate-300">{row.consolidationScore}</span>
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${row.consolidationScore}%`,
                            backgroundColor: theme.actionColor[row.recommendedAction],
                          }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      status={ACTION_STATUS[row.recommendedAction]}
                      label={row.recommendedAction}
                      title={`Score ${row.consolidationScore} — recommended action: ${row.recommendedAction}`}
                    />
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
