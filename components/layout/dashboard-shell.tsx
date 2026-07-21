"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopHeader } from "@/components/layout/top-header";
import { FilterBar } from "@/components/layout/filter-bar";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: ReactNode;
}

/**
 * Single layout wrapper shared by every route: collapsible sidebar, sticky top
 * header, and the toggleable global filter panel. Routes only ever render
 * their own page content — no page re-implements this chrome.
 */
export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);

  return (
    <div className="min-h-screen bg-slate-50 transition-colors duration-200 ease-in-out dark:bg-slate-950">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
      />
      <div
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "pl-16" : "pl-60"
        )}
      >
        <TopHeader
          filtersVisible={filtersVisible}
          onToggleFilters={() => setFiltersVisible((v) => !v)}
        />
        <div className="flex">
          <FilterBar visible={filtersVisible} />
          <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
