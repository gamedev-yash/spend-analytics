"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/sap/format-inr";

/** Base row shape every "Detailed Report" table shares — see the SAP Spend Control Tower widget of the same name. */
export interface SupplierDetailReportRow {
  key: string;
  supplierName: string;
  invoices: number;
  plants: number;
  categories: number;
  /** null when not tracked at this transaction grain in the current dataset. */
  products: number | null;
}

export interface DetailReportValueColumn<T> {
  key: string;
  label: string;
  value: (row: T) => number;
}

interface SupplierDetailReportTableProps<T extends SupplierDetailReportRow> {
  rows: T[];
  /** One or more spend-like columns after Products — e.g. just "Spend", or "Unmanaged Spend" + "Total Spend". */
  valueColumns: DetailReportValueColumn<T>[];
  csvFilename: string;
}

const BASE_COLUMNS: { key: "invoices" | "plants" | "categories"; label: string }[] = [
  { key: "invoices", label: "Invoices" },
  { key: "plants", label: "Plants" },
  { key: "categories", label: "Categories" },
];

/**
 * Supplier (Global Ultimate)-grain drill-down table — the SAP Spend Control
 * Tower "Detailed Report" widget every dashboard tab ends on. Sortable by any
 * column, CSV-exportable, generic over however many spend-like value columns
 * a given page needs (Summary has one "Spend"; Compliance has two).
 */
export function SupplierDetailReportTable<T extends SupplierDetailReportRow>({
  rows,
  valueColumns,
  csvFilename,
}: SupplierDetailReportTableProps<T>) {
  type SortKey = "invoices" | "plants" | "categories" | "products" | string;
  const [sortKey, setSortKey] = useState<SortKey>(valueColumns[0]?.key ?? "invoices");
  const [descending, setDescending] = useState(true);

  function sortValue(row: T, key: SortKey): number {
    if (key === "invoices") return row.invoices;
    if (key === "plants") return row.plants;
    if (key === "categories") return row.categories;
    if (key === "products") return row.products ?? -1;
    return valueColumns.find((c) => c.key === key)?.value(row) ?? 0;
  }

  const sorted = useMemo(() => {
    const copy = [...rows].sort((a, b) => sortValue(a, sortKey) - sortValue(b, sortKey));
    return descending ? copy.reverse() : copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, descending, valueColumns]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDescending((d) => !d);
    else {
      setSortKey(key);
      setDescending(true);
    }
  }

  function exportCsv() {
    const header = [
      "Supplier (Global Ultimate) Name",
      "Invoices",
      "Plants",
      "Categories",
      "Products",
      ...valueColumns.map((c) => c.label),
    ];
    const lines = sorted.map((r) =>
      [
        `"${r.supplierName.replace(/"/g, '""')}"`,
        r.invoices,
        r.plants,
        r.categories,
        r.products ?? "",
        ...valueColumns.map((c) => c.value(r)),
      ].join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csvFilename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 justify-end">
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Supplier (Global Ultimate) Name</TableHead>
              {BASE_COLUMNS.map((col) => (
                <TableHead key={col.key} className="text-right">
                  <button type="button" onClick={() => toggleSort(col.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {col.label}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
              ))}
              <TableHead className="text-right">
                <button type="button" onClick={() => toggleSort("products")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Products
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              {valueColumns.map((col) => (
                <TableHead key={col.key} className="text-right">
                  <button type="button" onClick={() => toggleSort(col.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {col.label}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="max-w-[220px] truncate font-medium text-foreground" title={row.supplierName}>
                  {row.supplierName}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.invoices.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{row.plants.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{row.categories.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground" title={row.products === null ? "Not tracked in this dataset" : undefined}>
                  {row.products === null ? "–" : row.products.toLocaleString()}
                </TableCell>
                {valueColumns.map((col) => (
                  <TableCell key={col.key} className="text-right tabular-nums">
                    {formatInr(col.value(row))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
