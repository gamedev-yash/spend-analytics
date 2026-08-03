"use client";

import { useMemo } from "react";
import { useDatasets } from "@/context/DatasetsContext";
import { useProviderPageData } from "@/hooks/use-provider-page-data";
import { loadSpendOverviewFromProvider } from "@/lib/page-data/spend-overview-from-provider";
import { DatasetUpload } from "@/components/dashboard/dataset-upload";
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

  const warehouse = useProviderPageData(
    loadSpendOverviewFromProvider,
    providerType === "azure-sql",
    "spend-overview"
  );

  const data = useMemo(
    () =>
      warehouse.data ??
      (dataset ? buildSpendOverviewFromDataset(dataset, filters) : null) ??
      serverData,
    [warehouse.data, dataset, filters, serverData]
  );

  return (
    <>
      <DatasetUpload pageKey="spend-overview" usingFallback={data === serverData} />
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
    </>
  );
}
