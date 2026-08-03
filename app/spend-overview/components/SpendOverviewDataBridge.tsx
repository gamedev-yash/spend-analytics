"use client";

import { useMemo } from "react";
import { useDatasets } from "@/context/DatasetsContext";
import { useProviderPageData } from "@/hooks/use-provider-page-data";
import { loadSpendOverviewFromProvider } from "@/lib/page-data/spend-overview-from-provider";
import { DatasetUpload } from "@/components/dashboard/dataset-upload";
import { WidgetGridSkeleton } from "@/components/dashboard/widget-grid-skeleton";
import { RevalidatingSection } from "@/components/dashboard/revalidating-section";
import type { SapFilters } from "@/lib/sap/types";
import { buildSpendOverviewFromDataset, type SpendOverviewData } from "../fromDataset";
import { SpendOverviewCanvas } from "./SpendOverviewCanvas";

interface SpendOverviewDataBridgeProps {
  /** Widget data aggregated server-side from the static SAP mock tables. */
  serverData: SpendOverviewData;
  /** The URL-driven filters the server used — reapplied client-side to uploads. */
  filters: SapFilters;
}

/**
 * Chooses the canvas's data source, in precedence order:
 *
 *   1. Azure SQL mode — every widget's aggregate comes from fact_po_items
 *      through IDataProvider.
 *   2. An uploaded CSV for this page — re-aggregated client-side from its rows
 *      with the same SapFilters semantics as the server path.
 *   3. The server-aggregated mock props, so the dashboard never renders blank.
 */
export function SpendOverviewDataBridge({ serverData, filters }: SpendOverviewDataBridgeProps) {
  const { getDatasetForPage, providerType } = useDatasets();
  const dataset = getDatasetForPage("spend-overview");
  const isAzureSqlMode = providerType === "azure-sql";

  const warehouse = useProviderPageData(loadSpendOverviewFromProvider, isAzureSqlMode, "spend-overview");

  // True only until the very first Azure SQL fetch of the session settles —
  // useProviderPageData's `ready` is sticky, so it never re-triggers once
  // real data has rendered once. `isRevalidating` covers everything after: a
  // background refetch of data that's already on screen (see
  // RevalidatingSection) rather than a reset to the skeleton.
  const isInitialAzureLoad = isAzureSqlMode && !warehouse.ready;
  const isRevalidating = isAzureSqlMode && warehouse.loading && warehouse.ready;

  const data = useMemo(
    () =>
      warehouse.data ??
      (dataset ? buildSpendOverviewFromDataset(dataset, filters) : null) ??
      serverData,
    [warehouse.data, dataset, filters, serverData]
  );

  if (isInitialAzureLoad) {
    return (
      <>
        <DatasetUpload pageKey="spend-overview" usingFallback={data === serverData} />
        <WidgetGridSkeleton kpiCount={6} widgetCount={6} />
      </>
    );
  }

  return (
    <>
      <DatasetUpload pageKey="spend-overview" usingFallback={data === serverData} />
      <RevalidatingSection isRevalidating={isRevalidating}>
        <SpendOverviewCanvas
          kpis={data.kpis}
          insightText={data.insightText}
          treemapNodes={data.treemapNodes}
          topSuppliers={data.topSuppliers}
          trend={data.trend}
          spikes={data.spikes}
          buSpend={data.buSpend}
          sunburstNodes={data.sunburstNodes}
          plantNameToCode={data.plantNameToCode}
          metricsRows={data.metricsRows}
        />
      </RevalidatingSection>
    </>
  );
}
