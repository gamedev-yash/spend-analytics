export interface DashboardWidgetParam {
  id: string;
  label: string;
}

export interface DashboardWidgetGroup {
  id: string;
  title: string;
  widgets: DashboardWidgetParam[];
}

/**
 * Single source of truth for every widget on the Tail Spend dashboard —
 * `WidgetId` and `ALL_WIDGET_IDS` below are derived from it, which is what
 * types the focus store and builds WIDGET_TAGS in ./focusParams.
 */
export const DASHBOARD_WIDGET_GROUPS = [
  {
    id: "executive-kpis",
    title: "Executive KPIs",
    widgets: [{ id: "kpi-ribbon", label: "KPI Ribbon" }],
  },
  {
    id: "spend-control-tower",
    title: "Spend Control Tower Charts",
    widgets: [
      { id: "invoice-value-bucket-chart", label: "Invoice Count by Invoice Value" },
      { id: "supplier-spend-rank-chart", label: "Supplier Ranking" },
      { id: "spend-by-invoice-value-donut", label: "Spend by Invoice Value" },
      { id: "category-spend-chart", label: "Spend by Category" },
    ],
  },
  {
    id: "tail-risk-charts",
    title: "Tail Risk Charts",
    widgets: [
      { id: "pareto-curve-chart", label: "Pareto Distribution" },
      { id: "strategic-comparison", label: "Strategic vs. Core vs. Tail" },
      { id: "tail-trend-chart", label: "12-Month Spend Trend" },
    ],
  },
] as const satisfies DashboardWidgetGroup[];

export type WidgetId = (typeof DASHBOARD_WIDGET_GROUPS)[number]["widgets"][number]["id"];

export const ALL_WIDGET_IDS: WidgetId[] = DASHBOARD_WIDGET_GROUPS.flatMap((group) =>
  group.widgets.map((widget) => widget.id)
);
