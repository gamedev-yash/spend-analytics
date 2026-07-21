import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopHeader } from "@/components/layout/top-header";
import { FilterBar } from "@/components/layout/filter-bar";

interface DashboardShellProps {
  children: ReactNode;
}

/**
 * Single layout wrapper shared by every route: fixed sidebar, sticky top
 * header, and the global filter panel. Routes only ever render their own
 * page content — no page re-implements this chrome.
 */
export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="pl-64">
        <TopHeader />
        <div className="flex">
          <FilterBar />
          <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
