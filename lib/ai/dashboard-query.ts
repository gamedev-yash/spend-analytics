import "server-only";

// The Query Engine wiring for the dashboard AI assistant — for EVERY dashboard
// kind. lib/ai/query-engine.ts already implements the dashboard-agnostic
// filter/groupBy/aggregate/sort/limit engine over plain row arrays; this file is
// what turns that into a `strict: true` tool call scoped to exactly one
// dashboard's tables, validates the model's choice of table/field against that
// dashboard's real data before running anything, and renders the result back as
// a correctable tool_result — "the enum is the first layer, the engine is the
// second" containment.
//
// It takes a DashboardDataContext (lib/ai/dashboard-data-context.ts), never a
// DashboardKey and never a dashboard id, which is what makes ONE
// query_dashboard_data tool serve both kinds:
//
//   built-in dashboard: warehouse row tables  ─┐
//   custom dashboard:   GeneratedDashboard.rows ┴─► the same runQuery()
//
// The tool the model sees differs only in its table/field ENUMS, and those are
// derived from whichever dashboard is actually open. There is no
// query_custom_dashboard_data, no second validation path, and no way to name a
// table belonging to a dashboard the user is not on.

import Anthropic from "@anthropic-ai/sdk";
import { runQuery, describeSchema } from "@/lib/ai/query-engine";
import type { QueryAggregation, QueryOp, QueryResult, QuerySpec } from "@/lib/ai/query-engine";
import type { DashboardTable } from "@/lib/ai/dashboard-tables";
import type { DashboardDataContext } from "@/lib/ai/dashboard-data-context";
import { buildQueryCacheKey, getCachedQueryResult, setCachedQueryResult } from "@/lib/ai/query-cache";

const AGGREGATIONS: QueryAggregation[] = ["sum", "avg", "count", "min", "max", "distinct"];
const OPS: QueryOp[] = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in"];

function allFieldIds(tables: DashboardTable[]): string[] {
  const ids = new Set<string>();
  for (const table of tables) {
    for (const field of describeSchema(table.rows)) ids.add(field.field);
  }
  return [...ids].sort();
}

// Same rationale as the schema-block cache in lib/ai/dashboard-data-context.ts:
// allFieldIds() re-derives the schema (describeSchema per table) to build the
// enum lists below, and that schema is stable for a given dataVersion — so the
// tool definition itself is memoized rather than rebuilt on every request.
// Keyed by schemaCacheKey (dashboard identity AND data version — NOT dataVersion,
// which every built-in dashboard shares), so no dashboard is ever handed the
// enum lists of another, and a re-registered custom dashboard with different
// columns can never be handed a tool schema built from the previous one's.
const toolCache = new Map<string, Anthropic.Tool>();

const MAX_TOOL_CACHE_ENTRIES = 32;

/** Tool schema scoped to exactly one dashboard's own tables and columns. */
export function queryDashboardDataTool(dataContext: DashboardDataContext): Anthropic.Tool {
  const cached = toolCache.get(dataContext.schemaCacheKey);
  if (cached) return cached;

  const tables = dataContext.tables;
  const tableIds = tables.map((t) => t.id);
  const fieldIds = allFieldIds(tables);

  const tool: Anthropic.Tool = {
    name: "query_dashboard_data",
    description:
      "Run a real aggregate or row-level lookup against this dashboard's own data. Call this before stating any figure that wasn't already given to you verbatim.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          enum: tableIds,
          description: "Which table on this dashboard to query.",
        },
        filters: {
          type: ["array", "null"],
          items: {
            type: "object",
            properties: {
              field: { type: "string", enum: fieldIds },
              op: { type: "string", enum: OPS },
              value: {
                type: ["string", "number", "boolean", "array"],
                items: { type: ["string", "number"] },
                description: 'Scalar, or an array for "in".',
              },
            },
            required: ["field", "op", "value"],
            additionalProperties: false,
          },
          description: "Narrow the rows before aggregating. Omit/null for no filter.",
        },
        groupBy: {
          anyOf: [{ type: "string", enum: fieldIds }, { type: "null" }],
          description: "Bucket rows by this field before aggregating. Omit/null for a single overall number.",
        },
        measure: {
          anyOf: [{ type: "string", enum: fieldIds }, { type: "null" }],
          description: 'Field to aggregate. Omit/null when aggregation is "count".',
        },
        aggregation: {
          anyOf: [{ type: "string", enum: AGGREGATIONS }, { type: "null" }],
          description: "How to summarize each group (or the whole table when groupBy is omitted).",
        },
        sort: {
          anyOf: [{ type: "string", enum: ["asc", "desc"] }, { type: "null" }],
          description: 'Sort groups by their aggregated value. Default "desc".',
        },
        limit: {
          type: ["integer", "null"],
          description: "Top-N cap, at most 50.",
        },
        select: {
          type: ["array", "null"],
          items: { type: "string", enum: fieldIds },
          description: "For a row-level lookup instead of an aggregate — which fields to return per matching row.",
        },
      },
      required: ["table", "filters", "groupBy", "measure", "aggregation", "sort", "limit", "select"],
      additionalProperties: false,
    },
  };
  if (toolCache.size >= MAX_TOOL_CACHE_ENTRIES) {
    const oldest = toolCache.keys().next();
    if (!oldest.done) toolCache.delete(oldest.value);
  }
  toolCache.set(dataContext.schemaCacheKey, tool);
  return tool;
}

export interface DashboardQueryOutcome {
  table: string;
  spec: QuerySpec;
  result: QueryResult;
  /** Set when the table or a field name was rejected — never a silent empty result. */
  error?: string;
  /** Observability only (lib/ai/query-cache.ts) — never changes what's returned, only how it was produced. Absent on an error outcome, since errors are never cached. */
  cacheHit?: boolean;
}

/** Tool input → QuerySpec. Reshaping only — validation happens in runDashboardQuery. */
function toQuerySpec(input: Record<string, unknown>): Omit<QuerySpec, "table"> {
  const spec: Omit<QuerySpec, "table"> = {};

  if (Array.isArray(input.filters) && input.filters.length > 0) {
    spec.filters = input.filters.map((entry) => {
      const f = (entry ?? {}) as Record<string, unknown>;
      return {
        field: String(f.field ?? ""),
        op: OPS.find((o) => o === f.op) ?? "eq",
        value: f.value as string | number | boolean | (string | number)[],
      };
    });
  }
  if (typeof input.groupBy === "string" && input.groupBy !== "") spec.groupBy = input.groupBy;
  if (typeof input.measure === "string" && input.measure !== "") spec.measure = input.measure;
  const aggregation = AGGREGATIONS.find((a) => a === input.aggregation);
  if (aggregation) spec.aggregation = aggregation;
  if (input.sort === "asc" || input.sort === "desc") spec.sort = input.sort;
  if (typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0) {
    spec.limit = Math.floor(input.limit);
  }
  if (Array.isArray(input.select) && input.select.length > 0) {
    spec.select = input.select.map((s) => String(s));
  }
  return spec;
}

function fieldsUsedBy(spec: Omit<QuerySpec, "table">): string[] {
  const fields: string[] = [];
  if (spec.groupBy) fields.push(spec.groupBy);
  if (spec.measure) fields.push(spec.measure);
  if (spec.select) fields.push(...spec.select);
  if (spec.filters) fields.push(...spec.filters.map((f) => f.field));
  return fields;
}

/**
 * Validates the model's table/field choices against this dashboard's real data
 * before running anything, then executes via lib/ai/query-engine.ts.
 *
 * The rows behind each table are resolved upstream, by
 * resolveDashboardDataContext — the warehouse for a built-in dashboard, the
 * registered GeneratedDashboard snapshot for a custom one. This function cannot
 * see or reach any other dashboard's rows: `dataContext.tables` is the entire
 * universe it validates against and executes over. That is the isolation
 * guarantee, and it is structural rather than a prompt instruction — a model
 * that asks for a table belonging to another dashboard gets the same
 * "unknown table" rejection as one that invents a name.
 */
export function runDashboardQuery(
  dataContext: DashboardDataContext,
  input: Record<string, unknown>
): DashboardQueryOutcome {
  const tables = dataContext.tables;
  const tableId = typeof input.table === "string" ? input.table : "";
  const table = tables.find((t) => t.id === tableId);
  const spec = toQuerySpec(input);
  const fullSpec: QuerySpec = { table: tableId, ...spec };

  if (!table) {
    return {
      table: tableId,
      spec: fullSpec,
      result: { matchedRows: 0, truncated: false },
      error: `Unknown table "${tableId}" on this dashboard. Valid tables: ${tables.map((t) => t.id).join(", ")}.`,
    };
  }

  const validFields = new Set(table.rows.length > 0 ? Object.keys(table.rows[0]) : []);
  const badField = fieldsUsedBy(spec).find((f) => !validFields.has(f));
  if (badField) {
    return {
      table: tableId,
      spec: fullSpec,
      result: { matchedRows: 0, truncated: false },
      error: `Unknown field "${badField}" on table "${tableId}". Valid fields: ${[...validFields].sort().join(", ")}.`,
    };
  }

  // Cache check happens ONLY after both validations above pass — an invalid
  // table/field never reaches the cache, so the cache can only ever serve a
  // result that was genuinely computed, never mask a rejected query as a hit.
  //
  // Keyed by table + normalized spec + dataVersion. For the built-in
  // dashboards dataVersion is the shared dataset version, so two dashboards
  // reading the identical warehouse table still share a cache entry for an
  // identical query — see lib/ai/query-cache.ts's module comment for why that
  // is correct. For a custom dashboard it is the context id plus a content
  // fingerprint, which makes a collision between two custom dashboards (or
  // between a custom dashboard and the warehouse) impossible even when the
  // spec is byte-identical.
  const cacheKey = buildQueryCacheKey(dataContext.dataVersion, fullSpec);
  const cached = getCachedQueryResult(cacheKey);
  if (cached) {
    return { table: tableId, spec: fullSpec, result: cached, cacheHit: true };
  }

  const result = runQuery(table.rows, spec);
  setCachedQueryResult(cacheKey, result);
  return { table: tableId, spec: fullSpec, result, cacheHit: false };
}

/** Rows the model must reason over, rendered as a correctable tool_result. */
export function renderDashboardQueryResult(outcome: DashboardQueryOutcome): string {
  if (outcome.error) {
    return `QUERY FAILED: ${outcome.error}\nFix the query and try again, or tell the user what is missing. Do not invent numbers.`;
  }
  const { result } = outcome;
  if (result.groups) {
    if (result.groups.length === 0) return `QUERY RESULT: no rows matched in "${outcome.table}".`;
    const lines = result.groups.map((g) => `${g.group}: ${g.value} (${g.rowCount} rows)`);
    return [
      `QUERY RESULT on "${outcome.table}" (${result.matchedRows} row${result.matchedRows === 1 ? "" : "s"} matched, ${result.groups.length} group${result.groups.length === 1 ? "" : "s"}${result.truncated ? ", truncated" : ""}):`,
      ...lines,
    ].join("\n");
  }
  if (result.rows) {
    if (result.rows.length === 0) return `QUERY RESULT: no rows matched in "${outcome.table}".`;
    return [
      `QUERY RESULT on "${outcome.table}" (${result.matchedRows} row${result.matchedRows === 1 ? "" : "s"} matched${result.truncated ? ", truncated" : ""}):`,
      ...result.rows.map((r) => JSON.stringify(r)),
    ].join("\n");
  }
  return `QUERY RESULT on "${outcome.table}": ${result.value} (${result.matchedRows} row${result.matchedRows === 1 ? "" : "s"} matched).`;
}
