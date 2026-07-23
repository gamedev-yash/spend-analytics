"use client";

import { useSyncExternalStore } from "react";
import { SF_WIDGET_TAGS, type SfFocusId, type SfWidgetId } from "./focusParams";

const STORAGE_KEY = "supplier_fragmentation_focus_params";
const ALL_PARAMETER_IDS: SfFocusId[] = ["fragmentation", "concentration", "single-use", "duplicates"];

function isFocusId(value: unknown): value is SfFocusId {
  return typeof value === "string" && (ALL_PARAMETER_IDS as string[]).includes(value);
}

function readStored(): SfFocusId[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return ALL_PARAMETER_IDS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ALL_PARAMETER_IDS;
    return parsed.filter(isFocusId);
  } catch {
    return ALL_PARAMETER_IDS;
  }
}

const listeners = new Set<() => void>();
let cachedSnapshot: SfFocusId[] | null = null;

function getSnapshot(): SfFocusId[] {
  if (cachedSnapshot === null) {
    cachedSnapshot = readStored();
  }
  return cachedSnapshot;
}

function getServerSnapshot(): SfFocusId[] {
  return ALL_PARAMETER_IDS;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function commit(next: SfFocusId[]) {
  cachedSnapshot = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

/**
 * Focus-parameter-driven widget visibility for Supplier Fragmentation,
 * persisted to localStorage. Same useSyncExternalStore pattern as
 * app/tail-spend/components/useDashboardCustomization.ts — the server
 * snapshot is always "all active" (matching prerendered HTML), and React
 * swaps in the real localStorage value right after hydration.
 */
export function useSupplierFocus() {
  const activeParameters = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggleParameter(parameterId: SfFocusId) {
    const current = getSnapshot();
    commit(
      current.includes(parameterId) ? current.filter((id) => id !== parameterId) : [...current, parameterId]
    );
  }

  function applyPreset(parameterIds: SfFocusId[]) {
    commit(parameterIds);
  }

  function isVisible(widgetId: SfWidgetId): boolean {
    return SF_WIDGET_TAGS[widgetId].some((tag) => activeParameters.includes(tag));
  }

  return { activeParameters, toggleParameter, applyPreset, isVisible };
}
