"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercent } from "@/lib/format";
import { usePalette } from "@/hooks/use-palette";
import { initials, stableIndex } from "@/lib/utils";
import type { WorstSupplierRow } from "@/lib/aggregate-compliance";

interface WorstSuppliersTableProps {
  data: WorstSupplierRow[];
}

export function WorstSuppliersTable({ data }: WorstSuppliersTableProps) {
  const palette = usePalette();

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No transactions match the current filters.</p>;
  }

  return (
    <div className="h-full overflow-y-auto rounded-md border">
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead className="text-right">Transactions</TableHead>
          <TableHead className="text-right">Violations</TableHead>
          <TableHead className="text-right">Avg. Compliance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.supplierId}>
            <TableCell className="font-medium text-foreground">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: palette.colorForIndex(stableIndex(row.supplierId, 7)) }}
                >
                  {initials(row.supplierName)}
                </span>
                {row.supplierName}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.transactionCount}</TableCell>
            <TableCell className="text-right tabular-nums">{row.violationCount}</TableCell>
            <TableCell className="text-right tabular-nums">
              <span
                className="rounded px-1.5 py-0.5 font-medium"
                style={{
                  color: palette.complianceStatusColor(row.avgOverallCompliance),
                  backgroundColor: `${palette.complianceStatusColor(row.avgOverallCompliance)}14`,
                }}
              >
                {formatPercent(row.avgOverallCompliance)}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}
