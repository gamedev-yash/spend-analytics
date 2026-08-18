"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Matches the old `w-16` rail — the collapsed sidebar is not resizable. */
export const SIDEBAR_COLLAPSED_WIDTH = 64;
/** Matches the old `w-60`, so an unresized sidebar looks exactly as before. */
export const SIDEBAR_DEFAULT_WIDTH = 240;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 420;

/** Arrow-key step for the keyboard-accessible resize handle. */
export const SIDEBAR_RESIZE_STEP = 16;

const STORAGE_KEY = "app_sidebar_width";

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

/*
 * Module-level store rather than component state seeded from a
 * read-on-mount effect — same approach as components/dashboard/use-focus-store.ts,
 * and for the same two reasons: localStorage does not exist during SSR, and
 * setState-in-an-effect is a cascading render (the repo lints it as an error).
 * useSyncExternalStore serves SIDEBAR_DEFAULT_WIDTH for the server/hydration
 * pass, then swaps in the persisted value on the first client snapshot.
 */
const listeners = new Set<() => void>();
let cachedWidth: number | null = null;

function readStoredWidth(): number {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return SIDEBAR_DEFAULT_WIDTH;
    const parsed = Number.parseInt(stored, 10);
    return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    // localStorage can throw (disabled cookies / private mode) — the default
    // width is a perfectly good fallback.
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function getSnapshot(): number {
  if (cachedWidth === null) cachedWidth = readStoredWidth();
  return cachedWidth;
}

function getServerSnapshot(): number {
  return SIDEBAR_DEFAULT_WIDTH;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

/**
 * `persist: false` during a drag — a pointermove-rate localStorage write is
 * pure waste, so the drag end persists the settled value once.
 */
function commitWidth(next: number, persist: boolean) {
  cachedWidth = clampSidebarWidth(next);
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(cachedWidth));
    } catch {
      // A non-persisted width is still a working width.
    }
  }
  listeners.forEach((listener) => listener());
}

export interface SidebarWidthController {
  width: number;
  /** True for the duration of a pointer drag — callers disable width transitions while it holds. */
  isResizing: boolean;
  /** Pointer-down on the drag handle. */
  startResize: () => void;
  /** Keyboard/programmatic resize, e.g. arrow keys on the handle. */
  nudgeWidth: (delta: number) => void;
  resetWidth: () => void;
}

/**
 * Owns the user's chosen sidebar width, persisted to
 * localStorage['app_sidebar_width'].
 *
 * Called by DashboardShell rather than Sidebar because the width is needed in
 * two places: the sidebar's own box, and the main content's left padding (the
 * sidebar is `fixed`, so nothing reserves that space automatically). Sidebar
 * renders the drag handle and calls back into this.
 */
export function useSidebarWidth(): SidebarWidthController {
  const width = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isResizing, setIsResizing] = useState(false);

  /**
   * The sidebar is anchored at `left: 0`, so the pointer's viewport X *is* the
   * new width — no drag-origin offset to track, which also means the handle
   * can never drift away from the cursor over a long drag.
   */
  useEffect(() => {
    if (!isResizing) return;

    function handlePointerMove(event: PointerEvent) {
      commitWidth(event.clientX, false);
    }
    function stopResizing() {
      commitWidth(getSnapshot(), true);
      setIsResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    // Dragging sweeps the cursor across page content: without these, the drag
    // selects text and the cursor flickers between every element's own cursor
    // style and col-resize.
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [isResizing]);

  const startResize = useCallback(() => setIsResizing(true), []);
  const nudgeWidth = useCallback((delta: number) => commitWidth(getSnapshot() + delta, true), []);
  const resetWidth = useCallback(() => commitWidth(SIDEBAR_DEFAULT_WIDTH, true), []);

  return { width, isResizing, startResize, nudgeWidth, resetWidth };
}
