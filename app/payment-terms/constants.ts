/** Sentinel key for "(No Value)" rows — null category / null payment term. */
export const NO_VALUE_KEY = "__NO_VALUE__";
export const NO_VALUE_LABEL = "(No Value)";

/**
 * Approximated SAP Fiori/Horizon palette for this dashboard: one accent per
 * widget, a shared grey for "(No Value)" bars, and a highlight for the
 * actively-selected bar during linked analysis.
 */
export const CHART_COLORS = {
  categoryBar: "#0B6BB5", // blue
  supplierBar: "#0F828C", // teal
  termSpendBar: "#6B4E9E", // purple
  termAvgDaysLine: "#E9730C", // amber
  invoiceCountBar: "#B3467C", // magenta
  noValue: "#94A3B8", // slate-400
  highlightStroke: "#0F172A", // slate-900
  dimmedOpacity: 0.35,
} as const;

export const HEADER_DARK_BG = "#0F172A"; // slate-900, matches existing shell dark accents

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

export function formatMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}
