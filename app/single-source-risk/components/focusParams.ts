import { AlertTriangle, Boxes, Building2, Crosshair, Users } from "lucide-react";
import type { CustomizeWidgetGroupDef } from "@/components/dashboard/customize-view-drawer";
import type { FocusParameterDef } from "@/components/dashboard/focus-parameter-bar";

export type SsrFocusId =
  | "category-risk"
  | "product-exposure"
  | "site-exposure"
  | "supplier-concentration"
  | "risk-insights";

export const SSR_FOCUS_PARAMETERS: FocusParameterDef<SsrFocusId>[] = [
  {
    id: "category-risk",
    label: "Category Risk",
    description: "Which categories fall at or below the selected supplier-count threshold",
    icon: AlertTriangle,
  },
  {
    id: "product-exposure",
    label: "Product Exposure",
    description: "Spend concentration by product within at-risk categories",
    icon: Boxes,
  },
  {
    id: "site-exposure",
    label: "Site Exposure",
    description: "Spend concentration by plant/site within at-risk categories",
    icon: Building2,
  },
  {
    id: "supplier-concentration",
    label: "Supplier Concentration",
    description: "Which suppliers hold the exposure, plus the category-level detail report",
    icon: Users,
  },
  {
    id: "risk-insights",
    label: "Risk Insights",
    description: "How the at-risk share of spend has moved month over month",
    icon: Crosshair,
  },
];

export type SsrWidgetId =
  | "kpi-ribbon"
  | "category-chart"
  | "product-chart"
  | "plant-chart"
  | "supplier-chart"
  | "detail-table"
  | "exposure-trend-chart";

/**
 * Untagged (`[]`) means cross-cutting — always rendered regardless of which
 * sections are active, switchable only via the Customize View drawer.
 */
export const SSR_WIDGET_TAGS: Record<SsrWidgetId, SsrFocusId[]> = {
  "kpi-ribbon": [],
  "category-chart": ["category-risk"],
  "product-chart": ["product-exposure"],
  "plant-chart": ["site-exposure"],
  "supplier-chart": ["supplier-concentration"],
  "detail-table": ["supplier-concentration"],
  "exposure-trend-chart": ["risk-insights"],
};

export const SSR_WIDGET_GROUPS: CustomizeWidgetGroupDef<SsrWidgetId>[] = [
  {
    id: "kpis",
    title: "KPIs",
    widgets: [{ id: "kpi-ribbon", label: "Single Source Risk KPI Ribbon" }],
  },
  {
    id: "charts",
    title: "Charts",
    widgets: [
      { id: "category-chart", label: "Spend by Categories with Suppliers ≤ N" },
      { id: "product-chart", label: "Spend by Products" },
      { id: "plant-chart", label: "Spend by Plants/Sites" },
      { id: "supplier-chart", label: "Spend by Suppliers" },
    ],
  },
  {
    id: "risk-insights",
    title: "Risk Insights",
    widgets: [{ id: "exposure-trend-chart", label: "Single-Source Exposure Trend" }],
  },
  {
    id: "tables",
    title: "Tables",
    widgets: [{ id: "detail-table", label: "Detail Report Table" }],
  },
];
