"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/spend-overview", label: "Summary" },
  { href: "/spend-overview/compliance", label: "Compliance" },
];

/**
 * Sub-navigation between the two Spend Overview dashboards. Kept separate
 * from the primary Sidebar (lib/nav.ts) since both routes share one nav item.
 * The active pill slides between tabs via a shared layoutId.
 */
export function DashboardTabs() {
  const pathname = usePathname();

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="dashboard-tab-pill"
                className="absolute inset-0 rounded-md bg-background shadow-sm"
                transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
              />
            )}
            <span className="relative">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
