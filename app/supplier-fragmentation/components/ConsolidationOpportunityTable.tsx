"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConsolidationRow } from "../lib/types";
import { useFragmentation } from "./fragmentationStore";

const CRORE = 10_000_000;

type SortKey =
  | "categoryL2"
  | "plantName"
  | "currentSuppliers"
  | "top3"
  | "totalSpendCr"
  | "consolidatedSuppliers"
  | "reductionPct"
  | "estSavingsCr";

interface DisplayRow {
  categoryL2: string;
  plantName: string;
  currentSuppliers: number;
  top3: string;
  totalSpendCr: number;
  consolidatedSuppliers: number;
  reductionPct: number;
  estSavingsCr: number;
  highlight: boolean;
}

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "categoryL2", label: "Category (L2)" },
  { key: "plantName", label: "Business Unit" },
  { key: "currentSuppliers", label: "Suppliers", numeric: true },
  { key: "top3", label: "Top 3 Suppliers (spend %)" },
  { key: "totalSpendCr", label: "Total Spend (₹ Cr)", numeric: true },
  { key: "consolidatedSuppliers", label: "If Parent-Grouped", numeric: true },
  { key: "reductionPct", label: "Reduction %", numeric: true },
  { key: "estSavingsCr", label: "Est. Savings (₹ Cr)", numeric: true },
];

function toDisplayRows(rows: ConsolidationRow[]): DisplayRow[] {
  return rows.map((row) => ({
    categoryL2: row.categoryL2,
    plantName: row.plantName,
    currentSuppliers: row.currentSuppliers,
    top3: row.top3,
    totalSpendCr: Math.round((row.totalSpend / CRORE) * 100) / 100,
    consolidatedSuppliers: row.consolidatedSuppliers,
    reductionPct: row.reductionPct,
    estSavingsCr: Math.round((row.estSavings / CRORE) * 100) / 100,
    highlight: row.highlight,
  }));
}

function exportCsv(rows: DisplayRow[]) {
  const header = COLUMNS.map((c) => `"${c.label}"`).join(",");
  const lines = rows.map((row) =>
    COLUMNS.map((c) => {
      const value = row[c.key];
      return typeof value === "number" ? String(value) : `"${String(value).replaceAll('"', '""')}"`;
    }).join(",")
  );
  const blob = new Blob([`${header}\n${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "consolidation-opportunity.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * View 6 — Consolidation Opportunity table: one row per (L2 category, BU)
 * with current vendor count, top-3 vendors by spend share, the supplier
 * count after parent-group consolidation, and estimated savings. Rows where
 * parent grouping cuts the count by >50% are tinted red. Sortable columns +
 * CSV export of the current sort order.
 */
export function ConsolidationOpportunityTable() {
  const { derived } = useFragmentation();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const baseRows = useMemo(() => toDisplayRows(derived.tableRows), [derived.tableRows]);

  const rows = useMemo(() => {
    if (!sortKey) return baseRows; // store order: highlighted first, then savings desc
    const sorted = [...baseRows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [baseRows, sortKey, sortDir]);

  function onHeaderClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        No data for the current selection
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {rows.length.toLocaleString("en-IN")} category × BU combinations
        </span>
        <button
          type="button"
          onClick={() => exportCsv(rows)}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 dark:bg-slate-800">
              {COLUMNS.map((col) => (
                <th key={col.key} className="border-b border-slate-200 p-0 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => onHeaderClick(col.key)}
                    className={cn(
                      "flex w-full items-center gap-1 px-2.5 py-2 text-[11px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100",
                      col.numeric && "justify-end text-right"
                    )}
                  >
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3 shrink-0" />
                      ) : (
                        <ArrowDown className="h-3 w-3 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 shrink-0 opacity-30" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.categoryL2}|${row.plantName}`}
                className={cn(
                  "border-b border-slate-100 dark:border-slate-800/60",
                  row.highlight
                    ? "bg-red-500/10 dark:bg-red-500/15"
                    : "odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900/40 dark:even:bg-slate-900/70"
                )}
              >
                <td className="px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200">
                  {row.categoryL2}
                </td>
                <td className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300">{row.plantName}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {row.currentSuppliers}
                </td>
                <td className="max-w-[260px] px-2.5 py-1.5 text-slate-500 dark:text-slate-400">
                  {row.top3}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {row.totalSpendCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {row.consolidatedSuppliers}
                </td>
                <td
                  className={cn(
                    "px-2.5 py-1.5 text-right tabular-nums",
                    row.highlight
                      ? "font-semibold text-red-600 dark:text-red-400"
                      : "text-slate-700 dark:text-slate-200"
                  )}
                >
                  {row.reductionPct.toFixed(1)}
                </td>
                <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {row.estSavingsCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
