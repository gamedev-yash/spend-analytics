// GET /api/v1/datasets — what the warehouse can answer.
//
// The metadata half of IDataProvider: AzureSqlAdapter calls this for
// getDatasets() and getDatasetMetadata(), and DatasetsContext merges the result
// into the dataset list so a dashboard can be bound to a warehouse table the
// same way it binds to an uploaded CSV.
//
// Rows are deliberately empty — a server-backed dataset is queried, never
// downloaded. Every column comes straight from the metadata registry, so the
// frontend's column pickers see exactly the fields the query builder will accept.

import { listColumns, listDatasets } from "@/lib/server/metadata-registry";
import { getSampleDataset } from "@/lib/server/sample-data-source";
import { isDatabaseConfigured } from "@/lib/server/sql-client";
import type { ColumnMeta } from "@/lib/infer";
import type { Dataset } from "@/types/dataset";

export const runtime = "nodejs";

interface DatasetsResponse {
  success: true;
  /** "azure-sql" or "sample-csv" — which backend the query route will use. */
  source: string;
  data: Dataset[];
}

/**
 * distinctCount drives two frontend heuristics — which columns become filter
 * dropdowns, and how widget suggestions rank — so it has to be populated or the
 * filter bar silently disappears in Azure SQL mode.
 *
 * Serving samples, the exact counts are already computed, so use them. Against a
 * real database, fall back to the registry's declared hints rather than firing a
 * COUNT(DISTINCT) per column on every metadata load.
 */
function columnsFor(datasetId: string, useSampleCounts: boolean): ColumnMeta[] {
  if (useSampleCounts) {
    const sample = getSampleDataset(datasetId);
    if (sample) return sample.columns;
  }
  const definition = listDatasets().find((d) => d.id === datasetId);
  if (!definition) return [];
  return listColumns(definition).map((column) => ({
    id: column.id,
    name: column.name,
    type: column.type,
    distinctCount: column.distinctCountHint ?? 0,
  }));
}

export function GET(): Response {
  const useSampleCounts = !isDatabaseConfigured();
  const datasets: Dataset[] = listDatasets().map((definition) => ({
    id: definition.id,
    name: definition.name,
    source: "server",
    // A server-backed dataset is queried, never downloaded.
    rows: [],
    columns: columnsFor(definition.id, useSampleCounts),
    createdAt: new Date(0).toISOString(),
  }));

  return Response.json({
    success: true,
    source: useSampleCounts ? "sample-csv" : "azure-sql",
    data: datasets,
  } satisfies DatasetsResponse);
}
