// Shared chart tokens for the Tail Spend Dashboard's dark/slate surface.
// Categorical hues are the validated dark-mode steps from the platform palette
// (see dataviz skill), re-validated against the slate-900 chart surface used here.
import type { SpendSegment } from "./tailSpendMock";

export const CHART_SURFACE = "#0f172a"; // slate-900 — card / chart background
export const GRIDLINE = "#1e293b"; // slate-800 — hairline grid
export const AXIS_LINE = "#334155"; // slate-700 — baseline / axis
export const TEXT_MUTED = "#94a3b8"; // slate-400 — axis ticks, secondary labels
export const TEXT_PRIMARY = "#f1f5f9"; // slate-100

// Categorical slots 1 / 2 / 4 (blue / green / amber) — validated all-pairs
// (WARN-band CVD, mitigated by the legend + direct labels every chart here ships).
export const SEGMENT_COLOR: Record<SpendSegment, string> = {
  Strategic: "#008300",
  Core: "#3987e5",
  Tail: "#c98500",
};

// Fixed status scale — used only where color means state (urgency), never for series identity.
export const STATUS_COLOR = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

export const ACTION_COLOR: Record<string, string> = {
  Consolidate: STATUS_COLOR.critical,
  Contract: STATUS_COLOR.warning,
  Monitor: STATUS_COLOR.good,
};

export const CHART_MARGIN = { top: 8, right: 16, bottom: 8, left: 8 };

// Pareto chart — decile share (bar) vs cumulative curve (line). Validated all-pairs.
export const PARETO_BAR_COLOR = "#3987e5"; // blue
export const PARETO_LINE_COLOR = "#d95926"; // orange

// SAP Spend Control Tower ribbon — navy chrome, not a data-encoding color.
export const SAP_NAVY = "#0a1f44";
export const SAP_NAVY_BORDER = "#16305e";

// One-hue ordinal ramp for the 7 SAP invoice-value buckets (order carries
// meaning), darkest = smallest bucket. Same hue family as the micro-PO donut.
export const INVOICE_BUCKET_RAMP = [
  "#0f3a73",
  "#184f95",
  "#256abf",
  "#3987e5",
  "#6da7ec",
  "#9ec5f4",
  "#cde2fb",
];
