import "server-only";

// The Query Engine for the core dashboards' AI assistant, and its wiring to
// the model. lib/ai/query-engine.ts already implements the dashboard-agnostic
// filter/groupBy/aggregate/sort/limit engine over plain row arrays; this file
// is what turns that into a `strict: true` tool call scoped to exactly one
// dashboard's tables (lib/ai/dashboard-tables.ts), validates the model's
// choice of table/field against that dashboard's real data before running
// anything, and renders the result back as a correctable tool_result — the
// same "enum is the first layer, the engine is the second" containment
// app/api/assistant/route.ts already uses for the warehouse.

import Anthropic from "@anthropic-ai/sdk";
import { runQuery, describeSchema } from "@/lib/ai/query-engine";
import type { QueryAggregation, QueryOp, QueryResult, QuerySpec } from "@/lib/ai/query-engine";
import { getDashboardTables, type DashboardTable } from "@/lib/ai/dashboard-tables";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";

const AGGREGATIONS: QueryAggregation[] = ["sum", "avg", "count", "min", "max", "distinct"];
const OPS: QueryOp[] = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in"];

function allFieldIds(tables: DashboardTable[]): string[] {
  const ids = new Set<string>();
  for (const table of tables) {
    for (const field of describeSchema(table.rows)) ids.add(field.field);
  }
  return [...ids].sort();
}

// Same rationale as lib/ai/dashboard-context.ts's contextCache: allFieldIds()
// re-derives the schema (describeSchema per table) to build the enum lists
// below, and that schema is stable for the process lifetime — so the tool
// definition itself is memoized per dashboard rather than rebuilt on every
// request.
const toolCache = new Map<DashboardKey, Anthropic.Tool>();

/** Tool schema scoped to exactly one dashboard's own tables and columns. */
export function queryDashboardDataTool(key: DashboardKey): Anthropic.Tool {
  const cached = toolCache.get(key);
  if (cached) return cached;

  const tables = getDashboardTables(key);
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
  toolCache.set(key, tool);
  return tool;
}

export interface DashboardQueryOutcome {
  table: string;
  spec: QuerySpec;
  result: QueryResult;
  /** Set when the table or a field name was rejected — never a silent empty result. */
  error?: string;
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
 * Validates the model's table/field choices against this dashboard's real
 * data before running anything, then executes via lib/ai/query-engine.ts. The
 * row arrays behind each table are today's Data Provider — CSV/mock data.
 * Once real SAP data is connected, only lib/ai/dashboard-tables.ts needs to
 * change (swap its row sources for a live query) — this validation, the tool
 * schema above, and the route that calls this never need to know the
 * difference.
 */
export function runDashboardQuery(key: DashboardKey, input: Record<string, unknown>): DashboardQueryOutcome {
  const tables = getDashboardTables(key);
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

  return { table: tableId, spec: fullSpec, result: runQuery(table.rows, spec) };
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
