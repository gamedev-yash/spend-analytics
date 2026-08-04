"use client";

// Chart color tokens for the Supplier Fragmentation dashboard, derived from
// the app's shared palette (lib/chart-colors.ts via usePalette()) so the
// views track light/dark theming instead of the prototype's dark-only hexes.
import { usePalette } from "@/hooks/use-palette";

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function lerpHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

type Stop = [number, string];

/** Piecewise-linear color ramp over [0,1] stops (Plotly-colorscale style). */
function rampColor(stops: Stop[], t: number): string {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    const [x0, c0] = stops[i - 1];
    const [x1, c1] = stops[i];
    if (x <= x1) return lerpHex(c0, c1, x1 === x0 ? 0 : (x - x0) / (x1 - x0));
  }
  return stops[stops.length - 1][1];
}

/** Perceived luminance 0–255 — picks readable text on a ramp cell. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Heatmap ramp (low → high supplier count). The dark stops are the
// prototype's HEAT_SCALE; the light stops are the same hue walk re-tuned for
// a white card so low cells stay subtle instead of swampy dark green.
const HEAT_DARK: Stop[] = [
  [0.0, "#12321f"],
  [0.25, "#1a5c33"],
  [0.45, "#8a8f2a"],
  [0.65, "#d9822b"],
  [0.85, "#c0341d"],
  [1.0, "#7a1010"],
];
const HEAT_LIGHT: Stop[] = [
  [0.0, "#e7f3ea"],
  [0.25, "#a9d5b1"],
  [0.45, "#e5d36b"],
  [0.65, "#f0a04a"],
  [0.85, "#d94f2b"],
  [1.0, "#8e1414"],
];

export interface FragTheme {
  isDark: boolean;
  /** Healthy / concentrated. */
  good: string;
  /** Moderate. */
  warn: string;
  /** Fragmented / risk. */
  bad: string;
  /** Primary brand blue (median line, trend right axis, BU nodes). */
  accent: string;
  /** Supplier nodes in the Sankey. */
  teal: string;
  grid: string;
  axis: string;
  textMuted: string;
  textPrimary: string;
  surface: string;
  /** t in [0,1] → heatmap cell color (share of the max supplier count). */
  heatColor: (t: number) => string;
  /** t in [0,1] → fragmentation-score color (green → amber → red). */
  fragColor: (t: number) => string;
}

export function useFragTheme(): FragTheme {
  const palette = usePalette();
  const heatStops = palette.isDark ? HEAT_DARK : HEAT_LIGHT;
  const fragStops: Stop[] = [
    [0.0, palette.status.good],
    [0.5, palette.status.warning],
    [1.0, palette.status.critical],
  ];

  return {
    isDark: palette.isDark,
    good: palette.status.good,
    warn: palette.status.warning,
    bad: palette.status.critical,
    accent: palette.categorical.blue,
    teal: palette.categorical.aqua,
    grid: palette.ink.grid,
    axis: palette.ink.baseline,
    textMuted: palette.ink.muted,
    textPrimary: palette.ink.primary,
    surface: palette.ink.surface,
    heatColor: (t) => rampColor(heatStops, t),
    fragColor: (t) => rampColor(fragStops, t),
  };
}
