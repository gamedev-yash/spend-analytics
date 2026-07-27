"use client";

import { useMemo } from "react";
import { useDatasets } from "@/context/DatasetsContext";
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
 * Chooses the canvas's data source: when a CSV has been uploaded for this
 * page, every widget is re-aggregated client-side from its rows (same
 * SapFilters semantics as the server path); otherwise the server-aggregated
 * mock props pass straight through, so the dashboard never renders blank.
 */
export function SpendOverviewDataBridge({ serverData, filters }: SpendOverviewDataBridgeProps) {
  const { getDatasetForPage } = useDatasets();
  const dataset = getDatasetForPage("spend-overview");

  const data = useMemo(
    () => (dataset ? buildSpendOverviewFromDataset(dataset, filters) : null) ?? serverData,
    [dataset, filters, serverData]
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
