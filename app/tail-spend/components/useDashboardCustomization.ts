"use client";

import { useSyncExternalStore } from "react";
import { ALL_WIDGET_IDS, type WidgetId } from "./dashboardParams";
import { ALL_FOCUS_PARAMETER_IDS, FOCUS_PARAMETERS, type FocusParameterId } from "./focusParams";

const FOCUS_STORAGE_KEY = "tail_spend_focus_params";

interface FocusState {
  activeParameters: FocusParameterId[];
  disabledWidgets: WidgetId[];
}

const DEFAULT_FOCUS_STATE: FocusState = {
  activeParameters: ALL_FOCUS_PARAMETER_IDS,
  disabledWidgets: [],
};

function isFocusParameterId(value: unknown): value is FocusParameterId {
  return typeof value === "string" && (ALL_FOCUS_PARAMETER_IDS as string[]).includes(value);
}

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === "string" && (ALL_WIDGET_IDS as string[]).includes(value);
}

function readStoredFocusState(): FocusState {
  try {
    const raw = window.localStorage.getItem(FOCUS_STORAGE_KEY);
    if (raw === null) return DEFAULT_FOCUS_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_FOCUS_STATE;
    const record = parsed as Record<string, unknown>;
    return {
      activeParameters: Array.isArray(record.activeParameters)
        ? record.activeParameters.filter(isFocusParameterId)
        : ALL_FOCUS_PARAMETER_IDS,
      disabledWidgets: Array.isArray(record.disabledWidgets)
        ? record.disabledWidgets.filter(isWidgetId)
        : [],
    };
  } catch {
    return DEFAULT_FOCUS_STATE;
  }
}

// Module-level store shared by every useDashboardCustomization() call, so the
// localStorage read only ever happens once per page load (useSyncExternalStore
// requires getSnapshot to return a referentially stable value between calls).
const listeners = new Set<() => void>();
let cachedSnapshot: FocusState | null = null;

function getSnapshot(): FocusState {
  if (cachedSnapshot === null) {
    cachedSnapshot = readStoredFocusState();
  }
  return cachedSnapshot;
}

function getServerSnapshot(): FocusState {
  return DEFAULT_FOCUS_STATE;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function commit(next: FocusState) {
  cachedSnapshot = next;
  window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

/**
 * Tail Spend dashboard visibility, persisted to localStorage under one key
 * as { activeParameters, disabledWidgets } — two independent layers:
 *
 * - activeParameters: the Focus Parameter bar. A widget renders if it has no
 *   tags (cross-cutting, always shown) or at least one of its tags is active.
 * - disabledWidgets: the advanced Customize drawer override. Always wins —
 *   a manually-disabled widget stays hidden regardless of active parameters.
 *
 * Backed by useSyncExternalStore rather than a read-on-mount effect: the
 * server snapshot is always the default (matching prerendered HTML), and
 * React swaps in the real localStorage value right after hydration without
 * needing a setState-in-effect.
 */
export function useDashboardCustomization() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function isParameterActive(parameterId: FocusParameterId): boolean {
    return state.activeParameters.includes(parameterId);
  }

  function toggleParameter(parameterId: FocusParameterId) {
    const current = getSnapshot();
    const activeParameters = current.activeParameters.includes(parameterId)
      ? current.activeParameters.filter((id) => id !== parameterId)
      : [...current.activeParameters, parameterId];
    commit({ ...current, activeParameters });
  }

  function applyPreset(parameterIds: FocusParameterId[]) {
    commit({ ...getSnapshot(), activeParameters: parameterIds });
  }

  function isWidgetEnabled(widgetId: WidgetId): boolean {
    return !state.disabledWidgets.includes(widgetId);
  }

  function toggleWidgetEnabled(widgetId: WidgetId) {
    const current = getSnapshot();
    const disabledWidgets = current.disabledWidgets.includes(widgetId)
      ? current.disabledWidgets.filter((id) => id !== widgetId)
      : [...current.disabledWidgets, widgetId];
    commit({ ...current, disabledWidgets });
  }

  function resetWidgetsToDefault() {
    commit({ ...getSnapshot(), disabledWidgets: [] });
  }

  function isWidgetVisible(widgetId: WidgetId): boolean {
    if (state.disabledWidgets.includes(widgetId)) return false;
    const tags = FOCUS_PARAMETERS.filter((parameter) => (parameter.widgetIds as readonly WidgetId[]).includes(widgetId));
    if (tags.length === 0) return true;
    return tags.some((parameter) => state.activeParameters.includes(parameter.id));
  }

  return {
    activeParameters: state.activeParameters,
    isParameterActive,
    toggleParameter,
    applyPreset,
    isWidgetEnabled,
    toggleWidgetEnabled,
    resetWidgetsToDefault,
    isWidgetVisible,
  };
}
