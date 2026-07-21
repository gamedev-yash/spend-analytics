"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

const PEEK_DELAY_MS = 350;

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * `collapsed` is the pinned state the toggle button controls; `peeking` is
 * ephemeral hover UI layered on top of it. While pinned collapsed, hovering
 * for PEEK_DELAY_MS visually expands the sidebar as an absolutely-positioned
 * overlay so it never touches DashboardShell's pl-16/pl-60 — the reflow that
 * pinning is meant to avoid.
 */
export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const [peeking, setPeeking] = useState(false);
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current);
    };
  }, []);

  function handleMouseEnter() {
    if (!collapsed) return;
    peekTimeoutRef.current = setTimeout(() => setPeeking(true), PEEK_DELAY_MS);
  }

  function handleMouseLeave() {
    if (peekTimeoutRef.current) {
      clearTimeout(peekTimeoutRef.current);
      peekTimeoutRef.current = null;
    }
    setPeeking(false);
  }

  // Reset peek state on the click itself (not a prop-change effect) so
  // re-collapsing while the mouse is still over the sidebar always requires
  // a fresh PEEK_DELAY_MS hover, same as any other collapse.
  function handleToggleCollapsed() {
    setPeeking(false);
    onToggleCollapsed();
  }

  const isPeeking = collapsed && peeking;
  const showExpanded = !collapsed || peeking;

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "inset-y-0 left-0 flex flex-col overflow-hidden border-r border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900",
        isPeeking ? "absolute z-40 shadow-2xl" : "fixed z-20",
        showExpanded ? "w-60" : "w-16"
      )}
    >
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-4 dark:border-slate-800">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          P
        </div>
        {showExpanded && (
          <span className="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Procurement Analytics
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname?.startsWith(item.href) ?? false;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={!showExpanded ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                !showExpanded && "justify-center px-0",
                isActive
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {showExpanded && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={handleToggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={!showExpanded ? (collapsed ? "Expand sidebar" : "Collapse sidebar") : undefined}
        className={cn(
          "flex items-center gap-2 border-t border-slate-200 px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
          !showExpanded && "justify-center px-0"
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4 shrink-0" />
        ) : (
          <PanelLeftClose className="h-4 w-4 shrink-0" />
        )}
        {showExpanded && <span>{collapsed ? "Expand" : "Collapse"}</span>}
      </button>

      {showExpanded && (
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
          v0.1.0 · Internal Build
        </div>
      )}
    </aside>
  );
}
