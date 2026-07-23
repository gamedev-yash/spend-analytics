"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePaymentTerms } from "../provider";
import { aggregateForTable, type TableRow } from "../selectors";
import { formatCurrencyFull, formatDays } from "../constants";

type SortColumn =
  | "globalUltimateName"
  | "paymentTermCount"
  | "categoryCount"
  | "plantCount"
  | "avgPaidDays"
  | "spend";

type SortDirection = "asc" | "desc";

interface ColumnDef {
  key: SortColumn;
  label: string;
  align: "left" | "right";
}

const COLUMNS: ColumnDef[] = [
  { key: "globalUltimateName", label: "Supplier (Global Ultimate) Name", align: "left" },
  { key: "paymentTermCount", label: "Payment Terms", align: "right" },
  { key: "categoryCount", label: "Categories", align: "right" },
  { key: "plantCount", label: "Plants", align: "right" },
  { key: "avgPaidDays", label: "Average Number of Paid Days", align: "right" },
  { key: "spend", label: "Spend", align: "right" },
];

function compareRows(a: TableRow, b: TableRow, column: SortColumn): number {
  switch (column) {
    case "globalUltimateName":
      return a.globalUltimateName.localeCompare(b.globalUltimateName);
    case "paymentTermCount":
      return a.paymentTermCount - b.paymentTermCount;
    case "categoryCount":
      return a.categoryCount - b.categoryCount;
    case "plantCount":
      return a.plantCount - b.plantCount;
    case "avgPaidDays": {
      const av = a.avgPaidDays ?? -Infinity;
      const bv = b.avgPaidDays ?? -Infinity;
      return av - bv;
    }
    case "spend":
      return a.spend - b.spend;
    default:
      return 0;
  }
}

export function DetailReportTable() {
  const { scopedInvoices } = usePaymentTerms();
  const rows = useMemo(() => aggregateForTable(scopedInvoices), [scopedInvoices]);

  const [sortColumn, setSortColumn] = useState<SortColumn>("spend");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = compareRows(a, b, sortColumn);
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortColumn, sortDirection]);

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "globalUltimateName" ? "asc" : "desc");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detail Report</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                {COLUMNS.map((col) => {
                  const isActive = col.key === sortColumn;
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={cn(
                        "cursor-pointer select-none px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200",
                        col.align === "right" ? "text-right" : "text-left"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          col.align === "right" && "flex-row-reverse"
                        )}
                      >
                        {col.label}
                        <span className="text-slate-400 dark:text-slate-500">
                          {isActive ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                    No suppliers match the current filters.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr
                    key={row.globalUltimateId}
                    className="border-b border-slate-100 last:border-b-0 dark:border-slate-800/60"
                  >
                    <td className="px-4 py-2.5 text-left text-slate-900 dark:text-slate-100">{row.globalUltimateName}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{row.paymentTermCount}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{row.categoryCount}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{row.plantCount}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{formatDays(row.avgPaidDays)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{formatCurrencyFull(row.spend)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
