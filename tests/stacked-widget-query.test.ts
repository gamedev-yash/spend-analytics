// The stackedBar path after it was moved from a local pass over dataset.rows onto
// the provider contract during the ai/starschema merge.
//
// The behaviours preserved from the original client-side implementation are the
// ones worth pinning: series ranked by contribution, the top MAX_STACK_SERIES kept
// with the remainder folded into one "Other" bucket, absent segments zero-filled,
// and a date axis ordered chronologically with `limit` meaning "most recent N".

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStackedWidgetPayload,
  limitStackedPoints,
  stackedSeriesFromResult,
} from "@/lib/widget-query";
import { MAX_STACK_SERIES, OTHER_SERIES_KEY, isWidgetRenderable } from "@/lib/widget-data";
import { createWidgetTool } from "@/lib/server/assistant-tools";
import { buildQuery } from "@/lib/server/query-builder";
import { getDataset, listColumns } from "@/lib/server/metadata-registry";
import type { QueryResult } from "@/types/data-provider";
import type { WidgetConfig } from "@/types/custom-dashboard";
import type { ColumnMeta } from "@/lib/infer";
import type { Dataset } from "@/types/dataset";

function dataset(columns: ColumnMeta[]): Dataset {
  return { id: "ds-test", name: "test.csv", rows: [], columns, createdAt: "1970-01-01T00:00:00.000Z" };
}

const CATEGORY_AXIS = dataset([
  { id: "plant", name: "Plant", type: "category", distinctCount: 7 },
  { id: "category", name: "Category", type: "category", distinctCount: 13 },
  { id: "spend", name: "Spend", type: "number", distinctCount: 900 },
]);

const DATE_AXIS = dataset([
  { id: "po_date", name: "PO Date", type: "date", distinctCount: 900 },
  { id: "category", name: "Category", type: "category", distinctCount: 13 },
  { id: "spend", name: "Spend", type: "number", distinctCount: 900 },
]);

function stackedConfig(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "w1",
    title: "Spend by plant, split by category",
    chartType: "stackedBar",
    xAxisColumn: "plant",
    seriesColumn: "category",
    yAxisColumn: "spend",
    aggregation: "sum",
    ...overrides,
  };
}

/** A provider result: one row per (outer group, series key) pair. */
function result(rows: [string, string, number, number][], outer = "plant"): QueryResult {
  return {
    rows: rows.map(([group, series, value, count]) => ({
      [outer]: group,
      category: series,
      value,
      count,
    })),
    totalMatchingRows: rows.reduce((sum, r) => sum + r[3], 0),
  };
}

describe("buildStackedWidgetPayload", () => {
  it("asks for both dimensions in one query", () => {
    const payload = buildStackedWidgetPayload(CATEGORY_AXIS, stackedConfig(), []);
    assert.ok(payload);
    assert.deepEqual(payload.dimensions, ["plant", "category"]);
    assert.deepEqual(
      payload.measures?.map((m) => [m.field, m.aggregation, m.alias]),
      [
        ["spend", "sum", "value"],
        ["*", "count", "count"],
      ]
    );
  });

  it("omits limit, so Top-N cannot truncate segments instead of groups", () => {
    const payload = buildStackedWidgetPayload(CATEGORY_AXIS, stackedConfig({ limit: 5 }), []);
    assert.ok(payload);
    assert.equal(payload.limit, undefined);
  });

  it("sets sort only on a date axis, as the chronological-ordering signal", () => {
    const category = buildStackedWidgetPayload(CATEGORY_AXIS, stackedConfig(), []);
    assert.equal(category?.sort, undefined);

    const date = buildStackedWidgetPayload(
      DATE_AXIS,
      stackedConfig({ xAxisColumn: "po_date" }),
      []
    );
    assert.deepEqual(date?.sort, { field: "po_date", direction: "asc" });
  });

  it("declines a config the stacked chart cannot express", () => {
    // No stack-by column.
    assert.equal(buildStackedWidgetPayload(CATEGORY_AXIS, stackedConfig({ seriesColumn: undefined }), []), null);
    // Stacking by the axis itself would produce one segment per group.
    assert.equal(buildStackedWidgetPayload(CATEGORY_AXIS, stackedConfig({ seriesColumn: "plant" }), []), null);
    // sum with no measure column.
    assert.equal(buildStackedWidgetPayload(CATEGORY_AXIS, stackedConfig({ yAxisColumn: undefined }), []), null);
    // A renamed/removed column.
    assert.equal(buildStackedWidgetPayload(CATEGORY_AXIS, stackedConfig({ seriesColumn: "ghost" }), []), null);
  });

  it("agrees with isWidgetRenderable about what is answerable", () => {
    for (const config of [
      stackedConfig(),
      stackedConfig({ seriesColumn: undefined }),
      stackedConfig({ seriesColumn: "plant" }),
      stackedConfig({ yAxisColumn: undefined }),
    ]) {
      const payload = buildStackedWidgetPayload(CATEGORY_AXIS, config, []);
      assert.equal(
        payload !== null,
        isWidgetRenderable(CATEGORY_AXIS, config),
        `disagreement for ${JSON.stringify(config)}`
      );
    }
  });

  it("passes filters through untouched", () => {
    const filters = [{ field: "category", operator: "eq" as const, value: "Raw Materials" }];
    const payload = buildStackedWidgetPayload(CATEGORY_AXIS, stackedConfig(), filters);
    assert.deepEqual(payload?.filters, filters);
  });
});

describe("stackedSeriesFromResult", () => {
  const payload = buildStackedWidgetPayload(CATEGORY_AXIS, stackedConfig(), [])!;

  it("nests rows into one point per outer group", () => {
    const stacked = stackedSeriesFromResult(
      result([
        ["HZL", "Raw Materials", 100, 4],
        ["HZL", "Fuel", 50, 2],
        ["BALCO", "Raw Materials", 30, 1],
      ]),
      payload
    );

    assert.deepEqual(stacked.points.map((p) => p.label), ["HZL", "BALCO"]);
    assert.equal(stacked.points[0].total, 150);
    assert.equal(stacked.points[0].count, 6, "count is the rows behind the whole stack");
    assert.deepEqual(stacked.points[0].values, { "Raw Materials": 100, Fuel: 50 });
  });

  it("ranks groups by total, descending, on a category axis", () => {
    const stacked = stackedSeriesFromResult(
      result([
        ["small", "A", 1, 1],
        ["big", "A", 100, 1],
        ["mid", "A", 50, 1],
      ]),
      payload
    );
    assert.deepEqual(stacked.points.map((p) => p.label), ["big", "mid", "small"]);
    assert.equal(stacked.dateAxis, false);
  });

  it("zero-fills a series missing from a group, so no segment renders as a gap", () => {
    const stacked = stackedSeriesFromResult(
      result([
        ["HZL", "Raw Materials", 100, 1],
        ["BALCO", "Fuel", 40, 1],
      ]),
      payload
    );
    for (const point of stacked.points) {
      for (const key of stacked.seriesKeys) {
        assert.equal(typeof point.values[key], "number", `${point.label} missing ${key}`);
      }
    }
    assert.equal(stacked.points.find((p) => p.label === "HZL")?.values.Fuel, 0);
  });

  it(`keeps the top ${MAX_STACK_SERIES} series and folds the rest into "${OTHER_SERIES_KEY}"`, () => {
    // 10 series keys, contribution descending, so the last 3 must fold.
    const rows = Array.from({ length: 10 }, (_, i): [string, string, number, number] => [
      "HZL",
      `S${i}`,
      100 - i * 5,
      1,
    ]);
    const stacked = stackedSeriesFromResult(result(rows), payload);

    assert.equal(stacked.seriesKeys.length, MAX_STACK_SERIES + 1);
    assert.equal(stacked.seriesKeys.at(-1), OTHER_SERIES_KEY, "Other sorts last for colour order");
    assert.deepEqual(stacked.seriesKeys.slice(0, MAX_STACK_SERIES), ["S0", "S1", "S2", "S3", "S4", "S5", "S6"]);

    const point = stacked.points[0];
    // Folding must conserve the total, not drop the tail.
    assert.equal(point.total, rows.reduce((sum, r) => sum + r[2], 0));
    // S0..S6 are kept, so S7+S8+S9 fold: 65 + 60 + 55.
    assert.equal(point.values[OTHER_SERIES_KEY], 65 + 60 + 55);
  });

  it("adds no Other bucket when every series fits", () => {
    const stacked = stackedSeriesFromResult(
      result([
        ["HZL", "A", 10, 1],
        ["HZL", "B", 5, 1],
      ]),
      payload
    );
    assert.deepEqual(stacked.seriesKeys, ["A", "B"]);
    assert.equal(OTHER_SERIES_KEY in stacked.points[0].values, false);
  });

  it("labels an empty grouping value rather than dropping the row", () => {
    const stacked = stackedSeriesFromResult(
      { rows: [{ plant: null, category: null, value: 10, count: 1 }] },
      payload
    );
    assert.equal(stacked.points[0].label, "(No value)");
    assert.deepEqual(Object.keys(stacked.points[0].values), ["(No value)"]);
  });

  it("returns empty for a result with no dimensions", () => {
    const stacked = stackedSeriesFromResult(result([["HZL", "A", 1, 1]]), {
      datasetId: "ds-test",
    });
    assert.deepEqual(stacked, { points: [], seriesKeys: [] });
  });

  describe("date axis", () => {
    const datePayload = buildStackedWidgetPayload(
      DATE_AXIS,
      stackedConfig({ xAxisColumn: "po_date" }),
      []
    )!;

    it("orders chronologically, not by contribution", () => {
      const stacked = stackedSeriesFromResult(
        result(
          [
            ["2025-03", "A", 5, 1],
            ["2025-01", "A", 100, 1],
            ["2025-02", "A", 50, 1],
          ],
          "po_date"
        ),
        datePayload
      );
      assert.deepEqual(stacked.points.map((p) => p.label), ["2025-01", "2025-02", "2025-03"]);
      assert.equal(stacked.dateAxis, true);
    });
  });
});

describe("limitStackedPoints", () => {
  const payload = buildStackedWidgetPayload(CATEGORY_AXIS, stackedConfig(), [])!;
  const datePayload = buildStackedWidgetPayload(DATE_AXIS, stackedConfig({ xAxisColumn: "po_date" }), [])!;

  const categoryStacked = stackedSeriesFromResult(
    result([
      ["big", "A", 100, 1],
      ["mid", "A", 50, 1],
      ["small", "A", 1, 1],
    ]),
    payload
  );
  const dateStacked = stackedSeriesFromResult(
    result(
      [
        ["2025-01", "A", 1, 1],
        ["2025-02", "A", 2, 1],
        ["2025-03", "A", 3, 1],
      ],
      "po_date"
    ),
    datePayload
  );

  it("keeps the largest contributors on a category axis", () => {
    const limited = limitStackedPoints(categoryStacked, 2);
    assert.deepEqual(limited.points.map((p) => p.label), ["big", "mid"]);
  });

  it("keeps the most recent buckets on a date axis", () => {
    const limited = limitStackedPoints(dateStacked, 2);
    assert.deepEqual(limited.points.map((p) => p.label), ["2025-02", "2025-03"]);
  });

  it("is a no-op without a limit, or when the limit is not binding", () => {
    assert.equal(limitStackedPoints(categoryStacked, undefined), categoryStacked);
    assert.equal(limitStackedPoints(categoryStacked, 99), categoryStacked);
  });

  it("preserves seriesKeys, so colour assignment does not shift when capped", () => {
    const limited = limitStackedPoints(categoryStacked, 1);
    assert.deepEqual(limited.seriesKeys, categoryStacked.seriesKeys);
  });
});

describe("create_widget tool after the merge", () => {
  type Schema = Record<string, unknown>;
  const props = (tool: { input_schema: unknown }) =>
    (tool.input_schema as { properties: Record<string, Schema> }).properties;

  it("requires seriesColumn, so strict mode always sends it", () => {
    const required = (createWidgetTool("fact_po_items").input_schema as { required: string[] }).required;
    assert.ok(required.includes("seriesColumn"));
  });

  // Nullable + enum-constrained axis properties use `{ anyOf: [{type,enum}, {type:"null"}] }`,
  // not `{ type: [X,"null"], enum: [...values, null] }` — Anthropic's strict tool-use API
  // rejects the latter outright (see lib/server/assistant-tools.ts's `axis()` helper).
  function nullableEnumOf(schema: Schema): unknown[] {
    const branches = schema.anyOf as Schema[];
    assert.ok(Array.isArray(branches) && branches.length === 2);
    return [...(branches[0].enum as unknown[]), null];
  }

  it("enum-constrains seriesColumn to the dataset's grouping columns", () => {
    const dataset = getDataset("fact_po_items");
    assert.ok(dataset);
    const grouping = listColumns(dataset)
      .filter((c) => c.type !== "number")
      .map((c) => c.id);
    const schema = props(createWidgetTool("fact_po_items")).seriesColumn;
    assert.deepEqual(nullableEnumOf(schema), [...grouping, null]);
  });

  it("never offers a measure column as the stack-by dimension", () => {
    const dataset = getDataset("fact_invoices");
    assert.ok(dataset);
    const measures = new Set(
      listColumns(dataset).filter((c) => c.type === "number").map((c) => c.id)
    );
    const seriesEnum = nullableEnumOf(props(createWidgetTool("fact_invoices")).seriesColumn);
    for (const id of seriesEnum) {
      if (id !== null) assert.equal(measures.has(String(id)), false, `${String(id)} is a measure`);
    }
  });

  it("keeps seriesColumn free-form for an uploaded CSV", () => {
    assert.equal("enum" in props(createWidgetTool(null)).seriesColumn, false);
  });

  it("a stacked payload the model could compose still compiles to T-SQL", () => {
    // The warehouse equivalent of a stackedBar: two dimensions, one measure.
    assert.doesNotThrow(() =>
      buildQuery({
        datasetId: "fact_po_items",
        dimensions: ["plant_name", "category_l1_name"],
        measures: [{ field: "net_order_value_inr", aggregation: "sum", alias: "value" }],
      })
    );
  });
});
