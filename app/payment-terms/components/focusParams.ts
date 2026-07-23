import { Banknote, Layers, ShieldAlert, Users } from "lucide-react";
import type { CustomizeWidgetGroupDef } from "@/components/dashboard/customize-view-drawer";
import type { FocusParameterDef, FocusPresetDef } from "@/components/dashboard/focus-parameter-bar";

export type PaymentTermsFocusId = "term-distribution" | "working-capital" | "compliance-risk" | "supplier-impact";

export const PT_FOCUS_PARAMETERS: FocusParameterDef<PaymentTermsFocusId>[] = [
  {
    id: "term-distribution",
    label: "Term Distribution",
    description: "Standard vs. non-standard term breakdown, DPO metrics",
    icon: Layers,
  },
  {
    id: "working-capital",
    label: "Working Capital",
    description: "Discount capture potential, cash flow impact charts",
    icon: Banknote,
  },
  {
    id: "compliance-risk",
    label: "Compliance & Risk",
    description: "Term adherence, overdue payment risk",
    icon: ShieldAlert,
  },
  {
    id: "supplier-impact",
    label: "Supplier Impact",
    description: "Top supplier payment terms table/cards",
    icon: Users,
  },
];

export const PT_FOCUS_PRESETS: FocusPresetDef<PaymentTermsFocusId>[] = [
  {
    id: "all",
    label: "All Parameters",
    parameterIds: ["term-distribution", "working-capital", "compliance-risk", "supplier-impact"],
  },
  { id: "cash-flow-focus", label: "Cash Flow Focus", parameterIds: ["working-capital", "compliance-risk"] },
  { id: "term-overview", label: "Term Overview", parameterIds: ["term-distribution", "supplier-impact"] },
];

/**
 * No existing widget is purely "Working Capital" or "Compliance & Risk" in
 * isolation — the combo chart (spend + avg paid days vs. nominal days per
 * term) is the closest fit for both, since the nominal-vs-actual gap it
 * plots IS the term-adherence signal, and avg paid days is the cash-flow
 * angle. Tagged under both so neither chip is a no-op.
 */
export type PaymentTermsWidgetId =
  | "kpi-ribbon"
  | "category-chart"
  | "supplier-chart"
  | "combo-chart"
  | "invoice-count-chart"
  | "detail-table";

export const PT_WIDGET_TAGS: Record<PaymentTermsWidgetId, PaymentTermsFocusId[]> = {
  "kpi-ribbon": ["term-distribution", "working-capital"],
  "category-chart": ["term-distribution"],
  "supplier-chart": ["supplier-impact"],
  "combo-chart": ["working-capital", "compliance-risk"],
  "invoice-count-chart": ["term-distribution"],
  "detail-table": ["supplier-impact"],
};

export const PT_WIDGET_GROUPS: CustomizeWidgetGroupDef<PaymentTermsWidgetId>[] = [
  {
    id: "kpis",
    title: "KPIs",
    widgets: [{ id: "kpi-ribbon", label: "Payment Terms KPI Ribbon" }],
  },
  {
    id: "charts",
    title: "Charts",
    widgets: [
      { id: "category-chart", label: "Payment Terms by Category" },
      { id: "supplier-chart", label: "Payment Terms by Supplier" },
      { id: "combo-chart", label: "Spend by Term & Avg. Paid Days" },
      { id: "invoice-count-chart", label: "Payment Terms by Invoice Count" },
    ],
  },
  {
    id: "tables",
    title: "Tables",
    widgets: [{ id: "detail-table", label: "Detail Report Table" }],
  },
];
