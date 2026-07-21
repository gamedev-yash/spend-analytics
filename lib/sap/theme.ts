import type { ChartPalette } from "@/lib/chart-colors";

/**
 * Fixed L1 -> color-slot order, shared by every stacked chart (Top Suppliers,
 * Spend Trend, Spend by BU) so a category's color never depends on which
 * chart it's in or how the data happens to be sorted. 13 L1 categories
 * exceed the palette's 7-8 safe-hue ceiling, so the smaller tail categories
 * fold to a neutral "Other" gray in these multi-series contexts (they still
 * get their own full-size slice in the Treemap/Sunburst/Table, where color
 * isn't the identity mechanism).
 */
export const L1_COLOR_ORDER = [
  "Raw Materials",
  "Fuel & Energy",
  "Capital Equipment",
  "Services",
  "MRO & Spares",
  "Chemicals & Reagents",
  "Logistics & Transport",
];

export function colorForL1(l1: string, palette: ChartPalette): string {
  const idx = L1_COLOR_ORDER.indexOf(l1);
  return idx === -1 ? palette.ink.muted : palette.colorForIndex(idx);
}

/** L1s in fixed-order-first, then any remaining (folded-to-"Other" in color, but still labeled) ones alphabetically. */
export function orderL1s(l1s: string[]): string[] {
  const known = L1_COLOR_ORDER.filter((l1) => l1s.includes(l1));
  const rest = l1s.filter((l1) => !L1_COLOR_ORDER.includes(l1)).sort();
  return [...known, ...rest];
}
