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
 * Single source of truth for every toggleable widget on the Tail Spend
 * dashboard. Group order here is display order in the Customize drawer.
 */
export const DASHBOARD_WIDGET_GROUPS = [
  {
    id: "executive-kpis",
    title: "Executive KPIs",
    widgets: [
      { id: "sap-kpi-ribbon", label: "SAP KPI Ribbon" },
      { id: "tail-kpi-cards", label: "Top KPIs" },
    ],
  },
  {
    id: "spend-control-tower",
    title: "Spend Control Tower Charts",
    widgets: [
      { id: "invoice-value-bucket-chart", label: "Invoice Count by Invoice Value" },
      { id: "supplier-spend-rank-chart", label: "Supplier Ranking" },
      { id: "spend-by-invoice-value-donut", label: "Spend by Invoice Value" },
      { id: "category-spend-hybrid", label: "Category Spend by Bucket" },
    ],
  },
  {
    id: "tail-risk-charts",
    title: "Tail Risk Charts",
    widgets: [
      { id: "pareto-curve-chart", label: "Pareto Distribution" },
      { id: "tail-category-chart", label: "Category Split" },
      { id: "tail-bubble-chart", label: "Supplier Matrix" },
      { id: "strategic-comparison", label: "Strategic vs. Core vs. Tail" },
      { id: "tail-trend-chart", label: "12-Month Spend Trend" },
      { id: "micro-po-analysis", label: "Micro-PO Distribution" },
    ],
  },
  {
    id: "detailed-tables",
    title: "Detailed Tables",
    widgets: [
      { id: "sap-detail-table", label: "Supplier Detail Report" },
      { id: "consolidation-table", label: "Consolidation Candidates Table" },
    ],
  },
] as const satisfies DashboardWidgetGroup[];

export type WidgetId = (typeof DASHBOARD_WIDGET_GROUPS)[number]["widgets"][number]["id"];

export const ALL_WIDGET_IDS: WidgetId[] = DASHBOARD_WIDGET_GROUPS.flatMap((group) =>
  group.widgets.map((widget) => widget.id)
);
