"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { evaluateThreshold, type ThresholdConfig, type ThresholdStatus } from "@/types/thresholds";
import { THRESHOLD_PRESETS, presetById } from "@/lib/threshold-presets";

// ---------------------------------------------------------------------------
// User overrides on top of the presets, keyed by threshold id. Only adjusted
// numbers are stored — presets stay the source of truth for everything else.
// ---------------------------------------------------------------------------

interface ThresholdOverride {
  targetValue?: number;
  upperBound?: number;
}

type Overrides = Record<string, ThresholdOverride>;

interface ThresholdsContextValue {
  /** Preset merged with any user override. Null for unknown ids. */
  getThreshold: (id: string) => ThresholdConfig | null;
  /** All of a page's thresholds (presets + overrides applied). */
  thresholdsForPage: (pageKey: string) => ThresholdConfig[];
  /** Grade a live metric value against a threshold id. Null for unknown ids. */
  evaluate: (id: string, value: number) => ThresholdStatus | null;
  setTargetValue: (id: string, targetValue: number) => void;
  /** Upper bound of a 'between' target zone. Ignored by single-bound operators. */
  setUpperBound: (id: string, upperBound: number) => void;
  /** Drop overrides for one page's thresholds, reverting them to presets. */
  resetPage: (pageKey: string) => void;
  /** True when any of the page's thresholds differ from their preset. */
  pageHasOverrides: (pageKey: string) => boolean;
}

// ---------------------------------------------------------------------------
// localStorage-backed store (module singleton, same pattern as DatasetsContext:
// server snapshot is empty so SSR/hydration render preset values, then the
// client snapshot with persisted overrides takes over).
// ---------------------------------------------------------------------------

const STORAGE_KEY = "app_thresholds";

const EMPTY_OVERRIDES: Overrides = {};

let storeState: Overrides | null = null;
const listeners = new Set<() => void>();

function loadPersisted(): Overrides {
  if (typeof window === "undefined") return EMPTY_OVERRIDES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_OVERRIDES;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY_OVERRIDES;
    const overrides: Overrides = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const { targetValue, upperBound } = value as ThresholdOverride;
      const entry: ThresholdOverride = {};
      if (typeof targetValue === "number" && Number.isFinite(targetValue)) entry.targetValue = targetValue;
      if (typeof upperBound === "number" && Number.isFinite(upperBound)) entry.upperBound = upperBound;
      if (Object.keys(entry).length > 0) overrides[id] = entry;
    }
    return overrides;
  } catch {
    return EMPTY_OVERRIDES;
  }
}

function getSnapshot(): Overrides {
  if (storeState === null) storeState = loadPersisted();
  return storeState;
}

function getServerSnapshot(): Overrides {
  return EMPTY_OVERRIDES;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateStore(update: (prev: Overrides) => Overrides): void {
  storeState = update(getSnapshot());
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storeState));
  } catch (err) {
    console.warn("ThresholdsContext: unable to persist threshold overrides", err);
  }
  for (const listener of listeners) listener();
}

function mergeConfig(preset: ThresholdConfig, overrides: Overrides): ThresholdConfig {
  const override = overrides[preset.id];
  if (!override) return preset;
  return {
    ...preset,
    targetValue: override.targetValue ?? preset.targetValue,
    upperBound: override.upperBound ?? preset.upperBound,
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThresholdsContext = createContext<ThresholdsContextValue | null>(null);

export function ThresholdsProvider({ children }: { children: ReactNode }) {
  const overrides = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const getThreshold = useCallback(
    (id: string): ThresholdConfig | null => {
      const preset = presetById(id);
      return preset ? mergeConfig(preset, overrides) : null;
    },
    [overrides]
  );

  const thresholdsForPage = useCallback(
    (pageKey: string): ThresholdConfig[] =>
      (THRESHOLD_PRESETS[pageKey] ?? []).map((preset) => mergeConfig(preset, overrides)),
    [overrides]
  );

  const evaluate = useCallback(
    (id: string, value: number): ThresholdStatus | null => {
      const config = getThreshold(id);
      return config ? evaluateThreshold(value, config) : null;
    },
    [getThreshold]
  );

  const setTargetValue = useCallback((id: string, targetValue: number) => {
    if (!Number.isFinite(targetValue)) return;
    updateStore((prev) => ({ ...prev, [id]: { ...prev[id], targetValue } }));
  }, []);

  const setUpperBound = useCallback((id: string, upperBound: number) => {
    if (!Number.isFinite(upperBound)) return;
    updateStore((prev) => ({ ...prev, [id]: { ...prev[id], upperBound } }));
  }, []);

  const resetPage = useCallback((pageKey: string) => {
    const pageIds = new Set((THRESHOLD_PRESETS[pageKey] ?? []).map((c) => c.id));
    updateStore((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => !pageIds.has(id)))
    );
  }, []);

  const pageHasOverrides = useCallback(
    (pageKey: string): boolean =>
      (THRESHOLD_PRESETS[pageKey] ?? []).some((preset) => {
        const merged = mergeConfig(preset, overrides);
        return merged.targetValue !== preset.targetValue || merged.upperBound !== preset.upperBound;
      }),
    [overrides]
  );

  const value = useMemo<ThresholdsContextValue>(
    () => ({
      getThreshold,
      thresholdsForPage,
      evaluate,
      setTargetValue,
      setUpperBound,
      resetPage,
      pageHasOverrides,
    }),
    [
      getThreshold,
      thresholdsForPage,
      evaluate,
      setTargetValue,
      setUpperBound,
      resetPage,
      pageHasOverrides,
    ]
  );

  return <ThresholdsContext.Provider value={value}>{children}</ThresholdsContext.Provider>;
}

export function useThresholds(): ThresholdsContextValue {
  const ctx = useContext(ThresholdsContext);
  if (!ctx) throw new Error("useThresholds must be used within a ThresholdsProvider");
  return ctx;
}
