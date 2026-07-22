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

const INK_LIGHT: InkColors = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  surface: "#fcfcfb",
};

const INK_DARK: InkColors = {
  primary: "#ffffff",
  secondary: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  baseline: "#383835",
  surface: "#1a1a19",
};

/** Small named accent set for UI chrome (card tints, icon chips) — distinct from chart data-encoding colors. */
export const ACCENT_KEYS = ["blue", "green", "orange", "red", "violet", "neutral"] as const;
export type AccentColor = (typeof ACCENT_KEYS)[number];

export interface ChartPalette {
  isDark: boolean;
  categorical: Record<CategoricalSlot, string>;
  status: typeof STATUS;
  ink: InkColors;
  riskColor: Record<"Low" | "Medium" | "High", string>;
  complianceStatusColor: (percent: number) => string;
  /** Fixed-order color for the Nth categorical entity (0-indexed); folds past slot 7 to a neutral "Other" gray. */
  colorForIndex: (index: number) => string;
  /** Resolves a named UI accent (card tints, icon chips) to a hex value for this theme. */
  accent: (color: AccentColor) => string;
}

export function getPalette(isDark: boolean): ChartPalette {
  const categorical = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  const ink = isDark ? INK_DARK : INK_LIGHT;
  const order = CATEGORICAL_ORDER.map((slot) => categorical[slot]);

  return {
    isDark,
    categorical,
    status: STATUS,
    ink,
    riskColor: { Low: STATUS.good, Medium: STATUS.warning, High: STATUS.critical },
    complianceStatusColor: (percent) => {
      if (percent >= 90) return STATUS.good;
      if (percent >= 75) return STATUS.warning;
      return STATUS.critical;
    },
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
  };
}

/** Fixed entity → categorical-slot-index maps, defined once so color never depends on current sort/filter. */
export const BUSINESS_UNIT_ORDER = [
  "Zinc India", "Zinc International", "Aluminium", "Iron Ore", "Oil & Gas", "Copper", "Power",
];

export const VIOLATION_TYPE_ORDER = [
  "Off-Contract Purchase", "Price Deviation", "Missing Approval", "Policy Breach", "Late Delivery",
];

export const CATEGORY_ORDER = [
  "Bearings", "Conveyance", "Crushing", "Electrical Motors", "Flotation", "Instrumentation",
  "Lead & Copper", "Lubricants", "Milling", "Pipes", "Pumping", "Valves",
];
