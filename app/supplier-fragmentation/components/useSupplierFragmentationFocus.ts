"use client";

import { createDashboardFocusHook } from "@/components/dashboard/use-focus-store";
import { SF_WIDGET_TAGS, type SfFocusId, type SfWidgetId } from "./focusParams";

const ALL_PARAMETER_IDS: SfFocusId[] = ["fragmentation", "concentration", "single-use", "duplicates"];

export const useSupplierFragmentationFocus = createDashboardFocusHook<SfFocusId, SfWidgetId>({
  storageKey: "supplier_fragmentation_focus_params",
  allParameterIds: ALL_PARAMETER_IDS,
  widgetTags: SF_WIDGET_TAGS,
});
