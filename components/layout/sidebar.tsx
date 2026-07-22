"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftClose } from "lucide-react";
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
      className={cn(
        "inset-y-0 left-0 flex flex-col overflow-hidden border-r border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900",
        isPeeking ? "absolute z-40 shadow-2xl" : "fixed z-20",
        showExpanded ? "w-60" : "w-16"
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-slate-200 px-4 dark:border-slate-800",
          showExpanded && "gap-2.5"
        )}
      >
        {/*
          Logo and the collapsed-state expand-toggle share one 8x8 slot,
          cross-fading via opacity so the swap is smooth instead of an
          instant pop; tabIndex/pointer-events keep the hidden one inert.
        */}
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          <div
            aria-hidden={!showExpanded}
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white transition-opacity duration-300 dark:bg-slate-100 dark:text-slate-900",
              showExpanded ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            P
          </div>
          {/*
            Idle, this button looks identical to the logo above it (same "P"
            mark) — hovering swaps it to the PanelLeft affordance via
            group-hover, so the click target only reveals itself as
            interactive on intent, not permanently replacing the brand mark.
          */}
          <button
            type="button"
            onClick={handleToggleCollapsed}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            tabIndex={showExpanded ? -1 : 0}
            className={cn(
              "group absolute inset-0 flex items-center justify-center rounded-md transition-opacity duration-300",
              showExpanded ? "pointer-events-none opacity-0" : "opacity-100"
            )}
          >
            <span className="absolute inset-0 flex items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white transition-opacity duration-150 group-hover:opacity-0 dark:bg-slate-100 dark:text-slate-900">
              P
            </span>
            <PanelLeft className="h-4 w-4 text-slate-500 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-slate-400" />
          </button>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 overflow-hidden transition-all duration-300",
            showExpanded ? "flex-1 opacity-100" : "w-0 flex-none opacity-0"
          )}
        >
          <span className="flex-1 truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Procurement Analytics
          </span>
          <button
            type="button"
            onClick={handleToggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            tabIndex={showExpanded ? 0 : -1}
            className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/*
        Hover-peek timers live ONLY on this nav — not the aside, and
        deliberately not the header toggle above. Scoping them here means
        hovering the Expand/Collapse button can never arm or race a peek
        timeout: the button's own click handler is the only thing that ever
        changes `collapsed`, so pin/unpin stays instant regardless of hover.
      */}
      <nav
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="flex-1 space-y-1 px-3 py-4"
      >
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

      {/*
        Always mounted (not conditionally rendered) so only opacity animates —
        whitespace-nowrap + overflow-hidden keep it single-line and clipped
        instead of wrapping while w-16/w-60 is mid-transition, which was
        producing a visible height jump. pointer-events-none while collapsed
        since it's clipped to nothing but still technically in the box.
      */}
      <div
        aria-hidden={!showExpanded}
        className={cn(
          "overflow-hidden whitespace-nowrap border-t border-slate-200 px-4 py-3 text-xs text-slate-400 transition-opacity duration-200 dark:border-slate-800 dark:text-slate-500",
          showExpanded ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        v0.1.0 · Internal Build
      </div>
    </aside>
  );
}
