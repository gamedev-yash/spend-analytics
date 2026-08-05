"use client";

// Snapshot capture/restore for /spend-overview, whose entire view state is the
// URL (bu, cat, from, to, vendor, catPath — see page.tsx's searchParams
// parsing). Saving records the parsed SapFilters; restoring rebuilds the query
// string and navigates, which re-renders the server page with those filters.
//
// A separate client island because the page is a server component: it can pass
// the serializable `filters` prop, but not the functions the generic dialog
// needs.

import { useRouter } from "next/navigation";
import { SnapshotHistoryDialog } from "@/components/dashboard/snapshot-history-dialog";
import type { SapFilters } from "@/lib/sap/types";

/** Inverse of page.tsx's searchParams parsing — SapFilters back to the URL. */
function toQueryString(filters: SapFilters): string {
  const params = new URLSearchParams();
  if (filters.plants?.length) params.set("bu", filters.plants.join(","));
  if (filters.categoriesL1?.length) params.set("cat", filters.categoriesL1.join(","));
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (filters.vendorId) params.set("vendor", filters.vendorId);
  if (filters.categoryPath) params.set("catPath", filters.categoryPath);
  return params.toString();
}

export function SpendOverviewSnapshots({ filters }: { filters: SapFilters }) {
  const router = useRouter();

  return (
    <SnapshotHistoryDialog
      dashboardId="spend-overview"
      dashboardTitle="Spend Overview"
      buildSnapshotData={() => ({ filters })}
      onRestore={(data) => {
        const saved = (data.filters ?? {}) as SapFilters;
        const query = toQueryString(saved);
        router.push(query ? `/spend-overview?${query}` : "/spend-overview");
      }}
    />
  );
}
