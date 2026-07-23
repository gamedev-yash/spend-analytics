import { Copy, Layers, Target, UserX } from "lucide-react";
import type { FocusParameterDef, FocusPresetDef } from "@/components/dashboard/focus-parameter-bar";

export type SfFocusId = "fragmentation" | "concentration" | "single-use" | "duplicates";

export const SF_FOCUS_PARAMETERS: FocusParameterDef<SfFocusId>[] = [
  {
    id: "fragmentation",
    label: "Fragmentation",
    description: "Supplier counts by category, size distribution, onboarding trend",
    icon: Layers,
  },
  {
    id: "concentration",
    label: "Concentration",
    description: "Top-3 category concentration, top-10 supplier Pareto",
    icon: Target,
  },
  {
    id: "single-use",
    label: "Single-Use",
    description: "One-time suppliers by category and onboarding mix",
    icon: UserX,
  },
  {
    id: "duplicates",
    label: "Duplicates",
    description: "Potential duplicate supplier records to merge",
    icon: Copy,
  },
];

export const SF_FOCUS_PRESETS: FocusPresetDef<SfFocusId>[] = [
  { id: "all", label: "All Parameters", parameterIds: ["fragmentation", "concentration", "single-use", "duplicates"] },
  { id: "fragmentation-focus", label: "Fragmentation Focus", parameterIds: ["fragmentation", "single-use"] },
  { id: "consolidation-view", label: "Consolidation View", parameterIds: ["concentration", "duplicates"] },
];

export type SfWidgetId =
  | "category-fragmentation"
  | "category-concentration"
  | "size-distribution"
  | "top-supplier-pareto"
  | "onboarding-trend"
  | "duplicate-table";

/**
 * A widget renders when at least one of its tags is active in the focus bar.
 * The KPI card row is untagged on purpose — headline stats stay visible in
 * every focus view (mirrors tail-spend's cross-cutting-widget exemption).
 */
export const SF_WIDGET_TAGS: Record<SfWidgetId, SfFocusId[]> = {
  "category-fragmentation": ["fragmentation", "single-use"],
  "category-concentration": ["concentration"],
  "size-distribution": ["fragmentation"],
  "top-supplier-pareto": ["concentration"],
  "onboarding-trend": ["fragmentation", "single-use"],
  "duplicate-table": ["duplicates"],
};
