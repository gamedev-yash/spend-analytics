import { Tags, TrendingUp, Users } from "lucide-react";
import type { FocusParameterDef, FocusPresetDef } from "@/components/dashboard/focus-parameter-bar";

export type SpendOverviewFocusId = "spend-trends" | "categories" | "suppliers";

export const SO_FOCUS_PARAMETERS: FocusParameterDef<SpendOverviewFocusId>[] = [
  {
    id: "spend-trends",
    label: "Spend Trends",
    description: "Overall spend metrics, monthly trend charts",
    icon: TrendingUp,
  },
  {
    id: "categories",
    label: "Categories",
    description: "Category spend breakdown, L1/L2 distribution",
    icon: Tags,
  },
  {
    id: "suppliers",
    label: "Suppliers",
    description: "Top supplier spend, vendor concentration",
    icon: Users,
  },
];

export const SO_FOCUS_PRESETS: FocusPresetDef<SpendOverviewFocusId>[] = [
  { id: "all", label: "All Parameters", parameterIds: ["spend-trends", "categories", "suppliers"] },
  { id: "categories-suppliers", label: "Categories & Suppliers", parameterIds: ["categories", "suppliers"] },
];

/**
 * Every widget on the Summary tab. `insight-box` and `metrics-table` are
 * untagged (cross-cutting overview content), so the Focus Parameter bar can't
 * hide them — they always render.
 */
export type SpendOverviewWidgetId =
  | "kpi-spend-trends"
  | "insight-box"
  | "category-treemap"
  | "top-suppliers-chart"
  | "spend-trend-chart"
  | "spend-by-bu-chart"
  | "metrics-table";

export const SO_WIDGET_TAGS: Record<SpendOverviewWidgetId, SpendOverviewFocusId[]> = {
  "kpi-spend-trends": ["spend-trends"],
  "insight-box": [],
  "category-treemap": ["categories"],
  "top-suppliers-chart": ["suppliers"],
  "spend-trend-chart": ["spend-trends"],
  "spend-by-bu-chart": ["spend-trends"],
  "metrics-table": [],
};
