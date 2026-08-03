"use client";

// The filters in force for a subtree of widgets. Filtering is part of the query
// a widget sends, not a pre-filtered copy of the rows it receives, so the active
// filters travel with the render tree instead of through every component's props
// — a dashboard wraps its grid, and each widget folds them into its own payload.

import { createContext, useContext, type ReactNode } from "react";
import type { QueryFilter } from "@/types/data-provider";

const NO_FILTERS: QueryFilter[] = [];

const WidgetFiltersContext = createContext<QueryFilter[]>(NO_FILTERS);

export function WidgetFiltersProvider({
  filters,
  children,
}: {
  filters: QueryFilter[];
  children: ReactNode;
}) {
  return <WidgetFiltersContext.Provider value={filters}>{children}</WidgetFiltersContext.Provider>;
}

/** Filters to apply to this widget's query; empty outside a provider. */
export function useWidgetFilters(): QueryFilter[] {
  return useContext(WidgetFiltersContext);
}
