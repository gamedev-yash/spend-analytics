"use client";

import { useEffect } from "react";

/**
 * Fires `onOutside` on a pointerdown that lands outside every ref in `refs`.
 * Refs are read at event time (`ref.current`), not captured in the effect's
 * dependency array, so callers can pass a fresh array literal each render
 * without re-subscribing on every keystroke.
 */
export function useOutsideClick(
  active: boolean,
  onOutside: () => void,
  refs: React.RefObject<HTMLElement | null>[]
): void {
  useEffect(() => {
    if (!active) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      onOutside();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, onOutside]);
}
