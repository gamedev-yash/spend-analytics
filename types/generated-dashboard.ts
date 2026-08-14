// Widget/plan/dashboard contract for AI-generated dashboards. A dashboard is
// pure JSON: a narrative plan (why these sections matter) plus concrete widget
// specs (what to render), bundled with the source rows so it can re-render
// without re-uploading or re-calling the model.

import type { DatasetProfile } from "./dataset-profile";

export type ChartKind =
  | "kpi"
  | "bar"
  | "stackedBar"
  | "groupedBar"
  | "line"
  | "area"
  | "stackedArea"
  | "stackedBarWithTotalLine"
  | "pareto"
  | "donut"
  | "heatmap"
  | "waterfall"
  | "table";

export type Aggregation = "sum" | "avg" | "count" | "distinct" | "min" | "max";

export interface MeasureRef {
  column: string;
  aggregation: Aggregation;
  label: string;
}

export type SeriesSpec =
  | { type: "measures"; items: MeasureRef[] }
  | { type: "pivot"; dimension: string; values: string[]; measure: MeasureRef };

export interface WidgetSpec {
  id: string;
  sectionId: string;
  title: string;
  kind: ChartKind;
  /** Grouping column along the category/x axis. Unused by 'kpi'. */
  dimension?: string;
  series: SeriesSpec;
  sort?: "value-desc" | "value-asc" | "label-asc" | "temporal";
  limit?: number;
  colSpan: 3 | 4 | 6 | 8 | 12;
  formatHint?: "currency" | "percent" | "count" | "number";
  /**
   * The widget planner's own judgement on whether this widget carries the
   * dashboard's core story. `true` -> shown on the dashboard from the start;
   * `false` -> generated but parked in the Add Widget catalog. Optional
   * because dashboards generated before this field existed don't carry it —
   * see lib/generated-dashboard/select-initial.ts for the fallback.
   */
  essential?: boolean;
}

export interface DashboardSection {
  id: string;
  heading: string;
  intent: string;
  whyItMatters: string;
  priority: number;
}

export interface DashboardPlan {
  title: string;
  subtitle: string;
  domain: string;
  grain: string;
  currencyOrUnit?: string;
  headlineMetrics: string[];
  sections: DashboardSection[];
  caveats: string[];
  excludedColumns: { name: string; reason: string }[];
}

export interface GeneratedDashboard {
  id: string;
  title: string;
  createdAt: string;
  sourceFileName: string;
  profile: DatasetProfile;
  plan: DashboardPlan;
  /** The widgets currently rendered on the dashboard. */
  widgets: WidgetSpec[];
  /**
   * Generated-but-not-shown widgets, offered through "Add Widget". A widget
   * is in exactly one of `widgets`/`library` at a time — adding moves it
   * across rather than copying it, so it can never be shown twice. Optional:
   * dashboards stored before this feature have no catalog and read as [].
   */
  library?: WidgetSpec[];
  rows: Record<string, unknown>[];
  columns: string[];
}

export const CHART_KIND_LABELS: Record<ChartKind, string> = {
  kpi: "KPI",
  bar: "Bar Chart",
  stackedBar: "Stacked Bar",
  groupedBar: "Grouped Bar",
  line: "Line Chart",
  area: "Area Chart",
  stackedArea: "Stacked Area",
  stackedBarWithTotalLine: "Stacked Bar (with trend)",
  pareto: "Pareto Chart",
  donut: "Donut Chart",
  heatmap: "Heatmap",
  waterfall: "Waterfall",
  table: "Data Table",
};

/** Chart kinds that plot a grouping dimension against one or more measures. */
export function needsDimension(kind: ChartKind): boolean {
  return kind !== "kpi";
}
