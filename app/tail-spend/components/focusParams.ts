import { Building2, FileText, PackageX, PiggyBank, Tags, type LucideIcon } from "lucide-react";
import { ALL_WIDGET_IDS, type WidgetId } from "./dashboardParams";

export interface FocusParameter {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  widgetIds: WidgetId[];
}

/**
 * Widgets are tagged with every focus parameter they belong to (several are
 * tagged more than once, e.g. Micro-PO Distribution under both Invoices and
 * Tail & Micro-POs) — a widget renders if ANY of its tags is active. Widgets
 * with no tags here (Strategic vs. Core vs. Tail, 12-Month Spend Trend) are
 * cross-cutting and stay exempt from focus-bar filtering; the Customize
 * drawer is still the only way to hide those.
 *
 * SAP KPI Ribbon and Top KPIs are each tagged under multiple parameters
 * rather than split into per-metric widgets — SapKpiRibbon is explicitly a
 * fixed, non-decomposable SAP banner (see its own doc comment), and Top KPIs
 * is the same kind of fixed summary unit.
 */
export const FOCUS_PARAMETERS = [
  {
    id: "invoices",
    label: "Invoices",
    description: "Invoice counts, value buckets, processing costs",
    icon: FileText,
    widgetIds: [
      "sap-kpi-ribbon",
      "invoice-value-bucket-chart",
      "spend-by-invoice-value-donut",
      "micro-po-analysis",
    ],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    description: "Supplier fragmentation, rankings, matrix, detail table",
    icon: Building2,
    widgetIds: ["sap-kpi-ribbon", "supplier-spend-rank-chart", "tail-bubble-chart", "sap-detail-table"],
  },
  {
    id: "categories",
    label: "Categories",
    description: "Category spend split, category spend by bucket",
    icon: Tags,
    widgetIds: ["category-spend-hybrid", "tail-category-chart"],
  },
  {
    id: "tail-micro-pos",
    label: "Tail & Micro-POs",
    description: "Pareto 80/20 distribution, micro-PO thresholds & donut",
    icon: PackageX,
    widgetIds: ["tail-kpi-cards", "pareto-curve-chart", "micro-po-analysis"],
  },
  {
    id: "consolidation-savings",
    label: "Consolidation & Savings",
    description: "Consolidation candidates table, potential savings",
    icon: PiggyBank,
    widgetIds: ["tail-kpi-cards", "consolidation-table"],
  },
] as const satisfies FocusParameter[];

export type FocusParameterId = (typeof FOCUS_PARAMETERS)[number]["id"];

export const ALL_FOCUS_PARAMETER_IDS: FocusParameterId[] = FOCUS_PARAMETERS.map((parameter) => parameter.id);

export interface FocusPreset {
  id: string;
  label: string;
  parameterIds: FocusParameterId[];
}

export const FOCUS_PRESETS: FocusPreset[] = [
  { id: "all", label: "All Parameters", parameterIds: ALL_FOCUS_PARAMETER_IDS },
  { id: "invoice-focus", label: "Invoice Focus", parameterIds: ["invoices"] },
  { id: "executive-view", label: "Executive View", parameterIds: ["tail-micro-pos", "consolidation-savings"] },
];

/** Widget → parameter-tags, inverted from FOCUS_PARAMETERS.widgetIds for useDashboardCustomization. */
export const WIDGET_TAGS: Record<WidgetId, FocusParameterId[]> = Object.fromEntries(
  ALL_WIDGET_IDS.map((widgetId) => [
    widgetId,
    FOCUS_PARAMETERS.filter((parameter) => (parameter.widgetIds as readonly WidgetId[]).includes(widgetId)).map(
      (parameter) => parameter.id
    ),
  ])
) as Record<WidgetId, FocusParameterId[]>;
