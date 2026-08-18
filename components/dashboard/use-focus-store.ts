"use client";

import { useSyncExternalStore } from "react";

export interface FocusStoreConfig<ParamId extends string, WidgetId extends string> {
  storageKey: string;
  allParameterIds: readonly ParamId[];
  /** Every widget's parameter tags, including an empty array for cross-cutting widgets that always render. */
  widgetTags: Record<WidgetId, readonly ParamId[]>;
}

interface FocusState<ParamId extends string> {
  activeParameters: ParamId[];
}

/**
 * Factory for a page's Focus Parameter visibility store. Call once per page at
 * module scope (e.g. `export const useXFocus =
 * createDashboardFocusHook({...})`) — the returned hook shares one
 * localStorage-backed store across every component that calls it, which is
 * what lets two routes registered under one conceptual page (e.g. Spend
 * Overview's Summary and Compliance tabs) share one focus state.
 *
 * Persists `{ activeParameters }` as one JSON blob: a widget renders if it has
 * no tags (cross-cutting) or at least one of its tags is active.
 *
 * Stored blobs written before the Customize View drawer was removed also carry
 * a `disabledWidgets` array. It is deliberately ignored on read rather than
 * migrated away — the feature is gone, so a widget somebody once hid there
 * should come back rather than stay invisible with no control to restore it.
 *
 * Backed by useSyncExternalStore rather than a read-on-mount effect: the
 * server snapshot is always "everything active" (matching prerendered HTML),
 * and React swaps in the real localStorage value right after hydration
 * without needing a setState-in-effect.
 */
export function createDashboardFocusHook<ParamId extends string, WidgetId extends string>(
  config: FocusStoreConfig<ParamId, WidgetId>
) {
  const { storageKey, allParameterIds, widgetTags } = config;

  function isParamId(value: unknown): value is ParamId {
    return typeof value === "string" && (allParameterIds as readonly string[]).includes(value);
  }

  const defaultState: FocusState<ParamId> = {
    activeParameters: [...allParameterIds],
  };

  function readStored(): FocusState<ParamId> {
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
  let cachedSnapshot: FocusState<ParamId> | null = null;

  function getSnapshot(): FocusState<ParamId> {
    if (cachedSnapshot === null) {
      cachedSnapshot = readStored();
    }
    return cachedSnapshot;
  }

  function getServerSnapshot(): FocusState<ParamId> {
    return defaultState;
  }

  function subscribe(onStoreChange: () => void) {
    listeners.add(onStoreChange);
    return () => listeners.delete(onStoreChange);
  }

  function commit(next: FocusState<ParamId>) {
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

    function isWidgetVisible(widgetId: WidgetId): boolean {
      const tags = widgetTags[widgetId];
      if (!tags || tags.length === 0) return true;
      return tags.some((tag) => state.activeParameters.includes(tag));
    }

    return {
      activeParameters: state.activeParameters,
      isParameterActive,
      toggleParameter,
      applyPreset,
      isWidgetVisible,
    };
  };
}
