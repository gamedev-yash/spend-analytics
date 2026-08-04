"use client";

import { createDashboardFocusHook } from "@/components/dashboard/use-focus-store";
import { SSR_WIDGET_TAGS, type SsrFocusId, type SsrWidgetId } from "./focusParams";

const ALL_PARAMETER_IDS: SsrFocusId[] = [
  "category-risk",
  "product-exposure",
  "site-exposure",
  "supplier-concentration",
];

export const useSingleSourceRiskFocus = createDashboardFocusHook<SsrFocusId, SsrWidgetId>({
  storageKey: "single_source_risk_focus_params_v1",
  allParameterIds: ALL_PARAMETER_IDS,
  widgetTags: SSR_WIDGET_TAGS,
});
