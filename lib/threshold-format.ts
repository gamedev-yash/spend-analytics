// Display helpers for threshold values and conditions, shared by the editor
// popover, KPI badges, and chart/table tooltips.

import type { ThresholdConfig } from "@/types/thresholds";

/** Compact INR: ₹25K / ₹3.5 L / ₹30 Cr — mirrors the dashboards' own scale. */
function formatInrCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export function formatThresholdValue(value: number, unit: ThresholdConfig["unit"]): string {
  switch (unit) {
    case "currency":
      return formatInrCompact(value);
    case "percent":
      return `${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
    case "days":
      return `${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} days`;
    default:
      return value.toLocaleString("en-IN");
  }
}

const OPERATOR_SYMBOL: Record<ThresholdConfig["operator"], string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  between: "…",
};

/** "≤ 25%", "≥ ₹30 Cr", "10% … 20%" — the target zone in symbols. */
export function thresholdConditionLabel(config: ThresholdConfig): string {
  if (config.operator === "between") {
    return `${formatThresholdValue(config.targetValue, config.unit)} … ${formatThresholdValue(
      config.upperBound ?? config.targetValue,
      config.unit
    )}`;
  }
  return `${OPERATOR_SYMBOL[config.operator]} ${formatThresholdValue(config.targetValue, config.unit)}`;
}

/** "20% vs target ≤ 20%" — tooltip text for a status badge. */
export function thresholdEvaluationTitle(value: number, config: ThresholdConfig): string {
  return `${config.label}: ${formatThresholdValue(value, config.unit)} vs target ${thresholdConditionLabel(config)}`;
}
