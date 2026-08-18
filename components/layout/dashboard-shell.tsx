"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopHeader } from "@/components/layout/top-header";
import { FilterBar } from "@/components/layout/filter-bar";
import { FilterSlotProvider } from "@/context/FilterContext";
import { SIDEBAR_COLLAPSED_WIDTH, useSidebarWidth } from "@/hooks/use-sidebar-width";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: ReactNode;
}

/**
 * Single layout wrapper shared by every route: collapsible sidebar, sticky top
 * header, and the toggleable global filter panel. Routes only ever render
 * their own page content — no page re-implements this chrome.
 *
 * FilterSlotProvider wraps both FilterBar (the reader) and `children` (the
 * page, which registers via useFilterSlot) so a route's registered filters
 * render in the drawer. `children` is a prop DashboardShell receives rather
 * than creates, so this component's own state (sidebarCollapsed,
 * filtersVisible, the sidebar width) — and the provider's state —
 * re-rendering never forces the page itself to re-render, which is what keeps
 * filter registration from looping back on the page that registered it. It is
 * also what makes a drag-resize cheap: the width changes every pointermove
 * frame, and only this shell re-renders.
 */
export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const sidebar = useSidebarWidth();

  return (
    <FilterSlotProvider>
      <div className="min-h-screen bg-slate-50 transition-colors duration-200 ease-in-out dark:bg-slate-950">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          width={sidebar.width}
          isResizing={sidebar.isResizing}
          onStartResize={sidebar.startResize}
          onNudgeWidth={sidebar.nudgeWidth}
          onResetWidth={sidebar.resetWidth}
        />
        {/*
          The sidebar is `fixed`, so nothing reserves its space — this padding
          is what keeps content clear of it, and it has to track the dragged
          width rather than a static pl-60.
        */}
        <div
          style={{ paddingLeft: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebar.width }}
          className={cn(!sidebar.isResizing && "transition-[padding] duration-300")}
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
    </FilterSlotProvider>
  );
}
