import { createDashboardFocusHook } from "@/components/dashboard/use-focus-store";
import { type WidgetId } from "./dashboardParams";
import { ALL_FOCUS_PARAMETER_IDS, WIDGET_TAGS, type FocusParameterId } from "./focusParams";

/**
 * Tail Spend dashboard visibility — see components/dashboard/use-focus-store.ts
 * for the persistence/visibility rules shared by every dashboard page.
 */
export const useDashboardCustomization = createDashboardFocusHook<FocusParameterId, WidgetId>({
  storageKey: "tail_spend_focus_params",
  allParameterIds: ALL_FOCUS_PARAMETER_IDS,
  widgetTags: WIDGET_TAGS,
});
