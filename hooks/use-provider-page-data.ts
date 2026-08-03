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
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({
    key: null,
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    load(activeProvider).then(
      (data) => {
        if (active) setState({ key, data, error: null });
      },
      (err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`useProviderPageData: load failed, falling back — ${message}`);
        setState({ key, data: null, error: message });
      }
    );
    return () => {
      active = false;
    };
    // `load` is intentionally excluded: page loaders are recreated every render,
    // and `key` is what expresses when a reload is actually needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProvider, enabled, key]);

  const settled = state.key === key;
  return {
    data: settled ? state.data : null,
    loading: enabled && !settled,
    ready: !enabled || settled,
    error: settled ? state.error : null,
  };
}
