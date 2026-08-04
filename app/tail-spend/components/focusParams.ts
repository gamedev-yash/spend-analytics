import { Building2, FileText, PackageX, Tags, type LucideIcon } from "lucide-react";
import { ALL_WIDGET_IDS, type WidgetId } from "./dashboardParams";

export interface FocusParameter {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  widgetIds: WidgetId[];
}

/**
 * Widgets are tagged with every focus parameter they belong to — a widget
 * renders if ANY of its tags is active. Widgets with no tags here (KPI
 * Ribbon, Strategic vs. Core vs. Tail, 12-Month Spend Trend) are cross-cutting
 * and stay exempt from focus-bar filtering; the Customize drawer is still the
 * only way to hide those.
 */
export const FOCUS_PARAMETERS = [
  {
    id: "invoices",
    label: "Invoices",
    description: "Invoice counts and value buckets",
    icon: FileText,
    widgetIds: ["invoice-value-bucket-chart", "spend-by-invoice-value-donut"],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    description: "Supplier rankings for the selected buckets",
    icon: Building2,
    widgetIds: ["supplier-spend-rank-chart"],
  },
  {
    id: "categories",
    label: "Categories",
    description: "Category spend for the selected buckets",
    icon: Tags,
    widgetIds: ["category-spend-chart"],
  },
  {
    id: "tail-micro-pos",
    label: "Tail & Micro-POs",
    description: "80/20 Pareto distribution",
    icon: PackageX,
    widgetIds: ["pareto-curve-chart"],
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
  { id: "executive-view", label: "Executive View", parameterIds: ["tail-micro-pos"] },
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
