"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Bridges a dashboard page's own filter state (six different shapes — URL
// params for Spend Overview/Compliance, a reducer for Payment Terms/Single
// Source Risk, local state for Tail Spend, a store for Supplier Fragmentation
// — see each dashboard's own filter-summary builder) up to DashboardAssistant,
// which is mounted once at the root layout, outside every page's own
// component tree (see app/layout.tsx) and so cannot read any of them
// directly. Without this, the assistant answers from the FULL unified
// dataset even when the user has the dashboard filtered down to one plant or
// quarter — a real "the AI disagrees with what's on screen" gap.
//
// Deliberately carries a plain, human-readable SUMMARY STRING (e.g. "Plant:
// Pune, Chennai · Category: IT & Telecom · Jan 1 2025 – Jun 30 2025"), not a
// structured filter object keyed by column id. The six dashboards' filter
// state shapes don't share field names (categoryCodes vs. cat vs. l1s), and
// several store CODES the model would have to re-resolve to the display
// names it actually reasons over — reusing the same
// "the model turns a plain-language phrase into a query_dashboard_data
// filter" path it already uses for typed-in filters (e.g. "spend for Pune
// plant") is far less to get subtly wrong than hand-mapping six different
// filter shapes onto exact column ids server-side.
//
// Split into two contexts (mirrors context/FilterContext.tsx's
// FilterSlotProvider): the setter never changes reference, so a page
// publishing its filter summary never re-renders anything else that reads
// this context; only DashboardAssistant (the value's one reader) re-renders
// when the summary text actually changes.
const SummaryValueContext = createContext<string | null>(null);
const SetSummaryContext = createContext<((summary: string | null) => void) | null>(null);

interface DashboardActiveFiltersProviderProps {
  children: ReactNode;
}

export function DashboardActiveFiltersProvider({ children }: DashboardActiveFiltersProviderProps) {
  const [summary, setSummary] = useState<string | null>(null);

  return (
    <SetSummaryContext.Provider value={setSummary}>
      <SummaryValueContext.Provider value={summary}>{children}</SummaryValueContext.Provider>
    </SetSummaryContext.Provider>
  );
}

/** Read by DashboardAssistant only — the current dashboard's active-filter summary, or null when nothing is filtered. */
export function useDashboardActiveFilterSummary(): string | null {
  return useContext(SummaryValueContext);
}

/**
 * Publish this page's current filter summary. Call with `null` when no
 * filter is active (the default state) — never an empty string, so
 * DashboardAssistant's own "is anything filtered" check stays a simple
 * truthiness test. Registration happens inside an effect (never during
 * render) and is cleared on unmount, so navigating to a dashboard with no
 * filter UI (or away from any dashboard) never leaves a stale summary
 * grounding the next page's answers — same lifecycle rule
 * context/FilterContext.tsx's useFilterSlot follows for the same reason.
 */
export function useSetDashboardActiveFilterSummary(summary: string | null): void {
  const setSummary = useContext(SetSummaryContext);
  if (!setSummary) {
    throw new Error("useSetDashboardActiveFilterSummary must be used within a DashboardActiveFiltersProvider");
  }

  useEffect(() => {
    setSummary(summary);
    return () => setSummary(null);
  }, [summary, setSummary]);
}
