"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatUsdCompact, formatPercent } from "@/lib/format";
import { usePalette } from "@/hooks/use-palette";
import { initials, stableIndex } from "@/lib/utils";
import type { TopSupplierRow } from "@/lib/aggregate-summary";

interface TopSuppliersTableProps {
  data: TopSupplierRow[];
}

type SortKey = "totalSpend" | "onTimeDeliveryPercent" | "supplierRating" | "purchaseOrders";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "totalSpend", label: "Total Spend" },
  { key: "purchaseOrders", label: "POs" },
  { key: "onTimeDeliveryPercent", label: "On-Time Delivery" },
  { key: "supplierRating", label: "Rating" },
];

const RANK_MEDAL: Record<number, string> = { 0: "#eda100", 1: "#898781", 2: "#c98032" };

export function TopSuppliersTable({ data }: TopSuppliersTableProps) {
  const palette = usePalette();
  const [sortKey, setSortKey] = useState<SortKey>("totalSpend");
  const [descending, setDescending] = useState(true);

  const sorted = useMemo(() => {
    const rows = [...data].sort((a, b) => a[sortKey] - b[sortKey]);
    return descending ? rows.reverse() : rows;
  }, [data, sortKey, descending]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDescending((d) => !d);
    else {
      setSortKey(key);
      setDescending(true);
    }
  }

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No purchase orders match the current filters.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">#</TableHead>
          <TableHead>Supplier</TableHead>
          {COLUMNS.map((col) => (
            <TableHead key={col.key} className="text-right">
              <button
                type="button"
                onClick={() => toggleSort(col.key)}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                {col.label}
                <ArrowUpDown className="h-3 w-3" />
              </button>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row, index) => {
          const avatarColor = palette.colorForIndex(stableIndex(row.supplierId, 7));
          return (
            <TableRow key={row.supplierId}>
              <TableCell className="tabular-nums text-muted-foreground">
                {RANK_MEDAL[index] ? (
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: RANK_MEDAL[index] }}
                  >
                    {index + 1}
                  </span>
                ) : (
                  index + 1
                )}
              </TableCell>
              <TableCell className="font-medium text-foreground">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {initials(row.supplierName)}
                  </span>
                  {row.supplierName}
                  {row.preferredSupplier && (
                    <Badge variant="secondary" className="text-[10px]">
                      Preferred
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatUsdCompact(row.totalSpend)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.purchaseOrders}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPercent(row.onTimeDeliveryPercent)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.supplierRating.toFixed(2)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
