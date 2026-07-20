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
      "Days Payable Outstanding (DPO) tracking and payment term distribution by supplier.",
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
