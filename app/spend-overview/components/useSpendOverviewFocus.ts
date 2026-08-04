"use client";

import { createDashboardFocusHook } from "@/components/dashboard/use-focus-store";
import { SO_WIDGET_TAGS, type SpendOverviewFocusId, type SpendOverviewWidgetId } from "./focusParams";

const ALL_PARAMETER_IDS: SpendOverviewFocusId[] = ["spend-trends", "categories", "suppliers"];

/** Backs the Summary tab's Focus Parameter bar and Customize drawer. */
export const useSpendOverviewFocus = createDashboardFocusHook<SpendOverviewFocusId, SpendOverviewWidgetId>({
  storageKey: "spend_overview_focus_params",
  allParameterIds: ALL_PARAMETER_IDS,
  widgetTags: SO_WIDGET_TAGS,
});
