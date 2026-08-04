import { Gauge, Layers, Users } from "lucide-react";
import type { CustomizeWidgetGroupDef } from "@/components/dashboard/customize-view-drawer";
import type { FocusParameterDef } from "@/components/dashboard/focus-parameter-bar";

export type PaymentTermsFocusId = "term-mix" | "payment-performance" | "supplier-view";

/**
 * Three sections, each owning its widgets exclusively — see PT_WIDGET_TAGS.
 *
 * Replaces the earlier four-way split (Term Distribution / Working Capital /
 * Compliance & Risk / Supplier Impact), where tags had to overlap because no
 * widget belonged to Working Capital or Compliance & Risk alone. Overlapping
 * tags made those two chips no-ops: switching one off left its widgets on
 * screen, held by the other tag. "Working Capital" and "Compliance & Risk"
 * are merged here because on this dashboard both resolve to the same single
 * signal — actual paid days vs. the term's nominal days.
 */
export const PT_FOCUS_PARAMETERS: FocusParameterDef<PaymentTermsFocusId>[] = [
  {
    id: "term-mix",
    label: "Term Mix",
    description: "How spend and invoice volume split across payment terms and categories",
    icon: Layers,
  },
  {
    id: "payment-performance",
    label: "Payment Performance",
    description: "Spend by term against average paid days vs. nominal days",
    icon: Gauge,
  },
  {
    id: "supplier-view",
    label: "Supplier View",
    description: "Term spread per supplier, plus the supplier-level detail report",
    icon: Users,
  },
];

export type PaymentTermsWidgetId =
  | "kpi-ribbon"
  | "category-chart"
  | "supplier-chart"
  | "combo-chart"
  | "invoice-count-chart"
  | "detail-table";

/**
 * Untagged (`[]`) means cross-cutting — always rendered regardless of which
 * sections are active, switchable only via the Customize View drawer. The KPI
 * ribbon is untagged because both remaining stats are referenced by every
 * section rather than belonging to one.
 */
export const PT_WIDGET_TAGS: Record<PaymentTermsWidgetId, PaymentTermsFocusId[]> = {
  "kpi-ribbon": [],
  "category-chart": ["term-mix"],
  "invoice-count-chart": ["term-mix"],
  "combo-chart": ["payment-performance"],
  "supplier-chart": ["supplier-view"],
  "detail-table": ["supplier-view"],
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
      { id: "invoice-count-chart", label: "Payment Terms by Invoice Count" },
      { id: "combo-chart", label: "Spend by Term & Avg. Paid Days" },
      { id: "supplier-chart", label: "Payment Terms by Supplier" },
    ],
  },
  {
    id: "tables",
    title: "Tables",
    widgets: [{ id: "detail-table", label: "Detail Report Table" }],
  },
];
