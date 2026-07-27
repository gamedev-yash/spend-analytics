// Standardized threshold model for dynamic KPI/chart/table status coloring.
// A ThresholdConfig describes the target zone for one metric; evaluateThreshold
// grades a live value against it as success (on target), warning (just past
// the boundary), or danger (clearly out of range).

export type ThresholdOperator = "gt" | "gte" | "lt" | "lte" | "between";

export interface ThresholdConfig {
  id: string;
  metricKey: string;
  label: string;
  targetValue: number;
  /** Upper bound of the target zone — only for the 'between' operator. */
  upperBound?: number;
  operator: ThresholdOperator;
  // 'higher_is_better' -> gt target = green, lt target = red
  // 'lower_is_better'  -> lt target = green, gt target = red
  sentiment: "higher_is_better" | "lower_is_better";
  unit?: "currency" | "percent" | "count" | "days";
  /** Optional explanation shown in the threshold editor. */
  description?: string;
}

export type ThresholdStatus = "success" | "warning" | "danger";

/**
 * A failing value within this fraction of the crossed boundary grades as
 * "warning" rather than "danger" (10% past target = amber, beyond = red).
 */
const WARNING_TOLERANCE = 0.1;

/**
 * Warning margin for a zero boundary (e.g. "YoY growth ≤ 0%"), where a
 * relative tolerance would collapse to nothing — 5 absolute units.
 */
const ZERO_BOUNDARY_MARGIN = 5;

function warningMargin(boundary: number): number {
  return boundary === 0 ? ZERO_BOUNDARY_MARGIN : Math.abs(boundary) * WARNING_TOLERANCE;
}

/**
 * Grade a metric value against a threshold config.
 *
 * The operator defines the target zone relative to targetValue (and
 * upperBound for 'between'); a value inside the zone is 'success'. A value
 * outside grades 'warning' while within 10% of the boundary it crossed
 * (5 absolute units when the boundary is 0), and 'danger' beyond that.
 * Non-finite values grade 'warning' — unknown is neither good nor alarming.
 */
export function evaluateThreshold(value: number, config: ThresholdConfig): ThresholdStatus {
  if (!Number.isFinite(value)) return "warning";

  const target = config.targetValue;
  const upper = config.upperBound ?? target;

  let pass: boolean;
  let crossedBoundary: number;
  switch (config.operator) {
    case "gt":
      pass = value > target;
      crossedBoundary = target;
      break;
    case "gte":
      pass = value >= target;
      crossedBoundary = target;
      break;
    case "lt":
      pass = value < target;
      crossedBoundary = target;
      break;
    case "lte":
      pass = value <= target;
      crossedBoundary = target;
      break;
    case "between":
      pass = value >= target && value <= upper;
      crossedBoundary = value < target ? target : upper;
      break;
  }

  if (pass) return "success";
  const distance = Math.abs(value - crossedBoundary);
  return distance <= warningMargin(crossedBoundary) ? "warning" : "danger";
}
