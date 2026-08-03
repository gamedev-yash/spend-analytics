"use client";

import { useCallback, useSyncExternalStore } from "react";
import type {
  DashboardPlan,
  GeneratedDashboard,
  WidgetSpec,
} from "@/types/generated-dashboard";
import type { DatasetProfile } from "@/types/dataset-profile";

// localStorage-backed store for AI-generated dashboards. Same
// useSyncExternalStore-over-a-module-singleton pattern used elsewhere in this
// app: state lives outside React, components subscribe for re-renders, and
// the server snapshot is always empty (no hydration mismatch). This store is
// independent of the manual "custom dashboards" builder — its own key, its
// own module, its own generated dashboards.

const STORAGE_KEY = "app_generated_dashboards";

const EMPTY: GeneratedDashboard[] = [];

let storeState: GeneratedDashboard[] | null = null;
const listeners = new Set<() => void>();

function isGeneratedDashboard(value: unknown): value is GeneratedDashboard {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<GeneratedDashboard>;
  return (
    typeof d.id === "string" &&
    typeof d.title === "string" &&
    Array.isArray(d.widgets) &&
    Array.isArray(d.rows)
  );
}

function loadPersisted(): GeneratedDashboard[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isGeneratedDashboard) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): GeneratedDashboard[] {
  if (storeState === null) storeState = loadPersisted();
  return storeState;
}

function getServerSnapshot(): GeneratedDashboard[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Persist, dropping the oldest dashboard and retrying on quota errors —
 * these dashboards embed full CSV rows, so they're far more likely to blow
 * localStorage's quota than the lightweight manual-builder dashboards.
 */
function persist(list: GeneratedDashboard[]): void {
  let toPersist = list;
  for (;;) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
      storeState = toPersist;
      return;
    } catch (err) {
      if (toPersist.length === 0) {
        console.warn("generated-dashboard/store: unable to persist even an empty list", err);
        storeState = toPersist;
        return;
      }
      console.warn(
        "generated-dashboard/store: localStorage quota exceeded, dropping oldest dashboard",
        err
      );
      toPersist = toPersist.slice(1);
    }
  }
}

function updateStore(update: (prev: GeneratedDashboard[]) => GeneratedDashboard[]): void {
  const next = update(getSnapshot());
  persist(next);
  for (const listener of listeners) listener();
}

export function newGeneratedDashboardId(prefix = "gen"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Mutations (module-level so they're stable across renders)
// ---------------------------------------------------------------------------

export function createGeneratedDashboard(params: {
  title: string;
  sourceFileName: string;
  profile: DatasetProfile;
  plan: DashboardPlan;
  widgets: WidgetSpec[];
  rows: Record<string, unknown>[];
  columns: string[];
}): GeneratedDashboard {
  const dashboard: GeneratedDashboard = {
    id: newGeneratedDashboardId("gen"),
    title: params.title.trim() || "Untitled dashboard",
    createdAt: new Date().toISOString(),
    sourceFileName: params.sourceFileName,
    profile: params.profile,
    plan: params.plan,
    widgets: params.widgets,
    rows: params.rows,
    columns: params.columns,
  };
  updateStore((prev) => [...prev, dashboard]);
  return dashboard;
}

export function deleteGeneratedDashboard(id: string): void {
  updateStore((prev) => prev.filter((d) => d.id !== id));
}

export function renameGeneratedDashboard(id: string, title: string): void {
  updateStore((prev) =>
    prev.map((d) => (d.id === id ? { ...d, title: title.trim() || d.title } : d))
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** All generated dashboards, newest last. Re-renders on any store change. */
export function useGeneratedDashboards(): GeneratedDashboard[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * One generated dashboard by id, or null while the store is still empty
 * (server render and the first client paint) or when the id doesn't exist.
 */
export function useGeneratedDashboard(id: string): GeneratedDashboard | null {
  const getById = useCallback(() => getSnapshot().find((d) => d.id === id) ?? null, [id]);
  const getServerById = useCallback(() => null, []);
  return useSyncExternalStore(subscribe, getById, getServerById);
}

/**
 * True once the client store has been read — lets pages distinguish "no such
 * dashboard" from "not hydrated yet" instead of flashing a not-found state.
 */
export function useGeneratedDashboardsReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      getSnapshot();
      return true;
    },
    () => false
  );
}
