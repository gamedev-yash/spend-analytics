"use client";

import { useCallback, useEffect, useState } from "react";
import type { MasterPayload } from "./types";

const ENDPOINT = "/supplier-fragmentation/api/master";

// Module-level cache: the master payload is static reference data, so one
// fetch serves every mount of the page for the life of the tab.
let cachedPayload: MasterPayload | null = null;
let inflight: Promise<MasterPayload> | null = null;

async function fetchMaster(): Promise<MasterPayload> {
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error(`Master data request failed (HTTP ${res.status})`);
  return (await res.json()) as MasterPayload;
}

interface HookState {
  data: MasterPayload | null;
  error: string | null;
  revalidating: boolean;
}

export interface MasterDataState extends HookState {
  /** True only during the initial load (no data on screen yet). */
  loading: boolean;
  retry: () => void;
}

/**
 * Loads the dashboard's master rows with stale-while-revalidate semantics:
 * a cached payload renders instantly and refreshes in the background; the
 * skeleton only ever shows on the first visit of the session.
 */
export function useMasterData(): MasterDataState {
  const [state, setState] = useState<HookState>({
    data: cachedPayload,
    error: null,
    revalidating: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (cachedPayload) {
      // Serve stale immediately (already seeded in state); refresh quietly.
      let settled = false;
      fetchMaster()
        .then((fresh) => {
          settled = true;
          cachedPayload = fresh;
          if (!cancelled) setState({ data: fresh, error: null, revalidating: false });
        })
        .catch(() => {
          // A background-refresh failure is not an error state for data
          // that is already on screen — keep serving the stale payload.
          settled = true;
          if (!cancelled) setState((s) => ({ ...s, revalidating: false }));
        });
      // Flag the refresh from a microtask so the effect body itself never
      // sets state synchronously (react-hooks/set-state-in-effect).
      queueMicrotask(() => {
        if (!cancelled && !settled) setState((s) => ({ ...s, revalidating: true }));
      });
      return () => {
        cancelled = true;
      };
    }

    inflight ??= fetchMaster();
    inflight
      .then((payload) => {
        cachedPayload = payload;
        if (!cancelled) setState({ data: payload, error: null, revalidating: false });
      })
      .catch((err: unknown) => {
        inflight = null;
        if (!cancelled) {
          setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
    setAttempt((n) => n + 1);
  }, []);

  return {
    ...state,
    loading: state.data === null && state.error === null,
    retry,
  };
}
