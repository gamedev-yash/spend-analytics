"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeft, PanelLeftClose, Search, Sparkles, Trash2 } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { useGeneratedDashboards, deleteGeneratedDashboard } from "@/lib/generated-dashboard/store";
import { GenerateDashboardButton } from "@/components/generated-dashboard/generate-dashboard-dialog";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_RESIZE_STEP,
} from "@/hooks/use-sidebar-width";
import { cn } from "@/lib/utils";

const PEEK_DELAY_MS = 350;

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Current pinned-expanded width in px — owned by DashboardShell, which also pads the content by it. */
  width: number;
  isResizing: boolean;
  onStartResize: () => void;
  onNudgeWidth: (delta: number) => void;
  onResetWidth: () => void;
}

/**
 * One row in the "Generated Dashboards" list — a link plus a hover-revealed
 * delete button.
 */
function DashboardNavItem({
  href,
  title,
  icon,
  isActive,
  showExpanded,
  onDelete,
}: {
  href: string;
  title: string;
  icon: ReactNode;
  isActive: boolean;
  showExpanded: boolean;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center rounded-md transition-colors",
        isActive ? "bg-slate-900 dark:bg-slate-100" : "hover:bg-slate-100 dark:hover:bg-slate-800"
      )}
    >
      <Link
        href={href}
        title={title}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm font-medium",
          !showExpanded && "justify-center px-0",
          isActive ? "text-white dark:text-slate-900" : "text-slate-600 dark:text-slate-400"
        )}
      >
        {icon}
        {showExpanded && <span className="truncate">{title}</span>}
      </Link>
      {showExpanded && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${title}`}
          title="Delete dashboard"
          className={cn(
            "mr-1 shrink-0 rounded p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
            isActive
              ? "text-white/70 hover:bg-white/10 hover:text-white dark:text-slate-900/70 dark:hover:bg-black/10 dark:hover:text-slate-900"
              : "text-slate-400 hover:bg-slate-200 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-rose-400"
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * `collapsed` is the pinned state the toggle button controls; `peeking` is
 * ephemeral hover UI layered on top of it. While pinned collapsed, hovering
 * for PEEK_DELAY_MS visually expands the sidebar without touching
 * DashboardShell's content padding — the reflow that pinning is meant to
 * avoid.
 *
 * The peek overlay stays `fixed` (only its z-index and shadow change) rather
 * than switching to `absolute`. Nothing in the ancestor chain is positioned,
 * so an `absolute inset-y-0` sidebar resolves against the *document* instead
 * of the viewport: on a scrolled page it scrolled away with the content,
 * clipping its own header off the top and ending partway down the screen.
 */
export function Sidebar({
  collapsed,
  onToggleCollapsed,
  width,
  isResizing,
  onStartResize,
  onNudgeWidth,
  onResetWidth,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const generatedDashboards = useGeneratedDashboards();
  const [peeking, setPeeking] = useState(false);
  const [dashboardQuery, setDashboardQuery] = useState("");
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredDashboards = useMemo(() => {
    const query = dashboardQuery.trim().toLowerCase();
    if (!query) return generatedDashboards;
    return generatedDashboards.filter((dashboard) => dashboard.title.toLowerCase().includes(query));
  }, [generatedDashboards, dashboardQuery]);

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

  function handleResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    // Suppress the native drag/text-selection gesture so the pointermove
    // stream belongs entirely to the resize.
    event.preventDefault();
    onStartResize();
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onNudgeWidth(-SIDEBAR_RESIZE_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onNudgeWidth(SIDEBAR_RESIZE_STEP);
    } else if (event.key === "Home") {
      event.preventDefault();
      onResetWidth();
    }
  }

  const isPeeking = collapsed && peeking;
  const showExpanded = !collapsed || peeking;
  // The collapsed rail is a fixed icon strip — only the pinned-expanded
  // sidebar honours the user's dragged width.
  const currentWidth = showExpanded ? width : SIDEBAR_COLLAPSED_WIDTH;

  return (
    <aside
      style={{ width: currentWidth }}
      className={cn(
        "fixed inset-y-0 left-0 flex flex-col overflow-hidden border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
        isPeeking ? "z-40 shadow-2xl" : "z-20",
        // Animating width would fight the pointer during a drag, lagging the
        // edge behind the cursor.
        !isResizing && "transition-[width,box-shadow] duration-300"
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
          <span
            title="Procurement Analytics"
            className="flex-1 truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100"
          >
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
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname?.startsWith(item.href) ?? false;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              // Always titled, not just when collapsed: the expanded labels
              // are `truncate`d too, so a narrow sidebar clips them just as
              // thoroughly as the icon rail hides them.
              title={item.label}
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

        {/*
          Create entry point stays first and fixed — the search bar and list
          render below it, so an unbounded/filtered list can never push the
          button around. The list itself still scrolls within its own capped
          box so it can't push anything else off the bottom either.
        */}
        <div className="pt-3">
          {showExpanded && (
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Generated Dashboards
            </p>
          )}
          <div className="space-y-1">
            <GenerateDashboardButton variant="nav" collapsed={!showExpanded} />

            {showExpanded && generatedDashboards.length > 0 && (
              <label className="relative block px-0 pt-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="search"
                  value={dashboardQuery}
                  onChange={(e) => setDashboardQuery(e.target.value)}
                  placeholder="Search dashboards"
                  aria-label="Search generated dashboards"
                  className="w-full rounded-md border border-slate-200 bg-white py-1.5 pr-2.5 pl-8 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-slate-500"
                />
              </label>
            )}

            {generatedDashboards.length > 0 && (
              <div className="max-h-56 space-y-1 overflow-y-auto overscroll-contain">
                {(showExpanded ? filteredDashboards : generatedDashboards).length > 0 ? (
                  (showExpanded ? filteredDashboards : generatedDashboards).map((dashboard) => {
                    const href = `/generated/${dashboard.id}`;
                    const isActive = pathname === href;
                    return (
                      <DashboardNavItem
                        key={dashboard.id}
                        href={href}
                        title={dashboard.title}
                        icon={<Sparkles className="h-4 w-4 shrink-0" />}
                        isActive={isActive}
                        showExpanded={showExpanded}
                        onDelete={() => {
                          if (window.confirm(`Delete "${dashboard.title}"? This cannot be undone.`)) {
                            deleteGeneratedDashboard(dashboard.id);
                            if (isActive) router.push("/");
                          }
                        }}
                      />
                    );
                  })
                ) : showExpanded ? (
                  <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                    No dashboards match &quot;{dashboardQuery}&quot;.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/*
        Always mounted (not conditionally rendered) so only opacity animates —
        whitespace-nowrap + overflow-hidden keep it single-line and clipped
        instead of wrapping while the width is mid-transition, which was
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

      {/*
        Drag handle for the sidebar width. Only offered while pinned expanded:
        the collapsed rail is a fixed-width icon strip, and resizing the peek
        overlay would set a width the user cannot see applied.
      */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuenow={width}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          tabIndex={0}
          onPointerDown={handleResizePointerDown}
          onDoubleClick={onResetWidth}
          onKeyDown={handleResizeKeyDown}
          title="Drag to resize · double-click to reset"
          className="group absolute inset-y-0 right-0 z-10 flex w-2 cursor-col-resize touch-none justify-end focus:outline-none"
        >
          <span
            aria-hidden
            className={cn(
              "h-full w-0.5 transition-colors group-hover:bg-slate-300 group-focus-visible:bg-slate-400 dark:group-hover:bg-slate-600 dark:group-focus-visible:bg-slate-500",
              isResizing ? "bg-slate-400 dark:bg-slate-500" : "bg-transparent"
            )}
          />
        </div>
      )}
    </aside>
  );
}
