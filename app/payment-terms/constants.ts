"use client";

import { usePalette } from "@/hooks/use-palette";

/** Sentinel key for "(No Value)" rows — null category / null payment term. */
export const NO_VALUE_KEY = "__NO_VALUE__";
export const NO_VALUE_LABEL = "(No Value)";

export interface PaymentTermsChartColors {
  categoryBar: string;
  supplierBar: string;
  termSpendBar: string;
  termAvgDaysLine: string;
  invoiceCountBar: string;
  noValue: string;
  highlightStroke: string;
  dimmedOpacity: number;
}

/**
 * Series colors for the Payment Terms charts, drawn from the shared
 * categorical palette (lib/chart-colors.ts) instead of one-off hex per
 * widget — same blue/aqua/violet/orange/magenta hues used everywhere else,
 * and correctly light/dark aware.
 */
export function usePaymentTermsChartColors(): PaymentTermsChartColors {
  const palette = usePalette();
  return {
    categoryBar: palette.categorical.blue,
    supplierBar: palette.categorical.aqua,
    termSpendBar: palette.categorical.violet,
    termAvgDaysLine: palette.categorical.orange,
    invoiceCountBar: palette.categorical.magenta,
    noValue: palette.ink.muted,
    // Selection ring around the linked-analysis-highlighted bar — needs to
    // invert with theme to stay visible against either surface.
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

export function formatDays(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} days`;
}
