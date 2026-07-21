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
    <div className="h-dvh overflow-hidden bg-background">
      <Sidebar />
      <div className="flex h-full flex-col pl-64">
        <TopHeader />
        <div className="flex min-h-0 flex-1">
          <FilterBar />
          {/* min-h-0 lets a page opt into filling this exactly (no scroll); overflow-y-auto is the
             safety net for pages/viewports where the content doesn't quite fit. */}
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
