"use client";

import { createDashboardFocusHook } from "@/components/dashboard/use-focus-store";
import { SO_WIDGET_TAGS, type SpendOverviewFocusId, type SpendOverviewWidgetId } from "./focusParams";

const ALL_PARAMETER_IDS: SpendOverviewFocusId[] = ["spend-trends", "categories", "suppliers", "compliance"];

/**
 * Shared by both the Summary and Compliance tabs — same module, same
 * storage key, same underlying store, so toggling a chip or a drawer
 * override on either tab is reflected on both.
 */
export const useSpendOverviewFocus = createDashboardFocusHook<SpendOverviewFocusId, SpendOverviewWidgetId>({
  storageKey: "spend_overview_focus_params",
  allParameterIds: ALL_PARAMETER_IDS,
  widgetTags: SO_WIDGET_TAGS,
});
