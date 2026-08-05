"use client";

import { useMemo } from "react";
import { useProviderPageData } from "@/hooks/use-provider-page-data";
import { loadSpendOverviewFromProvider } from "../loadFromProvider";
import { WidgetGridSkeleton } from "@/components/dashboard/widget-grid-skeleton";
import { RevalidatingSection } from "@/components/dashboard/revalidating-section";
import type { SapFilters } from "@/lib/sap/types";
import type { SpendOverviewData } from "../fromDataset";
import { SpendOverviewCanvas } from "./SpendOverviewCanvas";

interface SpendOverviewDataBridgeProps {
  /** Widget data aggregated server-side from the static SAP mock tables. */
  serverData: SpendOverviewData;
  /** The URL-driven filters the server used. */
  filters: SapFilters;
}

/**
 * Chooses the canvas's data source, in precedence order:
 *
 *   1. Azure SQL mode — every widget's aggregate comes from fact_po_items
 *      through IDataProvider.
 *   2. The server-aggregated mock props, so the dashboard never renders
 *      blank — never a client-uploaded CSV, so this page never depends on
 *      DatasetsContext's upload path.
 */
export function SpendOverviewDataBridge({ serverData, filters }: SpendOverviewDataBridgeProps) {
  // Keying on the serialized filters (not a constant string) is what makes a
  // BU/Category/Date/vendor change actually trigger a new warehouse fetch —
  // useProviderPageData only refetches when this key changes.
  const warehouse = useProviderPageData(
    (provider) => loadSpendOverviewFromProvider(provider, filters),
    true,
    `spend-overview:${JSON.stringify(filters)}`
  );

  // True only until the very first Azure SQL fetch of the session settles —
  // useProviderPageData's `ready` is sticky, so it never re-triggers once
  // real data has rendered once. `isRevalidating` covers everything after: a
  // background refetch of data that's already on screen (see
  // RevalidatingSection) rather than a reset to the skeleton.
  const isInitialAzureLoad = !warehouse.ready;
  const isRevalidating = warehouse.loading && warehouse.ready;

  const data = useMemo(() => warehouse.data ?? serverData, [warehouse.data, serverData]);

  if (isInitialAzureLoad) {
    return <WidgetGridSkeleton kpiCount={6} widgetCount={5} />;
  }

  return (
    <RevalidatingSection isRevalidating={isRevalidating}>
      <SpendOverviewCanvas
        kpis={data.kpis}
        insightText={data.insightText}
        treemapNodes={data.treemapNodes}
        topSuppliers={data.topSuppliers}
        trend={data.trend}
        buSpend={data.buSpend}
        supplierDetailRows={data.supplierDetailRows}
      />
    </RevalidatingSection>
  );
}
