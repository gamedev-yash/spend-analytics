// Shared by both the client-side DashboardAssistant (to know which dashboard
// it's on, and where the *other* dashboards live for redirects) and the
// server-side dashboard-context builder. No data here — just routing/labels —
// so this file is safe to import from "use client" components.

export type DashboardKey =
  | "spend-overview"
  | "payment-terms"
  | "tail-spend"
  | "supplier-fragmentation";

export interface DashboardMeta {
  key: DashboardKey;
  label: string;
  route: string;
  description: string;
}

export const DASHBOARD_REGISTRY: DashboardMeta[] = [
  {
    key: "spend-overview",
    label: "Spend Overview",
    route: "/spend-overview",
    description:
      "Total spend, YTD trends, category/entity breakdowns, and contract/pricing/policy/approval/delivery compliance & risk.",
  },
  {
    key: "payment-terms",
    label: "Payment Terms",
    route: "/payment-terms",
    description:
      "Payment term distribution, average paid cycle days, and term fragmentation by category and supplier.",
  },
  {
    key: "tail-spend",
    label: "Tail Spend",
    route: "/tail-spend",
    description:
      "Invoice value buckets, 80/20 Pareto distribution, micro-PO analysis, and consolidation candidates.",
  },
  {
    key: "supplier-fragmentation",
    label: "Supplier Fragmentation",
    route: "/supplier-fragmentation",
    description: "Supplier counts, single-use/duplicate suppliers, and category concentration.",
  },
];

/** Matches "/spend-overview/compliance" to the "spend-overview" dashboard too. */
export function dashboardKeyForPathname(pathname: string): DashboardKey | null {
  const found = DASHBOARD_REGISTRY.find((d) => pathname.startsWith(d.route));
  return found ? found.key : null;
}

export function dashboardMeta(key: DashboardKey): DashboardMeta {
  const meta = DASHBOARD_REGISTRY.find((d) => d.key === key);
  if (!meta) throw new Error(`Unknown dashboard key: ${key}`);
  return meta;
}
