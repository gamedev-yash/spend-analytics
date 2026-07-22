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
import { formatCr, formatInr, formatPercentInr, formatSignedPercentInr } from "@/lib/sap/format-inr";
import { usePalette } from "@/hooks/use-palette";
import type { MetricsTableRow } from "@/lib/sap/aggregate";

interface MetricsTableProps {
  rows: MetricsTableRow[];
}

type SortKey = keyof Omit<MetricsTableRow, "category">;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "totalSpendInr", label: "Total Spend" },
  { key: "percentOfTotal", label: "% of Total" },
  { key: "supplierCount", label: "Suppliers" },
  { key: "poCount", label: "POs" },
  { key: "avgPoValueInr", label: "Avg PO Value" },
  { key: "yoyChangePercent", label: "YoY Change" },
  { key: "offContractPercent", label: "Off-Contract %" },
];

function toCsv(rows: MetricsTableRow[]): string {
  const header = ["Category", "Total Spend (INR)", "% of Total", "Suppliers", "POs", "Avg PO Value (INR)", "YoY Change %", "Off-Contract %"];
  const lines = rows.map((r) =>
    [r.category, r.totalSpendInr, r.percentOfTotal, r.supplierCount, r.poCount, r.avgPoValueInr, r.yoyChangePercent, r.offContractPercent].join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export function MetricsTable({ rows }: MetricsTableProps) {
  const palette = usePalette();
  const [sortKey, setSortKey] = useState<SortKey>("totalSpendInr");
  const [descending, setDescending] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...rows].sort((a, b) => a[sortKey] - b[sortKey]);
    return descending ? copy.reverse() : copy;
  }, [rows, sortKey, descending]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDescending((d) => !d);
    else {
      setSortKey(key);
      setDescending(true);
    }
  }

  function exportCsv() {
    const blob = new Blob([toCsv(sorted)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spend-overview-metrics.csv";
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
            <TableHead>Category</TableHead>
            {COLUMNS.map((col) => (
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
            <TableRow key={row.category}>
              <TableCell className="font-medium text-foreground">{row.category}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCr(row.totalSpendInr)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPercentInr(row.percentOfTotal)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.supplierCount}</TableCell>
              <TableCell className="text-right tabular-nums">{row.poCount}</TableCell>
              <TableCell className="text-right tabular-nums">{formatInr(row.avgPoValueInr)}</TableCell>
              <TableCell
                className="text-right tabular-nums font-medium"
                style={row.yoyChangePercent > 20 ? { color: palette.status.critical } : undefined}
              >
                {formatSignedPercentInr(row.yoyChangePercent)}
              </TableCell>
              <TableCell
                className="text-right tabular-nums font-medium"
                style={row.offContractPercent > 30 ? { color: palette.status.critical } : undefined}
              >
                {formatPercentInr(row.offContractPercent)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
