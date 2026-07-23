"use client";

import { useSyncExternalStore } from "react";

export interface FocusStoreConfig<ParamId extends string, WidgetId extends string> {
  storageKey: string;
  allParameterIds: readonly ParamId[];
  /** Every widget's parameter tags, including an empty array for cross-cutting widgets that should always render (subject only to the manual override). */
  widgetTags: Record<WidgetId, readonly ParamId[]>;
}

interface FocusState<ParamId extends string, WidgetId extends string> {
  activeParameters: ParamId[];
  disabledWidgets: WidgetId[];
}

/**
 * Factory for a page's Focus Parameter + Customize-drawer visibility store.
 * Call once per page at module scope (e.g. `export const useXFocus =
 * createDashboardFocusHook({...})`) — the returned hook shares one
 * localStorage-backed store across every component that calls it, which is
 * what lets two routes registered under one conceptual page (e.g. Spend
 * Overview's Summary and Compliance tabs) share one focus state.
 *
 * Persists `{ activeParameters, disabledWidgets }` as one JSON blob — same
 * shape as app/tail-spend/components/useDashboardCustomization.ts:
 * - activeParameters: the Focus Parameter bar. A widget renders if it has no
 *   tags (cross-cutting) or at least one tag is active.
 * - disabledWidgets: the Customize drawer override. Always wins — a
 *   manually-disabled widget stays hidden regardless of active parameters.
 *
 * Backed by useSyncExternalStore rather than a read-on-mount effect: the
 * server snapshot is always "everything active/enabled" (matching
 * prerendered HTML), and React swaps in the real localStorage value right
 * after hydration without needing a setState-in-effect.
 */
export function createDashboardFocusHook<ParamId extends string, WidgetId extends string>(
  config: FocusStoreConfig<ParamId, WidgetId>
) {
  const { storageKey, allParameterIds, widgetTags } = config;
  const allWidgetIds = Object.keys(widgetTags) as WidgetId[];

  function isParamId(value: unknown): value is ParamId {
    return typeof value === "string" && (allParameterIds as readonly string[]).includes(value);
  }

  function isWidgetId(value: unknown): value is WidgetId {
    return typeof value === "string" && allWidgetIds.includes(value as WidgetId);
  }

  const defaultState: FocusState<ParamId, WidgetId> = {
    activeParameters: [...allParameterIds],
    disabledWidgets: [],
  };

  function readStored(): FocusState<ParamId, WidgetId> {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) return defaultState;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return defaultState;
      const record = parsed as Record<string, unknown>;
      return {
        activeParameters: Array.isArray(record.activeParameters)
          ? record.activeParameters.filter(isParamId)
          : [...allParameterIds],
        disabledWidgets: Array.isArray(record.disabledWidgets)
          ? record.disabledWidgets.filter(isWidgetId)
          : [],
      };
    } catch {
      return defaultState;
    }
  }

  // Module-level store shared by every call to the returned hook, so the
  // localStorage read only ever happens once per page load
  // (useSyncExternalStore requires getSnapshot to return a referentially
  // stable value between calls).
  const listeners = new Set<() => void>();
  let cachedSnapshot: FocusState<ParamId, WidgetId> | null = null;

  function getSnapshot(): FocusState<ParamId, WidgetId> {
    if (cachedSnapshot === null) {
      cachedSnapshot = readStored();
    }
    return cachedSnapshot;
  }

  function getServerSnapshot(): FocusState<ParamId, WidgetId> {
    return defaultState;
  }

  function subscribe(onStoreChange: () => void) {
    listeners.add(onStoreChange);
    return () => listeners.delete(onStoreChange);
  }

  function commit(next: FocusState<ParamId, WidgetId>) {
    cachedSnapshot = next;
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    listeners.forEach((listener) => listener());
  }

  return function useDashboardFocus() {
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    function isParameterActive(parameterId: ParamId): boolean {
      return state.activeParameters.includes(parameterId);
    }

    function toggleParameter(parameterId: ParamId) {
      const current = getSnapshot();
      const activeParameters = current.activeParameters.includes(parameterId)
        ? current.activeParameters.filter((id) => id !== parameterId)
        : [...current.activeParameters, parameterId];
      commit({ ...current, activeParameters });
    }

    function applyPreset(parameterIds: ParamId[]) {
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
      const tags = widgetTags[widgetId];
      if (!tags || tags.length === 0) return true;
      return tags.some((tag) => state.activeParameters.includes(tag));
    }

    return {
      activeParameters: state.activeParameters,
      isParameterActive,
      toggleParameter,
      applyPreset,
      disabledWidgets: state.disabledWidgets,
      isWidgetEnabled,
      toggleWidgetEnabled,
      resetWidgetsToDefault,
      isWidgetVisible,
    };
  };
}
