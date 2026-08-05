// Shared by both the client-side DashboardAssistant (to know which dashboard
// it's on, and where the *other* dashboards live for redirects) and the
// server-side dashboard-context builder. No data here — just routing/labels —
// so this file is safe to import from "use client" components.

export type DashboardKey =
  | "spend-overview"
  | "compliance"
  | "payment-terms"
  | "tail-spend"
  | "supplier-fragmentation"
  | "single-source-risk";

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
    description: "Total spend, YTD trends, and category/entity breakdowns across the procurement portfolio.",
  },
  {
    key: "compliance",
    label: "Compliance",
    route: "/compliance",
    description:
      "Unmanaged (off-PO + off-contract) spend: headline KPIs and breakdowns by category, supplier, and business unit.",
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
  {
    key: "single-source-risk",
    label: "Single Source Risk",
    route: "/single-source-risk",
    description:
      "Categories dependent on too few distinct suppliers, and the product/plant/supplier exposure behind them.",
  },
];

export function dashboardKeyForPathname(pathname: string): DashboardKey | null {
  const found = DASHBOARD_REGISTRY.find((d) => pathname.startsWith(d.route));
  return found ? found.key : null;
}

export function dashboardMeta(key: DashboardKey): DashboardMeta {
  const meta = DASHBOARD_REGISTRY.find((d) => d.key === key);
  if (!meta) throw new Error(`Unknown dashboard key: ${key}`);
  return meta;
}
