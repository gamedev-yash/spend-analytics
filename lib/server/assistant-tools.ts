import "server-only";

// Tool schemas and context rendering for the AI assistant.
//
// The security property lives here: with `strict: true`, every property that
// names a column is an `enum` drawn from the metadata registry, so the model
// cannot emit a column that does not exist — not "is discouraged from", cannot.
// Cross-dataset mixing (an invoice column on a PO query) is still possible in
// principle, and is caught by buildAndExecuteQuery validating each field against
// the dataset actually requested.
//
// Separate from the route so the schemas are unit-testable: a Next route file may
// only export handlers and route config.

import Anthropic from "@anthropic-ai/sdk";
import { getDataset, listColumns, listDatasets } from "@/lib/server/metadata-registry";
import { CHART_TYPE_LABELS } from "@/types/custom-dashboard";
import { MAX_ROWS } from "@/lib/server/query-builder";
import type { QueryAggregation, QueryFilter, QueryPayload, TimeGrain } from "@/types/data-provider";
import type { AssistantQuery } from "@/types/assistant";

/** Rows fed back to the model per query — enough to reason over, cheap to send. */
const RESULT_ROW_LIMIT = 50;

/** Every column id the registry defines, across all datasets. */
export function allColumnIds(): string[] {
  const ids = new Set<string>();
  for (const dataset of listDatasets()) {
    for (const column of listColumns(dataset)) ids.add(column.id);
  }
  return [...ids].sort();
}

/** Tool schema mirroring QueryPayload, with every name constrained to the registry. */
export function queryWarehouseTool(): Anthropic.Tool {
  const columnIds = allColumnIds();
  return {
    name: "query_warehouse",
    description:
      "Aggregate the spend warehouse to answer a question with real numbers. Call this before stating any figure. Group with `dimensions`, measure with `measures`, narrow with `filters`, and bucket dates with `timeGrain`.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        datasetId: {
          type: "string",
          enum: listDatasets().map((d) => d.id),
          description:
            "fact_po_items for committed spend (purchase orders); fact_invoices for actual spend (supplier invoices).",
        },
        dimensions: {
          type: ["array", "null"],
          items: { type: "string", enum: columnIds },
          description:
            "Columns to group by. Omit or null for a single total. A date column here is bucketed at timeGrain.",
        },
        measures: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                enum: [...columnIds, "*"],
                description: 'Numeric column to aggregate, or "*" with aggregation "count" to count rows.',
              },
              aggregation: { type: "string", enum: ["sum", "avg", "count", "distinct"] },
              alias: {
                type: "string",
                description: "Key this measure lands on in each result row, e.g. total_spend.",
              },
            },
            required: ["field", "aggregation", "alias"],
            additionalProperties: false,
          },
          description: "At least one aggregate. sum and avg need a numeric column.",
        },
        filters: {
          type: ["array", "null"],
          items: {
            type: "object",
            properties: {
              field: { type: "string", enum: columnIds },
              operator: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "in"] },
              value: {
                type: ["string", "number", "boolean", "array"],
                items: { type: ["string", "number"] },
                description: 'Scalar, or an array for "in". Dates are "YYYY-MM-DD".',
              },
            },
            required: ["field", "operator", "value"],
            additionalProperties: false,
          },
        },
        timeGrain: {
          anyOf: [{ type: "string", enum: ["month", "quarter", "year"] }, { type: "null" }],
          description: 'Date bucket width. "year" is the Indian fiscal year (April-March).',
        },
        limit: {
          type: ["integer", "null"],
          description: `Top-N cap, at most ${MAX_ROWS}. Combine with a descending sort on a measure alias.`,
        },
        sortBy: {
          type: ["string", "null"],
          description: "A measure alias or a grouped dimension to order by.",
        },
        sortDirection: { anyOf: [{ type: "string", enum: ["asc", "desc"] }, { type: "null" }] },
      },
      required: [
        "datasetId",
        "dimensions",
        "measures",
        "filters",
        "timeGrain",
        "limit",
        "sortBy",
        "sortDirection",
      ],
      additionalProperties: false,
    },
  };
}

/**
 * Tool schema mirroring WidgetConfig (minus the client-assigned id).
 *
 * In warehouse mode the axis properties are enum-constrained to that dataset's
 * registry columns. For an uploaded CSV the columns are only known at runtime, so
 * they stay free-form and the widget's own renderability guard catches a bad pick.
 */
export function createWidgetTool(registryDatasetId: string | null): Anthropic.Tool {
  const dataset = registryDatasetId ? getDataset(registryDatasetId) : undefined;
  const columns = dataset ? listColumns(dataset) : [];
  const groupingIds = columns.filter((c) => c.type !== "number").map((c) => c.id);
  const measureIds = columns.filter((c) => c.type === "number").map((c) => c.id);

  const axis = (ids: string[], description: string) =>
    ids.length > 0
      ? { anyOf: [{ type: "string", enum: ids }, { type: "null" }], description }
      : { type: ["string", "null"], description };

  return {
    name: "create_widget",
    description:
      "Create a dashboard widget from the active dataset. Call this whenever the user asks to see, add, plot, chart, or visualize something.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short human-readable widget title." },
        chartType: {
          type: "string",
          enum: Object.keys(CHART_TYPE_LABELS),
          description: "kpi for a single number; table for a detail list; otherwise the chart form.",
        },
        xAxisColumn: axis(
          groupingIds,
          "Grouping column id (a category or date column). Omit/null for kpi."
        ),
        yAxisColumn: axis(
          measureIds,
          "Metric column id (a numeric column). Omit/null when aggregation is count."
        ),
        // Stacked bars group by two dimensions, so the stack-by column is
        // constrained to the same grouping set as the x-axis.
        seriesColumn: axis(
          groupingIds,
          "Stack-by dimension column id — only for chartType 'stackedBar', a second category/date column distinct from xAxisColumn (ideally ≤ 8 distinct values). Null for every other chart type."
        ),
        aggregation: {
          anyOf: [{ type: "string", enum: ["sum", "avg", "count", "distinct"] }, { type: "null" }],
          description: "How to aggregate the metric column.",
        },
        limit: {
          type: ["integer", "null"],
          description:
            "Top-N cap for grouped charts, e.g. 10 for 'top 10 vendors'. On a date axis, most-recent-N instead.",
        },
        gridSpan: {
          anyOf: [{ type: "integer", enum: [1, 2] }, { type: "null" }],
          description: "1 = half width (default), 2 = full width. Use 2 for line trends and tables.",
        },
      },
      required: [
        "title",
        "chartType",
        "xAxisColumn",
        "yAxisColumn",
        "seriesColumn",
        "aggregation",
        "limit",
        "gridSpan",
      ],
      additionalProperties: false,
    },
  };
}

const AGGREGATIONS: QueryAggregation[] = ["sum", "avg", "count", "distinct"];
const GRAINS: TimeGrain[] = ["month", "quarter", "year"];

/**
 * Tool input → QueryPayload. Reshaping only: the query engine is what validates
 * names and operators, so this must not silently drop anything it does not
 * recognize — a bad field has to reach the engine to produce a real error the
 * model can act on.
 */
export function toQueryPayload(input: Record<string, unknown>): QueryPayload {
  const payload: QueryPayload = { datasetId: String(input.datasetId ?? "") };

  if (Array.isArray(input.measures) && input.measures.length > 0) {
    payload.measures = input.measures.map((entry) => {
      const measure = (entry ?? {}) as Record<string, unknown>;
      return {
        field: String(measure.field ?? ""),
        aggregation: AGGREGATIONS.find((a) => a === measure.aggregation) ?? "sum",
        alias: String(measure.alias ?? "value"),
      };
    });
  }

  if (Array.isArray(input.dimensions) && input.dimensions.length > 0) {
    payload.dimensions = input.dimensions.map((d) => String(d));
  }

  if (Array.isArray(input.filters) && input.filters.length > 0) {
    payload.filters = input.filters.map((entry) => {
      const filter = (entry ?? {}) as Record<string, unknown>;
      return {
        field: String(filter.field ?? ""),
        operator: String(filter.operator ?? "eq"),
        value: filter.value,
      } as QueryFilter;
    });
  }

  const grain = GRAINS.find((g) => g === input.timeGrain);
  if (grain) payload.timeGrain = grain;

  if (typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0) {
    payload.limit = Math.min(Math.floor(input.limit), MAX_ROWS);
  }

  if (typeof input.sortBy === "string" && input.sortBy !== "") {
    payload.sort = { field: input.sortBy, direction: input.sortDirection === "asc" ? "asc" : "desc" };
  }

  return payload;
}

/** Compact rendering of the registry, so the model knows the real column names. */
export function renderRegistryContext(registryDatasetId: string | null | undefined): string {
  const datasets = registryDatasetId
    ? listDatasets().filter((d) => d.id === registryDatasetId)
    : listDatasets();
  if (datasets.length === 0) return "WAREHOUSE SCHEMA: none available.";

  const blocks = datasets.map((dataset) => {
    const columns = listColumns(dataset);
    const grouped = columns.filter((c) => c.type !== "number");
    const measures = columns.filter((c) => c.type === "number");
    return [
      `DATASET ${dataset.id} — ${dataset.name}`,
      `  group by: ${grouped.map((c) => `${c.id} (${c.type})`).join(", ")}`,
      `  measures: ${measures.map((c) => c.id).join(", ")}`,
    ].join("\n");
  });

  return [
    "WAREHOUSE SCHEMA — the only column names that exist. Amounts ending _inr are Indian rupees.",
    ...blocks,
  ].join("\n");
}

/** Rows the model must reason over, truncated so a wide result stays affordable. */
export function renderQueryResult(query: AssistantQuery): string {
  if (query.error) {
    return `QUERY FAILED: ${query.error}\nFix the query and try again, or tell the user what is missing. Do not invent numbers.`;
  }
  const total = query.result.rows.length;
  if (total === 0) return "QUERY RESULT: no rows matched.";
  const shown = query.result.rows.slice(0, RESULT_ROW_LIMIT);
  const matched = (query.result.totalMatchingRows ?? 0).toLocaleString("en-IN");
  return [
    `QUERY RESULT (${total} row${total === 1 ? "" : "s"}, ${matched} source rows matched):`,
    ...shown.map((row) => JSON.stringify(row)),
    ...(total > shown.length ? [`… ${total - shown.length} more rows omitted`] : []),
  ].join("\n");
}
