// The assistant's tool schemas and payload mapping.
//
// The property under test is containment: with `strict: true`, every schema
// property that names a column carries an `enum` drawn from the metadata
// registry, so a hallucinated column name cannot be emitted at all. Anything
// that does slip through — a cross-dataset field, a bad operator — must still be
// rejected by the query engine rather than reaching SQL.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allColumnIds,
  createWidgetTool,
  queryWarehouseTool,
  renderQueryResult,
  renderRegistryContext,
  toQueryPayload,
} from "@/lib/server/assistant-tools";
import { buildQuery, MAX_ROWS, QueryValidationError } from "@/lib/server/query-builder";
import { getDataset, listColumns, listDatasets } from "@/lib/server/metadata-registry";

type Schema = Record<string, unknown>;

function properties(tool: { input_schema: unknown }): Record<string, Schema> {
  return (tool.input_schema as { properties: Record<string, Schema> }).properties;
}

function enumOf(schema: Schema): unknown[] {
  assert.ok(Array.isArray(schema.enum), `expected an enum, got ${JSON.stringify(schema)}`);
  return schema.enum;
}

/**
 * A nullable enum-constrained property is `{ anyOf: [{ type, enum }, { type: "null" }] }`
 * — Anthropic's strict tool-use API rejects the shorter `{ type: [X, "null"], enum: [...values, null] }`
 * form outright (400 "Enum value ... does not match declared type"), so every
 * nullable + enum property in this codebase uses anyOf instead. This reads the
 * enum back out, plus a trailing `null` so call sites that expect the old
 * "enum including null" shape don't need to change.
 */
function nullableEnumOf(schema: Schema): unknown[] {
  const branches = schema.anyOf;
  assert.ok(Array.isArray(branches) && branches.length === 2, `expected a 2-branch anyOf, got ${JSON.stringify(schema)}`);
  const [enumBranch, nullBranch] = branches as Schema[];
  assert.equal(nullBranch.type, "null");
  assert.ok(Array.isArray(enumBranch.enum), `expected an enum, got ${JSON.stringify(enumBranch)}`);
  return [...(enumBranch.enum as unknown[]), null];
}

describe("query_warehouse tool schema", () => {
  const tool = queryWarehouseTool();
  const props = properties(tool);

  it("is strict, so the model cannot invent properties or values", () => {
    assert.equal(tool.strict, true);
    assert.equal((tool.input_schema as Schema).additionalProperties, false);
  });

  it("mirrors QueryPayload", () => {
    assert.deepEqual(Object.keys(props).sort(), [
      "datasetId",
      "dimensions",
      "filters",
      "limit",
      "measures",
      "sortBy",
      "sortDirection",
      "timeGrain",
    ]);
  });

  it("constrains datasetId to the registry's datasets", () => {
    assert.deepEqual(enumOf(props.datasetId), listDatasets().map((d) => d.id));
  });

  it("constrains every column-naming property to registry column ids", () => {
    const known = new Set(allColumnIds());
    assert.ok(known.size > 0);

    const dimensionEnum = enumOf((props.dimensions as { items: Schema }).items);
    assert.deepEqual(dimensionEnum, [...known].sort());

    const measureProps = ((props.measures as { items: Schema }).items as { properties: Record<string, Schema> })
      .properties;
    // COUNT_ALL is the one non-column value a measure field may take.
    assert.deepEqual(enumOf(measureProps.field), [...[...known].sort(), "*"]);
    assert.deepEqual(enumOf(measureProps.aggregation), ["sum", "avg", "count", "distinct"]);

    const filterProps = ((props.filters as { items: Schema }).items as { properties: Record<string, Schema> })
      .properties;
    assert.deepEqual(enumOf(filterProps.field), [...known].sort());
    assert.deepEqual(enumOf(filterProps.operator), ["eq", "neq", "gt", "gte", "lt", "lte", "in"]);
  });

  it("offers only the grains both providers implement", () => {
    assert.deepEqual(nullableEnumOf(props.timeGrain), ["month", "quarter", "year", null]);
  });

  it("tells the model the real row cap", () => {
    assert.match(String(props.limit.description), new RegExp(String(MAX_ROWS)));
  });
});

describe("create_widget tool schema", () => {
  it("enum-constrains axes to the dataset's registry columns in warehouse mode", () => {
    const dataset = getDataset("fact_po_items");
    assert.ok(dataset);
    const columns = listColumns(dataset);
    const props = properties(createWidgetTool("fact_po_items"));

    assert.deepEqual(
      nullableEnumOf(props.xAxisColumn),
      [...columns.filter((c) => c.type !== "number").map((c) => c.id), null]
    );
    assert.deepEqual(
      nullableEnumOf(props.yAxisColumn),
      [...columns.filter((c) => c.type === "number").map((c) => c.id), null]
    );
  });

  it("keeps axes free-form for an uploaded CSV, whose columns are runtime-only", () => {
    const props = properties(createWidgetTool(null));
    assert.equal("enum" in props.xAxisColumn, false);
    assert.equal("enum" in props.yAxisColumn, false);
  });

  it("never offers a measure column as a grouping axis, or vice versa", () => {
    for (const dataset of listDatasets()) {
      const props = properties(createWidgetTool(dataset.id));
      const grouping = new Set(nullableEnumOf(props.xAxisColumn).filter((v) => v !== null));
      const measures = new Set(nullableEnumOf(props.yAxisColumn).filter((v) => v !== null));
      for (const id of grouping) assert.equal(measures.has(id), false, `${String(id)} in both`);
    }
  });
});

describe("toQueryPayload", () => {
  it("maps a complete tool call onto a payload the builder accepts", () => {
    const payload = toQueryPayload({
      datasetId: "fact_po_items",
      dimensions: ["category_l1_name"],
      measures: [{ field: "net_order_value_inr", aggregation: "sum", alias: "total_spend" }],
      filters: [{ field: "currency_code", operator: "in", value: ["INR", "USD"] }],
      timeGrain: null,
      limit: 10,
      sortBy: "total_spend",
      sortDirection: "desc",
    });

    assert.deepEqual(payload, {
      datasetId: "fact_po_items",
      measures: [{ field: "net_order_value_inr", aggregation: "sum", alias: "total_spend" }],
      dimensions: ["category_l1_name"],
      filters: [{ field: "currency_code", operator: "in", value: ["INR", "USD"] }],
      limit: 10,
      sort: { field: "total_spend", direction: "desc" },
    });
    assert.doesNotThrow(() => buildQuery(payload));
  });

  it("drops the nulls the strict schema requires the model to send", () => {
    const payload = toQueryPayload({
      datasetId: "fact_invoices",
      dimensions: null,
      measures: [{ field: "*", aggregation: "count", alias: "invoices" }],
      filters: null,
      timeGrain: null,
      limit: null,
      sortBy: null,
      sortDirection: null,
    });
    assert.deepEqual(Object.keys(payload).sort(), ["datasetId", "measures"]);
    assert.doesNotThrow(() => buildQuery(payload));
  });

  it("clamps a limit above the hard cap instead of letting the query be rejected", () => {
    const payload = toQueryPayload({
      datasetId: "fact_po_items",
      measures: [{ field: "*", aggregation: "count", alias: "n" }],
      limit: 999_999,
    });
    assert.equal(payload.limit, MAX_ROWS);
    assert.doesNotThrow(() => buildQuery(payload));
  });

  it("passes a bad column through so the engine reports it, rather than silently dropping it", () => {
    // Silently discarding an unknown field would make the model believe its
    // query ran as written.
    const payload = toQueryPayload({
      datasetId: "fact_po_items",
      dimensions: ["not_a_column"],
      measures: [{ field: "*", aggregation: "count", alias: "n" }],
    });
    assert.deepEqual(payload.dimensions, ["not_a_column"]);
    assert.throws(() => buildQuery(payload), QueryValidationError);
  });

  it("rejects a column that exists on the other dataset", () => {
    // gross_amount_inr is an invoice measure; asking for it on PO items must fail.
    const payload = toQueryPayload({
      datasetId: "fact_po_items",
      measures: [{ field: "gross_amount_inr", aggregation: "sum", alias: "v" }],
    });
    assert.throws(() => buildQuery(payload), QueryValidationError);
  });

  it("normalizes a timeGrain the schema allows", () => {
    for (const grain of ["month", "quarter", "year"] as const) {
      const payload = toQueryPayload({
        datasetId: "fact_po_items",
        dimensions: ["po_date"],
        measures: [{ field: "net_order_value_inr", aggregation: "sum", alias: "v" }],
        timeGrain: grain,
      });
      assert.equal(payload.timeGrain, grain);
      assert.doesNotThrow(() => buildQuery(payload));
    }
  });
});

describe("model-facing context", () => {
  it("lists the schema for one dataset when the client names it", () => {
    const context = renderRegistryContext("fact_po_items");
    assert.match(context, /DATASET fact_po_items/);
    assert.doesNotMatch(context, /DATASET fact_invoices/);
    assert.match(context, /net_order_value_inr/);
    // Grouping columns and measures are listed separately so the model does not
    // try to sum a category.
    assert.match(context, /group by:/);
    assert.match(context, /measures:/);
  });

  it("lists every dataset when none is named", () => {
    const context = renderRegistryContext(null);
    for (const dataset of listDatasets()) {
      assert.match(context, new RegExp(`DATASET ${dataset.id}`));
    }
  });

  it("hands back rows the model can read, with the matched row count", () => {
    const rendered = renderQueryResult({
      payload: { datasetId: "fact_po_items" },
      result: { rows: [{ category_l1_name: "Raw Materials", value: 12345 }], totalMatchingRows: 10000 },
      source: "sample-csv",
    });
    assert.match(rendered, /QUERY RESULT \(1 row, 10,000 source rows matched\)/);
    assert.match(rendered, /Raw Materials/);
  });

  it("says so plainly when nothing matched", () => {
    const rendered = renderQueryResult({
      payload: { datasetId: "fact_po_items" },
      result: { rows: [], totalMatchingRows: 0 },
      source: "sample-csv",
    });
    assert.match(rendered, /no rows matched/);
  });

  it("surfaces a failure as a correctable error, not as empty data", () => {
    const rendered = renderQueryResult({
      payload: { datasetId: "fact_po_items" },
      result: { rows: [] },
      source: "none",
      error: 'Unknown field "vendor_naem"',
    });
    assert.match(rendered, /QUERY FAILED/);
    assert.match(rendered, /vendor_naem/);
    assert.match(rendered, /Do not invent numbers/);
  });

  it("truncates a large result rather than sending everything", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ vendor_name: `V${i}`, value: i }));
    const rendered = renderQueryResult({
      payload: { datasetId: "fact_po_items" },
      result: { rows, totalMatchingRows: 10000 },
      source: "sample-csv",
    });
    assert.match(rendered, /450 more rows omitted/);
    assert.equal(rendered.split("\n").length, 52, "50 rows + header + omission note");
  });
});
