"use client";

import { usePalette } from "@/hooks/use-palette";
import type { SupplierCountThreshold } from "./types";

export interface SingleSourceRiskChartColors {
  productBar: string;
  plantBar: string;
  supplierBar: string;
  /** Category-risk widget: colored by the category's own distinct-supplier count, not by identity. */
  categoryBySupplierCount: Record<SupplierCountThreshold, string>;
  highlightStroke: string;
  dimmedOpacity: number;
}

/**
 * Series colors for the Single Source Risk charts. Three widgets group by a
 * single identity dimension (product / plant / supplier) and get one fixed
 * categorical slot each, like every other dashboard. The categories widget
 * is different: every bar shown there is already "at risk" (supplier count
 * <= the selected threshold), so identity color would be uninformative —
 * instead each bar is colored by its OWN supplier count using the reserved
 * status palette (1 supplier = most severe), which is the actually
 * meaningful distinction once the threshold is loosened to <=2 or <=3.
 */
export function useSingleSourceRiskChartColors(): SingleSourceRiskChartColors {
  const palette = usePalette();
  return {
    productBar: palette.categorical.blue,
    plantBar: palette.categorical.aqua,
    supplierBar: palette.categorical.violet,
    categoryBySupplierCount: {
      1: palette.status.critical,
      2: palette.status.serious,
      3: palette.status.warning,
    },
    highlightStroke: palette.ink.primary,
    dimmedOpacity: 0.35,
  };
}

export function formatCurrencyCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function truncateLabel(label: string, maxChars: number): string {
  return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
}
