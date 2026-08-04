// Default domain thresholds for the four core dashboard routes. These are the
// factory settings; ThresholdsContext overlays user-adjusted values persisted
// in localStorage['app_thresholds'].

import type { ThresholdConfig } from "@/types/thresholds";

export const THRESHOLD_PRESETS: Record<string, ThresholdConfig[]> = {
  "tail-spend": [
    {
      id: "tail-spend.micro-po-value",
      metricKey: "microPOValue",
      label: "Micro-PO Threshold",
      targetValue: 25_000,
      operator: "lte",
      sentiment: "lower_is_better",
      unit: "currency",
      description:
        "PO/invoice value at or below this counts as a micro-PO — drives the micro-PO KPIs, value-bucket highlighting, and the distribution analysis.",
    },
    {
      id: "tail-spend.tail-share",
      metricKey: "tailSpendPercentOfValue",
      label: "Tail Spend Share",
      targetValue: 20,
      operator: "lte",
      sentiment: "lower_is_better",
      unit: "percent",
      description: "Alerts when tail spend exceeds this share of total spend.",
    },
    {
      id: "tail-spend.savings-target",
      metricKey: "potentialConsolidationSavings",
      label: "Potential Savings Target",
      targetValue: 300_000_000,
      operator: "gte",
      sentiment: "higher_is_better",
      unit: "currency",
      description: "Identified consolidation savings should meet this annual target.",
    },
  ],
  "spend-overview": [
    {
      id: "spend-overview.off-contract",
      metricKey: "offContractPercent",
      label: "Off-Contract Spend",
      targetValue: 25,
      operator: "lte",
      sentiment: "lower_is_better",
      unit: "percent",
      description: "Red warning when off-contract (maverick) spend exceeds this share.",
    },
    {
      id: "spend-overview.yoy-growth",
      metricKey: "yoyChangePercent",
      label: "YoY Spend Growth",
      targetValue: 0,
      operator: "lte",
      sentiment: "lower_is_better",
      unit: "percent",
      description: "Cost-control lens: spend growing year-over-year needs attention.",
    },
  ],
  "payment-terms": [
    {
      id: "payment-terms.avg-paid-days",
      metricKey: "avgPaidDays",
      label: "Average Paid Days (DPO)",
      targetValue: 45,
      operator: "gte",
      sentiment: "higher_is_better",
      unit: "days",
      description: "Working-capital lens: paying no faster than this DPO target.",
    },
  ],
  "supplier-fragmentation": [
    {
      id: "supplier-fragmentation.single-use-ratio",
      metricKey: "singleUseSupplierRatio",
      label: "Single-Use Supplier Ratio",
      targetValue: 30,
      operator: "lte",
      sentiment: "lower_is_better",
      unit: "percent",
      description: "Share of active suppliers used only once.",
    },
    {
      id: "supplier-fragmentation.top10-concentration",
      metricKey: "top10ConcentrationPercent",
      label: "Top-10 Concentration",
      targetValue: 50,
      operator: "lte",
      sentiment: "lower_is_better",
      unit: "percent",
      description: "Share of spend concentrated in the top 10 suppliers.",
    },
  ],
};

export function presetById(id: string): ThresholdConfig | null {
  for (const configs of Object.values(THRESHOLD_PRESETS)) {
    const hit = configs.find((c) => c.id === id);
    if (hit) return hit;
  }
  return null;
}
