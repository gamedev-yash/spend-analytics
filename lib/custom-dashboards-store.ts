"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { CustomDashboard, WidgetConfig } from "@/types/custom-dashboard";

// localStorage-backed store for user-built dashboards. Same pattern as
// DatasetsContext/ThresholdsContext: state lives outside React and components
// subscribe via useSyncExternalStore, so the server snapshot is always empty
// (no hydration mismatch) and the client snapshot hydrates lazily on first read.

const STORAGE_KEY = "app_custom_dashboards";

const EMPTY: CustomDashboard[] = [];

let storeState: CustomDashboard[] | null = null;
const listeners = new Set<() => void>();

function isDashboard(value: unknown): value is CustomDashboard {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<CustomDashboard>;
  return typeof d.id === "string" && typeof d.title === "string" && Array.isArray(d.widgets);
}

function loadPersisted(): CustomDashboard[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isDashboard) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): CustomDashboard[] {
  if (storeState === null) storeState = loadPersisted();
  return storeState;
}

function getServerSnapshot(): CustomDashboard[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateStore(update: (prev: CustomDashboard[]) => CustomDashboard[]): void {
  storeState = update(getSnapshot());
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storeState));
  } catch (err) {
    console.warn("custom-dashboards-store: unable to persist dashboards", err);
  }
  for (const listener of listeners) listener();
}

export function newId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function touch(dashboard: CustomDashboard): CustomDashboard {
  return { ...dashboard, updatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Mutations (module-level so they're stable across renders)
// ---------------------------------------------------------------------------

export function createDashboard(params: {
  title: string;
  datasetId: string;
  widgets: WidgetConfig[];
}): CustomDashboard {
  const now = new Date().toISOString();
  const dashboard: CustomDashboard = {
    id: newId("dash"),
    title: params.title.trim() || "Untitled dashboard",
    datasetId: params.datasetId,
    widgets: params.widgets,
    createdAt: now,
    updatedAt: now,
  };
  updateStore((prev) => [...prev, dashboard]);
  return dashboard;
}

export function deleteDashboard(id: string): void {
  updateStore((prev) => prev.filter((d) => d.id !== id));
}

export function renameDashboard(id: string, title: string): void {
  updateStore((prev) =>
    prev.map((d) => (d.id === id ? touch({ ...d, title: title.trim() || d.title }) : d))
  );
}

export function addWidget(dashboardId: string, widget: WidgetConfig): void {
  updateStore((prev) =>
    prev.map((d) => (d.id === dashboardId ? touch({ ...d, widgets: [...d.widgets, widget] }) : d))
  );
}

export function updateWidget(dashboardId: string, widget: WidgetConfig): void {
  updateStore((prev) =>
    prev.map((d) =>
      d.id === dashboardId
        ? touch({ ...d, widgets: d.widgets.map((w) => (w.id === widget.id ? widget : w)) })
        : d
    )
  );
}

export function removeWidget(dashboardId: string, widgetId: string): void {
  updateStore((prev) =>
    prev.map((d) =>
      d.id === dashboardId ? touch({ ...d, widgets: d.widgets.filter((w) => w.id !== widgetId) }) : d
    )
  );
}

/**
 * Replace a dashboard's whole widget list in one write — restoring a saved
 * snapshot, where per-widget add/remove churn would persist (and re-render)
 * once per widget.
 */
export function replaceWidgets(dashboardId: string, widgets: WidgetConfig[]): void {
  updateStore((prev) =>
    prev.map((d) => (d.id === dashboardId ? touch({ ...d, widgets }) : d))
  );
}

/** Move a widget one slot earlier/later in the grid order. */
export function moveWidget(dashboardId: string, widgetId: string, direction: -1 | 1): void {
  updateStore((prev) =>
    prev.map((d) => {
      if (d.id !== dashboardId) return d;
      const index = d.widgets.findIndex((w) => w.id === widgetId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= d.widgets.length) return d;
      const widgets = [...d.widgets];
      [widgets[index], widgets[target]] = [widgets[target], widgets[index]];
      return touch({ ...d, widgets });
    })
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** All custom dashboards, newest last. Re-renders on any store change. */
export function useCustomDashboards(): CustomDashboard[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * One dashboard by id, or null while the store is still empty (server render
 * and the first client paint) or when the id doesn't exist.
 */
export function useCustomDashboard(id: string): CustomDashboard | null {
  const getById = useCallback(() => getSnapshot().find((d) => d.id === id) ?? null, [id]);
  const getServerById = useCallback(() => null, []);
  return useSyncExternalStore(subscribe, getById, getServerById);
}

/**
 * True once the client store has been read — lets pages distinguish "no such
 * dashboard" from "not hydrated yet" instead of flashing a not-found state.
 */
export function useDashboardsReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      getSnapshot();
      return true;
    },
    () => false
  );
}
