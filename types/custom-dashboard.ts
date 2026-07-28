// User-built dashboards: a titled set of widget configs bound to one uploaded
// dataset. Widgets are declarative — each names the columns, aggregation, and
// chart form to render, so a dashboard is pure JSON that survives a reload.

export type ChartType = "kpi" | "bar" | "line" | "pie" | "donut" | "table";

export type Aggregation = "sum" | "avg" | "count" | "distinct";

export interface WidgetConfig {
  id: string;
  title: string;
  chartType: ChartType;
  /** Grouping dimension (category or date column). Unused by 'kpi'. */
  xAxisColumn?: string;
  /** Measure column. Optional for 'count' aggregations, which need no measure. */
  yAxisColumn?: string;
  aggregation?: Aggregation;
  /** Top-N cap on grouped results, e.g. 10. */
  limit?: number;
  /** 1 = half width, 2 = full width. */
  gridSpan?: 1 | 2;
}

export interface CustomDashboard {
  id: string;
  title: string;
  datasetId: string;
  widgets: WidgetConfig[];
  createdAt: string;
  updatedAt: string;
}

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  kpi: "KPI",
  bar: "Bar Chart",
  line: "Line Chart",
  pie: "Pie Chart",
  donut: "Donut Chart",
  table: "Data Table",
};

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  sum: "Sum",
  avg: "Average",
  count: "Count",
  distinct: "Distinct Count",
};

/** Chart types that plot a grouping dimension against a measure. */
export function needsXAxis(chartType: ChartType): boolean {
  return chartType !== "kpi";
}

/** Whether this aggregation reads values from a measure column. */
export function needsMeasure(aggregation: Aggregation | undefined): boolean {
  return aggregation !== "count";
}
