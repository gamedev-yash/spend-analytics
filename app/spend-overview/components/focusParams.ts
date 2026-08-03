import { ShieldAlert, Tags, TrendingUp, Users } from "lucide-react";
import type { CustomizeWidgetGroupDef } from "@/components/dashboard/customize-view-drawer";
import type { FocusParameterDef, FocusPresetDef } from "@/components/dashboard/focus-parameter-bar";

export type SpendOverviewFocusId = "spend-trends" | "categories" | "suppliers" | "compliance";

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
  {
    id: "compliance",
    label: "Compliance",
    description: "Contracted vs. non-contracted spend, rogue spend metrics",
    icon: ShieldAlert,
  },
];

export const SO_FOCUS_PRESETS: FocusPresetDef<SpendOverviewFocusId>[] = [
  { id: "all", label: "All Parameters", parameterIds: ["spend-trends", "categories", "suppliers", "compliance"] },
  { id: "trends-compliance", label: "Trends & Compliance", parameterIds: ["spend-trends", "compliance"] },
  { id: "categories-suppliers", label: "Categories & Suppliers", parameterIds: ["categories", "suppliers"] },
];

/**
 * Every toggleable widget across both the Summary and Compliance tabs — one
 * shared focus state covers both (they're sub-tabs of one conceptual page,
 * see DashboardTabs). `insight-box` and `metrics-table` are untagged
 * (cross-cutting overview content): the Focus Parameter bar can't hide them,
 * only the Customize drawer can.
 */
export type SpendOverviewWidgetId =
  | "kpi-spend-trends"
  | "insight-box"
  | "category-treemap"
  | "top-suppliers-chart"
  | "spend-trend-chart"
  | "spend-by-bu-chart"
  | "spend-sunburst"
  | "metrics-table"
  | "kpi-compliance-headline"
  | "risk-donut-chart"
  | "compliance-trend-chart"
  | "dimension-pass-rates-chart"
  | "violation-types-chart"
  | "worst-suppliers-table"
  | "recent-violations-table";

export const SO_WIDGET_TAGS: Record<SpendOverviewWidgetId, SpendOverviewFocusId[]> = {
  "kpi-spend-trends": ["spend-trends"],
  "insight-box": [],
  "category-treemap": ["categories"],
  "top-suppliers-chart": ["suppliers"],
  "spend-trend-chart": ["spend-trends"],
  "spend-by-bu-chart": ["spend-trends"],
  "spend-sunburst": ["categories", "spend-trends"],
  "metrics-table": [],
  "kpi-compliance-headline": ["compliance"],
  "risk-donut-chart": ["compliance"],
  "compliance-trend-chart": ["compliance", "spend-trends"],
  "dimension-pass-rates-chart": ["compliance"],
  "violation-types-chart": ["compliance"],
  "worst-suppliers-table": ["compliance", "suppliers"],
  "recent-violations-table": ["compliance"],
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
      { id: "spend-sunburst", label: "Spend Composition" },
      { id: "metrics-table", label: "Key Metrics Summary" },
    ],
  },
  {
    id: "compliance-kpis",
    title: "Compliance — KPIs",
    widgets: [{ id: "kpi-compliance-headline", label: "Compliance Headline KPIs" }],
  },
  {
    id: "compliance-charts",
    title: "Compliance — Charts & Tables",
    widgets: [
      { id: "risk-donut-chart", label: "Risk Distribution" },
      { id: "compliance-trend-chart", label: "Compliance Trend" },
      { id: "dimension-pass-rates-chart", label: "Compliance by Dimension" },
      { id: "violation-types-chart", label: "Violation Types" },
      { id: "worst-suppliers-table", label: "Suppliers to Watch" },
      { id: "recent-violations-table", label: "Recent Violations" },
    ],
  },
];
