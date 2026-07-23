"use client";

import { createDashboardFocusHook } from "@/components/dashboard/use-focus-store";
import { PT_WIDGET_TAGS, type PaymentTermsFocusId, type PaymentTermsWidgetId } from "./focusParams";

const ALL_PARAMETER_IDS: PaymentTermsFocusId[] = [
  "term-distribution",
  "working-capital",
  "compliance-risk",
  "supplier-impact",
];

export const usePaymentTermsFocus = createDashboardFocusHook<PaymentTermsFocusId, PaymentTermsWidgetId>({
  storageKey: "payment_terms_focus_params",
  allParameterIds: ALL_PARAMETER_IDS,
  widgetTags: PT_WIDGET_TAGS,
});
