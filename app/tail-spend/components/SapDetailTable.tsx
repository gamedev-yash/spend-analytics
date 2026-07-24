"use client";

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { SapSupplierReportRow } from "../tailSpendMock";
import { formatINRFull } from "../tailSpendMock";

interface SapDetailTableProps {
  rows: SapSupplierReportRow[];
}

type SortKey = keyof Pick<
  SapSupplierReportRow,
  "supplierName" | "invoiceCount" | "plantCount" | "categoryCount" | "productCount" | "costCenterCount" | "spend"
>;

const COLUMNS: Array<{ key: SortKey; label: string; align: "left" | "right" }> = [
  { key: "supplierName", label: "Supplier (Global Ultimate) Name", align: "left" },
  { key: "invoiceCount", label: "Invoices", align: "right" },
  { key: "plantCount", label: "Plants", align: "right" },
  { key: "categoryCount", label: "Categories", align: "right" },
  { key: "productCount", label: "Products", align: "right" },
  { key: "costCenterCount", label: "Cost Centers", align: "right" },
  { key: "spend", label: "Spend", align: "right" },
];

/**
 * SAP standard detailed report table — full-width, directly below the 2x2
 * widget grid. Sortable by any column, defaults to spend descending.
 */
export function SapDetailTable({ rows }: SapDetailTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/60">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
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
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No suppliers match these filters.
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={row.supplierId}
                className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">{row.supplierName}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{row.invoiceCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{row.plantCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{row.categoryCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{row.productCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{row.costCenterCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                  {formatINRFull(row.spend)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
