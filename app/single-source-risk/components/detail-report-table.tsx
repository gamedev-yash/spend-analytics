"use client";

import { useMemo, useState } from "react";
import { Table2 } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { cn } from "@/lib/utils";
import { useSingleSourceRisk } from "../provider";
import { aggregateForTable, type TableRow } from "../selectors";
import { formatCurrencyFull } from "../constants";

type SortColumn =
  | "categoryName"
  | "invoiceCount"
  | "plantCount"
  | "supplierCount"
  | "productCount"
  | "spend"
  | "costCenterCount";

type SortDirection = "asc" | "desc";

interface ColumnDef {
  key: SortColumn;
  label: string;
  align: "left" | "right";
}

const COLUMNS: ColumnDef[] = [
  { key: "categoryName", label: "Category Name", align: "left" },
  { key: "invoiceCount", label: "Invoices", align: "right" },
  { key: "plantCount", label: "Plants", align: "right" },
  { key: "supplierCount", label: "Suppliers", align: "right" },
  { key: "productCount", label: "Products", align: "right" },
  { key: "spend", label: "Spend", align: "right" },
  { key: "costCenterCount", label: "Cost Centers", align: "right" },
];

function compareRows(a: TableRow, b: TableRow, column: SortColumn): number {
  switch (column) {
    case "categoryName":
      return a.categoryName.localeCompare(b.categoryName);
    case "invoiceCount":
      return a.invoiceCount - b.invoiceCount;
    case "plantCount":
      return a.plantCount - b.plantCount;
    case "supplierCount":
      return a.supplierCount - b.supplierCount;
    case "productCount":
      return a.productCount - b.productCount;
    case "spend":
      return a.spend - b.spend;
    case "costCenterCount":
      return a.costCenterCount - b.costCenterCount;
    default:
      return 0;
  }
}

export function DetailReportTable() {
  const { scopedInvoices } = useSingleSourceRisk();
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
      setSortDirection(column === "categoryName" ? "asc" : "desc");
    }
  }

  return (
    <ChartCard title="Detailed Report" description="Sortable by any column" icon={<Table2 />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
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
                  No categories match the current filters.
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr
                  key={row.categoryCode}
                  className="border-b border-slate-100 last:border-b-0 dark:border-slate-800/60"
                >
                  <td className="px-4 py-2.5 text-left text-slate-900 dark:text-slate-100">{row.categoryName}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{row.invoiceCount}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{row.plantCount}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{row.supplierCount}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{row.productCount}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{formatCurrencyFull(row.spend)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{row.costCenterCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
