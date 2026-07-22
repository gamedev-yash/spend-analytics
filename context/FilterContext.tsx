"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const FilterSlotValueContext = createContext<ReactNode>(null);
const SetFilterSlotContext = createContext<((node: ReactNode) => void) | null>(null);

interface FilterSlotProviderProps {
  children: ReactNode;
}

/**
 * Split into two contexts on purpose: the setter (consumed by pages via
 * useFilterSlot) never changes reference, so registering filters never
 * re-renders the page that registered them — only the value context
 * (consumed by FilterBar) changes when the slot's content changes.
 */
export function FilterSlotProvider({ children }: FilterSlotProviderProps) {
  const [slot, setSlot] = useState<ReactNode>(null);

  return (
    <SetFilterSlotContext.Provider value={setSlot}>
      <FilterSlotValueContext.Provider value={slot}>{children}</FilterSlotValueContext.Provider>
    </SetFilterSlotContext.Provider>
  );
}

/** Read the currently-registered filter content. Used by FilterBar only. */
export function useFilterSlotContent(): ReactNode {
  return useContext(FilterSlotValueContext);
}

/**
 * Register this page's filter UI into the shell's Filter Drawer.
 *
 * Call with the JSX to render there; pass `null` for routes with nothing to
 * show. Registration happens inside an effect (never during render) and is
 * cleared on unmount, so navigating away always empties the drawer for the
 * next route rather than leaking the previous page's filters into it.
 */
export function useFilterSlot(node: ReactNode) {
  const setSlot = useContext(SetFilterSlotContext);
  if (!setSlot) {
    throw new Error("useFilterSlot must be used within a FilterSlotProvider");
  }

  useEffect(() => {
    setSlot(node);
    return () => setSlot(null);
  }, [node, setSlot]);
}
