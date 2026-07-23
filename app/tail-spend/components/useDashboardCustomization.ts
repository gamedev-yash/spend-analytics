"use client";

import { useSyncExternalStore } from "react";
import { ALL_WIDGET_IDS, DASHBOARD_PARAMS_STORAGE_KEY, type WidgetId } from "./dashboardParams";

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === "string" && (ALL_WIDGET_IDS as string[]).includes(value);
}

function readStoredVisibleParams(): WidgetId[] {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_PARAMS_STORAGE_KEY);
    if (raw === null) return ALL_WIDGET_IDS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ALL_WIDGET_IDS;
    return parsed.filter(isWidgetId);
  } catch {
    return ALL_WIDGET_IDS;
  }
}

// Module-level store shared by every useDashboardCustomization() call, so the
// localStorage read only ever happens once per page load (useSyncExternalStore
// requires getSnapshot to return a referentially stable value between calls).
const listeners = new Set<() => void>();
let cachedSnapshot: WidgetId[] | null = null;

function getSnapshot(): WidgetId[] {
  if (cachedSnapshot === null) {
    cachedSnapshot = readStoredVisibleParams();
  }
  return cachedSnapshot;
}

function getServerSnapshot(): WidgetId[] {
  return ALL_WIDGET_IDS;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function commit(next: WidgetId[]) {
  cachedSnapshot = next;
  window.localStorage.setItem(DASHBOARD_PARAMS_STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

/**
 * Widget visibility for the Tail Spend dashboard, persisted to localStorage.
 *
 * Backed by useSyncExternalStore rather than a read-on-mount effect: the
 * server snapshot is always ALL_WIDGET_IDS (matching prerendered HTML), and
 * React swaps in the real localStorage value right after hydration without
 * needing a setState-in-effect.
 */
export function useDashboardCustomization() {
  const visibleParameters = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function isVisible(widgetId: WidgetId): boolean {
    return visibleParameters.includes(widgetId);
  }

  function toggleWidget(widgetId: WidgetId) {
    const current = getSnapshot();
    commit(current.includes(widgetId) ? current.filter((id) => id !== widgetId) : [...current, widgetId]);
  }

  function resetToDefault() {
    commit(ALL_WIDGET_IDS);
  }

  return { visibleParameters, isVisible, toggleWidget, resetToDefault };
}
