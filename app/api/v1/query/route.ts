// POST /api/v1/query — the server side of IDataProvider.
//
// Takes a QueryPayload, validates every field against the metadata registry,
// compiles it to parameterized T-SQL, and returns a QueryResult. With no
// connection string configured it answers from the bundled sample CSVs through
// the very same ClientCsvAdapter the browser uses, so the endpoint is usable —
// and truthful — before Azure SQL exists.
//
// Responses:
//   200 { success: true,  data: QueryResult }
//   400 { success: false, error }   unknown dataset/field/operator, bad payload
//   503 { success: false, error }   database configured but unreachable
//   500 { success: false, error }   anything else

import { QueryValidationError } from "@/lib/server/query-builder";
import { buildAndExecuteQuery } from "@/lib/server/query-engine";
import { getDataset, listColumns, listDatasets } from "@/lib/server/metadata-registry";
import { SqlUnavailableError } from "@/lib/server/sql-client";
import type { QueryPayload, QueryResult } from "@/types/data-provider";

export const runtime = "nodejs";

interface QuerySuccess {
  success: true;
  data: QueryResult;
  /** Which backend answered — "azure-sql" or "sample-csv". */
  source: string;
}

interface QueryFailure {
  success: false;
  error: string;
  /** Valid column ids, when a field name is what went wrong. */
  availableColumns?: string[];
}

function failure(error: string, status: number, availableColumns?: string[]): Response {
  return Response.json({ success: false, error, availableColumns } satisfies QueryFailure, { status });
}

const AGGREGATIONS = new Set(["sum", "avg", "count", "distinct"]);
const OPERATORS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "in"]);
const TIME_GRAINS = new Set(["month", "quarter", "year"]);

/**
 * Shape validation only — that every name exists and every operator is allowed
 * is the builder's job, against the registry.
 */
function parsePayload(body: unknown): QueryPayload {
  if (typeof body !== "object" || body === null) {
    throw new QueryValidationError("Request body must be a QueryPayload object.");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.datasetId !== "string" || raw.datasetId === "") {
    throw new QueryValidationError("`datasetId` is required.");
  }

  const payload: QueryPayload = { datasetId: raw.datasetId };

  if (raw.dimensions !== undefined) {
    if (!Array.isArray(raw.dimensions) || raw.dimensions.some((d) => typeof d !== "string")) {
      throw new QueryValidationError("`dimensions` must be an array of column ids.");
    }
    payload.dimensions = raw.dimensions as string[];
  }

  if (raw.measures !== undefined) {
    if (!Array.isArray(raw.measures)) {
      throw new QueryValidationError("`measures` must be an array.");
    }
    payload.measures = raw.measures.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new QueryValidationError(`measures[${index}] must be an object.`);
      }
      const measure = entry as Record<string, unknown>;
      if (typeof measure.field !== "string" || typeof measure.alias !== "string") {
        throw new QueryValidationError(`measures[${index}] needs string \`field\` and \`alias\`.`);
      }
      if (typeof measure.aggregation !== "string" || !AGGREGATIONS.has(measure.aggregation)) {
        throw new QueryValidationError(
          `measures[${index}].aggregation must be one of ${[...AGGREGATIONS].join(", ")}.`
        );
      }
      return {
        field: measure.field,
        alias: measure.alias,
        aggregation: measure.aggregation as "sum" | "avg" | "count" | "distinct",
      };
    });
  }

  if (raw.filters !== undefined) {
    if (!Array.isArray(raw.filters)) {
      throw new QueryValidationError("`filters` must be an array.");
    }
    payload.filters = raw.filters.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new QueryValidationError(`filters[${index}] must be an object.`);
      }
      const filter = entry as Record<string, unknown>;
      if (typeof filter.field !== "string") {
        throw new QueryValidationError(`filters[${index}].field must be a string.`);
      }
      if (typeof filter.operator !== "string" || !OPERATORS.has(filter.operator)) {
        throw new QueryValidationError(
          `filters[${index}].operator must be one of ${[...OPERATORS].join(", ")}.`
        );
      }
      return {
        field: filter.field,
        operator: filter.operator as "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in",
        value: filter.value,
      };
    });
  }

  if (raw.timeGrain !== undefined) {
    if (typeof raw.timeGrain !== "string" || !TIME_GRAINS.has(raw.timeGrain)) {
      throw new QueryValidationError(`\`timeGrain\` must be one of ${[...TIME_GRAINS].join(", ")}.`);
    }
    payload.timeGrain = raw.timeGrain as "month" | "quarter" | "year";
  }

  if (raw.sort !== undefined) {
    if (typeof raw.sort !== "object" || raw.sort === null) {
      throw new QueryValidationError("`sort` must be an object.");
    }
    const sort = raw.sort as Record<string, unknown>;
    if (typeof sort.field !== "string") {
      throw new QueryValidationError("`sort.field` must be a string.");
    }
    if (sort.direction !== "asc" && sort.direction !== "desc") {
      throw new QueryValidationError('`sort.direction` must be "asc" or "desc".');
    }
    payload.sort = { field: sort.field, direction: sort.direction };
  }

  if (raw.limit !== undefined) {
    if (typeof raw.limit !== "number" || !Number.isInteger(raw.limit) || raw.limit < 1) {
      throw new QueryValidationError("`limit` must be a positive integer.");
    }
    payload.limit = raw.limit;
  }

  return payload;
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now();

  let payload: QueryPayload;
  try {
    payload = parsePayload(await request.json());
  } catch (err) {
    if (err instanceof QueryValidationError) return failure(err.message, err.status);
    return failure("Request body must be valid JSON.", 400);
  }

  const dataset = getDataset(payload.datasetId);
  if (!dataset) {
    return failure(
      `Unknown datasetId "${payload.datasetId}". Available: ${listDatasets().map((d) => d.id).join(", ")}.`,
      400
    );
  }

  try {
    const { source, ...result } = await buildAndExecuteQuery(payload);
    return Response.json({
      success: true,
      source,
      data: {
        ...result,
        // Measured at the route boundary, so it includes parsing and validation.
        executionTimeMs: round(performance.now() - startedAt),
      },
    } satisfies QuerySuccess);
  } catch (err) {
    if (err instanceof QueryValidationError) {
      // A rejected field name is the common case, so say what the dataset offers.
      return failure(err.message, err.status, listColumns(dataset).map((c) => c.id));
    }
    if (err instanceof SqlUnavailableError) return failure(err.message, err.status);
    const message = err instanceof Error ? err.message : "Unexpected query error.";
    console.error("POST /api/v1/query failed:", message);
    return failure(message, 500);
  }
}

function round(ms: number): number {
  return Math.round(ms * 100) / 100;
}
