/**
 * Fixed-order categorical palette + reserved status palette, light and dark.
 * Validated for CVD-safe adjacent contrast — see the dataviz skill's
 * references/palette.md. Slots are assigned by fixed order, never cycled
 * or re-ranked on filter change. Dark values are the same eight hues
 * stepped for the dark surface, not a separate palette.
 */

export const CATEGORICAL_ORDER = [
  "blue", "green", "magenta", "yellow", "aqua", "orange", "violet", "red",
] as const;

export type CategoricalSlot = (typeof CATEGORICAL_ORDER)[number];

const CATEGORICAL_LIGHT: Record<CategoricalSlot, string> = {
  blue: "#2a78d6",
  green: "#008300",
  magenta: "#e87ba4",
  yellow: "#eda100",
  aqua: "#1baf7a",
  orange: "#eb6834",
  violet: "#4a3aa7",
  red: "#e34948",
};

const CATEGORICAL_DARK: Record<CategoricalSlot, string> = {
  blue: "#3987e5",
  green: "#008300",
  magenta: "#d55181",
  yellow: "#c98500",
  aqua: "#199e70",
  orange: "#d95926",
  violet: "#9085e9",
  red: "#e66767",
};

/** Reserved for state (compliant / at-risk / breach) — never reused for series identity. Same steps in both modes. */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

interface InkColors {
  primary: string;
  secondary: string;
  muted: string;
  grid: string;
  baseline: string;
  surface: string;
}

// Slate-family ink, matching the app shell's slate surfaces (bg-slate-50 /
// dark bg-slate-950, slate-toned cards) so axes and grids sit on-tone in
// both themes: axis text slate-500/400, grid slate-200 light / slate-700 dark.
const INK_LIGHT: InkColors = {
  primary: "#0f172a",
  secondary: "#334155",
  muted: "#64748b",
  grid: "#e2e8f0",
  baseline: "#cbd5e1",
  surface: "#ffffff",
};

const INK_DARK: InkColors = {
  primary: "#f1f5f9",
  secondary: "#cbd5e1",
  muted: "#94a3b8",
  grid: "#334155",
  baseline: "#475569",
  surface: "#0f172a",
};

/** Small named accent set for UI chrome (card tints, icon chips) — distinct from chart data-encoding colors. */
export const ACCENT_KEYS = ["blue", "green", "orange", "red", "violet", "neutral"] as const;
export type AccentColor = (typeof ACCENT_KEYS)[number];

/**
 * Sequential (magnitude) ramp — single hue (blue, the categorical palette's
 * own slot 1), 13 steps light→dark, for heatmap cells and other continuous-
 * magnitude fills. Values match the dataviz skill's validated default
 * palette (`references/palette.md`'s "Sequential hue" table), which is
 * already this app's categorical blue, so no new hue is introduced.
 */
const SEQUENTIAL_BLUE_STEPS = [
  "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7",
  "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b",
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Piecewise-lerps across an ordered ramp for continuous t in [0, 1]. */
function sampleRamp(steps: readonly string[], t: number): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const scaled = clamped * (steps.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(steps.length - 1, lo + 1);
  const frac = scaled - lo;
  const [r1, g1, b1] = hexToRgb(steps[lo]);
  const [r2, g2, b2] = hexToRgb(steps[hi]);
  return rgbToHex(r1 + (r2 - r1) * frac, g1 + (g2 - g1) * frac, b1 + (b2 - b1) * frac);
}

/** WCAG relative luminance — used only to pick legible on-fill text (a label
 * printed inside a heatmap cell sits on an arbitrary data color, not the
 * page/card surface, so it can't just reuse the `ink` tokens above). */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface ChartPalette {
  isDark: boolean;
  categorical: Record<CategoricalSlot, string>;
  status: typeof STATUS;
  ink: InkColors;
  /** Fixed-order color for the Nth categorical entity (0-indexed); folds past slot 7 to a neutral "Other" gray. */
  colorForIndex: (index: number) => string;
  /** Resolves a named UI accent (card tints, icon chips) to a hex value for this theme. */
  accent: (color: AccentColor) => string;
  /** Sequential (magnitude) color for continuous t in [0, 1] — heatmap cells,
   * choropleths. Low t recedes toward this mode's own surface, high t pops —
   * dark mode walks the same 13 steps in reverse rather than a separate ramp. */
  sequential: (t: number) => string;
  /** Legible text color (white or near-black) to print on top of a `sequential(t)` fill. */
  sequentialText: (t: number) => string;
}

export function getPalette(isDark: boolean): ChartPalette {
  const categorical = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  const ink = isDark ? INK_DARK : INK_LIGHT;
  const order = CATEGORICAL_ORDER.map((slot) => categorical[slot]);
  const sequentialSteps = isDark ? [...SEQUENTIAL_BLUE_STEPS].reverse() : SEQUENTIAL_BLUE_STEPS;

  return {
    isDark,
    categorical,
    status: STATUS,
    ink,
    colorForIndex: (index) => (index < order.length - 1 ? order[index] : ink.muted),
    accent: (color) => {
      switch (color) {
        case "blue": return categorical.blue;
        case "green": return categorical.green;
        case "orange": return categorical.orange;
        case "red": return STATUS.critical;
        case "violet": return categorical.violet;
        default: return ink.muted;
      }
    },
    sequential: (t) => sampleRamp(sequentialSteps, t),
    sequentialText: (t) => (relativeLuminance(sampleRamp(sequentialSteps, t)) > 0.45 ? "#0b0b0b" : "#ffffff"),
  };
}
