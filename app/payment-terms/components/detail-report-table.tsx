"use client";

import { useMemo, useState } from "react";
import { Download, Table2 } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Button } from "@/components/ui/button";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { usePagination } from "@/hooks/use-pagination";
import { useIsExportCapturing } from "@/context/ExportCaptureContext";
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
  { key: "globalUltimateName", label: "Supplier Name", align: "left" },
  { key: "paymentTermCount", label: "Payment Terms", align: "right" },
  { key: "categoryCount", label: "Categories", align: "right" },
  { key: "plantCount", label: "Plants", align: "right" },
  { key: "avgPaidDays", label: "Average Number of Paid Days", align: "right" },
  { key: "spend", label: "Spend", align: "right" },
];

function exportCsv(rows: TableRow[]) {
  const header = ["Supplier Name", "Payment Terms", "Categories", "Plants", "Average Number of Paid Days", "Spend"];
  const lines = rows.map((r) =>
    [
      `"${r.globalUltimateName.replace(/"/g, '""')}"`,
      r.paymentTermCount,
      r.categoryCount,
      r.plantCount,
      r.avgPaidDays ?? "",
      r.spend,
    ].join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "payment-terms-detail-report.csv";
  a.click();
  URL.revokeObjectURL(url);
}

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

  const isCapturing = useIsExportCapturing();
  const pagination = usePagination(sortedRows, isCapturing ? Math.max(sortedRows.length, 1) : 10);

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "globalUltimateName" ? "asc" : "desc");
    }
  }

  return (
    <ChartCard title="Detail Report" description="Sortable by any column" icon={<Table2 />}>
      <div className="flex h-full flex-col gap-2">
        <div className="flex shrink-0 justify-end">
          <Button size="sm" variant="outline" onClick={() => exportCsv(sortedRows)}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="fullscreen-natural-table w-full min-w-[720px] text-sm">
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
                pagination.pageItems.map((row) => (
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
        <PaginationFooter
          page={pagination.page}
          pageCount={pagination.pageCount}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          totalCount={pagination.totalCount}
          onPrevious={pagination.goToPrevious}
          onNext={pagination.goToNext}
          hasPrevious={pagination.hasPrevious}
          hasNext={pagination.hasNext}
          itemLabel="suppliers"
        />
      </div>
    </ChartCard>
  );
}
