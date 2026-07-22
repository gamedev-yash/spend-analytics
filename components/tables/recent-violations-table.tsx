"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RiskBadge } from "@/components/dashboard/risk-badge";
import { formatDate, formatPercent } from "@/lib/format";
import type { RecentViolationRow } from "@/lib/aggregate-compliance";

interface RecentViolationsTableProps {
  data: RecentViolationRow[];
}

export function RecentViolationsTable({ data }: RecentViolationsTableProps) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No violations match the current filters.</p>;
  }

  return (
    <div className="h-full overflow-y-auto rounded-md border">
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow>
          <TableHead>PO</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Supplier</TableHead>
          <TableHead>Business Unit</TableHead>
          <TableHead>Violation</TableHead>
          <TableHead>Risk</TableHead>
          <TableHead className="text-right">Compliance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.transactionId}>
            <TableCell className="font-mono text-xs text-muted-foreground">{row.poId}</TableCell>
            <TableCell className="text-muted-foreground">{formatDate(row.poDate)}</TableCell>
            <TableCell className="font-medium text-foreground">{row.supplierName}</TableCell>
            <TableCell className="text-muted-foreground">{row.businessUnit}</TableCell>
            <TableCell>{row.violationType}</TableCell>
            <TableCell>
              <RiskBadge level={row.riskLevel} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatPercent(row.overallCompliance)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}
