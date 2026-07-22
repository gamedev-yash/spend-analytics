"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True only after client hydration. Uses useSyncExternalStore instead of a
 * useState+useEffect pair so there's no setState call inside an effect body
 * (avoids react-hooks/set-state-in-effect) while still being 100% safe
 * against the classic SSR/client hydration mismatch.
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
