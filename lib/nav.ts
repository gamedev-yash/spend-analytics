import {
  LayoutDashboard,
  Wallet,
  PackageSearch,
  Network,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  owner: string;
  description: string;
  /**
   * Set when a route renders its own dashboard-specific filter panel
   * (different filter set, real options) instead of the shared global
   * FilterBar — see components/layout/filter-bar.tsx.
   */
  hasCustomFilterPanel?: boolean;
}

/**
 * Single source of truth for the app's primary navigation.
 * Sidebar, TopHeader, and FeaturePlaceholder all read from this list —
 * add a route here once and it propagates everywhere.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Spend Overview",
    href: "/spend-overview",
    icon: LayoutDashboard,
    owner: "Shravani",
    description:
      "Total spend, YTD trends, and category/entity breakdowns across the procurement portfolio.",
  },
  {
    label: "Payment Terms",
    href: "/payment-terms",
    icon: Wallet,
    owner: "Varad",
    description:
      "Spend Assessment: payment term distribution, avg paid cycle days, and term fragmentation by category and supplier.",
    hasCustomFilterPanel: true,
  },
  {
    label: "Tail Spend",
    href: "/tail-spend",
    icon: PackageSearch,
    owner: "Chinmay Kotkar",
    description:
      "Invoice value buckets and 80/20 Pareto distribution to identify tail spend consolidation opportunities.",
  },
  {
    label: "Supplier Fragmentation",
    href: "/supplier-fragmentation",
    icon: Network,
    owner: "Anish",
    description:
      "Supplier counts, single-use suppliers, and concentration ratios by category.",
  },
];
