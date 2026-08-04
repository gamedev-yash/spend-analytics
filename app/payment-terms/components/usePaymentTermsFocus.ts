"use client";

import { createDashboardFocusHook } from "@/components/dashboard/use-focus-store";
import { PT_WIDGET_TAGS, type PaymentTermsFocusId, type PaymentTermsWidgetId } from "./focusParams";

const ALL_PARAMETER_IDS: PaymentTermsFocusId[] = ["term-mix", "payment-performance", "supplier-view"];

export const usePaymentTermsFocus = createDashboardFocusHook<PaymentTermsFocusId, PaymentTermsWidgetId>({
  // _v2: the v1 key holds the retired four-parameter ids. Unknown ids are
  // dropped on read, which would have left activeParameters empty and hidden
  // every tagged widget for anyone with persisted state — so start fresh.
  storageKey: "payment_terms_focus_params_v2",
  allParameterIds: ALL_PARAMETER_IDS,
  widgetTags: PT_WIDGET_TAGS,
});
