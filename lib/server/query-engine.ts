import "server-only";

// One place a QueryPayload becomes rows: validate against the metadata registry,
// compile to parameterized T-SQL, execute, or — with no connection string — answer
// from the bundled sample CSVs through ClientCsvAdapter.
//
// Both /api/v1/query and the AI assistant route go through here, so a query the
// model composes is validated and executed exactly like one a widget sends. There
// is no second, laxer path.

import { buildQuery, QueryValidationError } from "@/lib/server/query-builder";
import { getDataset } from "@/lib/server/metadata-registry";
import { sampleDataProvider } from "@/lib/server/sample-data-source";
import { executeQuery, isDatabaseConfigured } from "@/lib/server/sql-client";
import type { QueryPayload, QueryResult } from "@/types/data-provider";

export type QuerySource = "azure-sql" | "sample-csv";

export interface ExecutedQuery extends QueryResult {
  /** Which backend answered. */
  source: QuerySource;
}

/**
 * Validate, compile, and run a payload.
 *
 * Throws QueryValidationError (400) for an unknown dataset, field, operator, or
 * aggregation, and SqlUnavailableError (503) when a configured database cannot
 * be reached.
 */
export async function buildAndExecuteQuery(payload: QueryPayload): Promise<ExecutedQuery> {
  const startedAt = performance.now();

  if (!getDataset(payload.datasetId)) {
    throw new QueryValidationError(`Unknown datasetId "${payload.datasetId}".`);
  }

  // Compiled either way: this is what validates the payload against the
  // registry, so a bad field fails identically with or without a database.
  const built = buildQuery(payload);

  if (!isDatabaseConfigured()) {
    const result = await sampleDataProvider.queryWidgetData(payload);
    return {
      rows: result.rows,
      totalMatchingRows: result.totalMatchingRows,
      executionTimeMs: elapsed(startedAt),
      source: "sample-csv",
    };
  }

  const { rows, totalMatchingRows } = await executeQuery(built);
  return { rows, totalMatchingRows, executionTimeMs: elapsed(startedAt), source: "azure-sql" };
}

function elapsed(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
