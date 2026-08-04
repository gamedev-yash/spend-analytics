import { Tags, TrendingUp, Users } from "lucide-react";
import type { CustomizeWidgetGroupDef } from "@/components/dashboard/customize-view-drawer";
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
 * Every toggleable widget on the Summary tab. `insight-box` and
 * `metrics-table` are untagged (cross-cutting overview content): the Focus
 * Parameter bar can't hide them, only the Customize drawer can.
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

export const SO_WIDGET_GROUPS: CustomizeWidgetGroupDef<SpendOverviewWidgetId>[] = [
  {
    id: "summary-kpis",
    title: "Summary — KPIs",
    widgets: [{ id: "kpi-spend-trends", label: "Headline Spend KPIs" }],
  },
  {
    id: "summary-charts",
    title: "Summary — Charts & Tables",
    widgets: [
      { id: "insight-box", label: "Auto-Generated Insight" },
      { id: "category-treemap", label: "Spend by Category" },
      { id: "top-suppliers-chart", label: "Spend by Suppliers" },
      { id: "spend-trend-chart", label: "Spend Trend" },
      { id: "spend-by-bu-chart", label: "Spend by Business Unit" },
      { id: "metrics-table", label: "Key Metrics Summary" },
    ],
  },
];
