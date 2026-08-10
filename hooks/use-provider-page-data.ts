"use client";

// Runs a core dashboard's provider loader and hands back its data.
//
// A loader issues several queries and either produces a complete page shape or
// nothing: half a page of real numbers next to half a page of mock would be
// worse than either. So a rejection resolves to `data: null`, and the page falls
// back exactly as it does for an unrecognized CSV.

import { useEffect, useState } from "react";
import { useDatasets } from "@/context/DatasetsContext";
import type { IDataProvider } from "@/types/data-provider";

export interface ProviderPageState<T> {
  data: T | null;
  loading: boolean;
  /** True once a load has settled, whether it produced data or not. */
  ready: boolean;
  error: string | null;
}

interface LoadState<T> {
  key: string | null;
  data: T | null;
  /** Sticky once true — an error or reload on a later key must not send a page
   *  that has already rendered real data back to a first-load skeleton. */
  ready: boolean;
  error: string | null;
}

/**
 * @param load    Issues the queries. Must be stable or memoized by the caller.
 * @param enabled False keeps the hook idle — a page in CSV mode never queries.
 * @param key     Re-runs the loader when this changes (a live threshold, say).
 */
export function useProviderPageData<T>(
  load: (provider: IDataProvider) => Promise<T | null>,
  enabled: boolean,
  key: string
): ProviderPageState<T> {
  const { activeProvider } = useDatasets();
  const [state, setState] = useState<LoadState<T>>({
    key: null,
    data: null,
    ready: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    load(activeProvider).then(
      (data) => {
        if (active) setState({ key, data, ready: true, error: null });
      },
      (err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`useProviderPageData: load failed, falling back — ${message}`);
        // Keeps whatever `data`/`ready` the last successful load left behind —
        // a failed reload on key B must not erase key A's still-good result.
        setState((prev) => ({ ...prev, key, error: message }));
      }
    );
    return () => {
      active = false;
    };
    // `load` is intentionally excluded: page loaders are recreated every render,
    // and `key` is what expresses when a reload is actually needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProvider, enabled, key]);

  const current = state.key === key;
  return {
    // Stale-while-revalidate while enabled: the last resolved payload stays on
    // screen while a new key's fetch is in flight (or fails) instead of
    // dropping to null — an in-flight request must never read as "no data"
    // and trigger a page's CSV/mock fallback mid-refetch.
    //
    // But masked to null once disabled — switching the provider toggle off
    // (Azure -> CSV) stops the effect above from ever running again, so
    // without this, `state.data` would keep reporting the last Azure fetch
    // forever and every `warehouse.data ?? mock` consumer would keep
    // rendering stale warehouse numbers under the CSV toggle.
    data: enabled ? state.data : null,
    loading: enabled && !current,
    ready: !enabled || state.ready,
    // An error belongs to the payload that produced it — a new key starts clean.
    error: current ? state.error : null,
  };
}
