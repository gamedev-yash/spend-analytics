import { Copy, Layers, Target, UserX } from "lucide-react";
import type { CustomizeWidgetGroupDef } from "@/components/dashboard/customize-view-drawer";
import type { FocusParameterDef, FocusPresetDef } from "@/components/dashboard/focus-parameter-bar";

export type SfFocusId = "fragmentation" | "concentration" | "single-use" | "duplicates";

export const SF_FOCUS_PARAMETERS: FocusParameterDef<SfFocusId>[] = [
  {
    id: "fragmentation",
    label: "Fragmentation",
    description: "Active supplier count, fragmentation index",
    icon: Layers,
  },
  {
    id: "concentration",
    label: "Concentration",
    description: "Top 10 concentration ratio, category concentration",
    icon: Target,
  },
  {
    id: "single-use",
    label: "Single-Use",
    description: "Single-use supplier metrics & tail vendors",
    icon: UserX,
  },
  {
    id: "duplicates",
    label: "Duplicates",
    description: "Duplicate candidate table, rationalization savings",
    icon: Copy,
  },
];

export const SF_FOCUS_PRESETS: FocusPresetDef<SfFocusId>[] = [
  { id: "all", label: "All Parameters", parameterIds: ["fragmentation", "concentration", "single-use", "duplicates"] },
  { id: "fragmentation-focus", label: "Fragmentation Focus", parameterIds: ["fragmentation", "single-use"] },
  { id: "consolidation-view", label: "Consolidation View", parameterIds: ["concentration", "duplicates"] },
];

export type SfWidgetId =
  | "kpi-active-suppliers"
  | "kpi-single-use"
  | "kpi-concentration"
  | "kpi-avg-per-category"
  | "kpi-duplicate-pairs"
  | "kpi-new-suppliers"
  | "category-fragmentation"
  | "category-concentration"
  | "size-distribution"
  | "top-supplier-pareto"
  | "onboarding-trend"
  | "duplicate-table";

/** A widget renders when at least one of its tags is active in the focus bar. */
export const SF_WIDGET_TAGS: Record<SfWidgetId, SfFocusId[]> = {
  "kpi-active-suppliers": ["fragmentation"],
  "kpi-single-use": ["single-use"],
  "kpi-concentration": ["concentration"],
  "kpi-avg-per-category": ["fragmentation"],
  "kpi-duplicate-pairs": ["duplicates"],
  "kpi-new-suppliers": ["fragmentation"],
  "category-fragmentation": ["fragmentation", "single-use"],
  "category-concentration": ["concentration"],
  "size-distribution": ["fragmentation"],
  "top-supplier-pareto": ["concentration"],
  "onboarding-trend": ["fragmentation", "single-use"],
  "duplicate-table": ["duplicates"],
};

export const SF_WIDGET_GROUPS: CustomizeWidgetGroupDef<SfWidgetId>[] = [
  {
    id: "kpis",
    title: "Headline KPIs",
    widgets: [
      { id: "kpi-active-suppliers", label: "Active Suppliers" },
      { id: "kpi-single-use", label: "Single-Use Suppliers" },
      { id: "kpi-concentration", label: "Top-10 Concentration" },
      { id: "kpi-avg-per-category", label: "Avg. Suppliers per Category" },
      { id: "kpi-duplicate-pairs", label: "Potential Duplicate Pairs" },
      { id: "kpi-new-suppliers", label: "New Suppliers (12M)" },
    ],
  },
  {
    id: "charts",
    title: "Charts",
    widgets: [
      { id: "category-fragmentation", label: "Supplier Count by Category" },
      { id: "category-concentration", label: "Category Concentration" },
      { id: "size-distribution", label: "Suppliers by Annual Spend" },
      { id: "top-supplier-pareto", label: "Top 10 Suppliers" },
      { id: "onboarding-trend", label: "12-Month Onboarding Trend" },
    ],
  },
  {
    id: "tables",
    title: "Tables",
    widgets: [{ id: "duplicate-table", label: "Potential Duplicate Suppliers" }],
  },
];
