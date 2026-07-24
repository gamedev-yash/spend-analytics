"use client";

// Chart color tokens for the Tail Spend Dashboard, derived from the app's
// shared palette (lib/chart-colors.ts via usePalette()) so this dashboard's
// charts track the rest of the app's light/dark theming instead of a second,
// dark-only palette.
import { usePalette } from "@/hooks/use-palette";
import type { ChartPalette } from "@/lib/chart-colors";
import type { SpendSegment } from "./tailSpendMock";

// SAP Spend Control Tower ribbon — fixed SAP-brand navy chrome, not a
// data-encoding color. Intentionally the same in both themes (like a fixed
// brand header bar), independent of the rest of the page's theming.
export const SAP_NAVY = "#0a1f44";
export const SAP_NAVY_BORDER = "#16305e";

export const CHART_MARGIN = { top: 8, right: 16, bottom: 8, left: 8 };

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Linear-interpolated hex ramp from `darkest` to `lightest` — for ordinal (order-carries-meaning) buckets. */
function buildRamp(darkest: string, lightest: string, steps: number): string[] {
  const [r1, g1, b1] = hexToRgb(darkest);
  const [r2, g2, b2] = hexToRgb(lightest);
  return Array.from({ length: steps }, (_, i) => {
    const t = steps === 1 ? 0 : i / (steps - 1);
    return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
  });
}

export interface TailSpendTheme {
  /** Matches the card background — used as the stroke separator between pie/donut slices. */
  chartSurface: string;
  gridline: string;
  axisLine: string;
  textMuted: string;
  textPrimary: string;
  tooltipCursorFill: string;
  /** Strategic / Core / Tail — stable mapping, exact hex tracks the current theme's categorical palette. */
  segmentColor: Record<SpendSegment, string>;
  statusColor: ChartPalette["status"];
  actionColor: Record<string, string>;
  paretoBarColor: string;
  paretoLineColor: string;
  /** 7-step ordinal ramp for the SAP invoice-value buckets, darkest = smallest bucket. */
  invoiceBucketRamp: string[];
  /** 6-step ordinal ramp for the micro-PO value buckets, same convention. */
  microPoRamp: string[];
}

/** Derives every Tail Spend chart color token from the current light/dark theme. */
export function useTailSpendTheme(): TailSpendTheme {
  const palette = usePalette();

  const segmentColor: Record<SpendSegment, string> = {
    Strategic: palette.categorical.green,
    Core: palette.categorical.blue,
    Tail: palette.categorical.orange,
  };

  return {
    chartSurface: palette.ink.surface,
    gridline: palette.ink.grid,
    axisLine: palette.ink.baseline,
    textMuted: palette.ink.muted,
    textPrimary: palette.ink.primary,
    tooltipCursorFill: palette.isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)",
    segmentColor,
    statusColor: palette.status,
    actionColor: {
      Consolidate: palette.status.critical,
      Contract: palette.status.warning,
      Monitor: palette.status.good,
    },
    paretoBarColor: palette.categorical.blue,
    paretoLineColor: palette.categorical.orange,
    invoiceBucketRamp: buildRamp(palette.isDark ? "#0f3a73" : "#123d78", palette.isDark ? "#cde2fb" : "#8ec2ee", 7),
    microPoRamp: buildRamp(palette.isDark ? "#184f95" : "#1d5a9e", palette.isDark ? "#cde2fb" : "#8ec2ee", 6),
  };
}
