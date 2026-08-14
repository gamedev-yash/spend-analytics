// The generated-dashboard half of the ONE dashboard assistant.
//
// What these tests are actually for: proving that a generated dashboard reaches
// the model through the SAME machinery a built-in one does (one resolver, one
// data context, one query tool, one conversation memory, one report pipeline),
// and that the seams where the two kinds meet cannot leak into each other.
//
// The three properties worth the most here, because they are the ones a plausible
// implementation gets wrong:
//   1. ISOLATION — a query issued while dashboard A is open can name only A's
//      table and A's columns, and its cached result can never be served to B,
//      even when B's schema is identical.
//   2. GROUNDING — the aggregate the model would read back is reconciled against
//      an independently computed total from the same rows, not just "a number".
//   3. TOKEN SHAPE — the prompt text a dashboard contributes is the same size for
//      10 rows and 10,000, because rows never enter it.
//
// Deliberately no Claude call anywhere: everything below is the deterministic
// layer under the model (resolution, schema, validation, execution, caching), and
// that is exactly the layer where an isolation bug would live.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  dashboardContextId,
  parseDashboardContext,
  parseDashboardContextId,
  resolveDashboardContext,
} from "@/lib/ai/dashboard-context";
import {
  _clearCustomDashboardsForTests,
  getCustomDashboard,
  putCustomDashboard,
  MAX_SNAPSHOT_ROWS,
} from "@/lib/ai/custom-dashboard-registry";
import {
  CUSTOM_DASHBOARD_TABLE_ID,
  buildDashboardSchemaBlock,
  resolveDashboardDataContext,
  _clearSchemaBlockCacheForTests,
  type DashboardDataContext,
} from "@/lib/ai/dashboard-data-context";
import { queryDashboardDataTool, runDashboardQuery } from "@/lib/ai/dashboard-query";
import { _clearQueryCacheForTests } from "@/lib/ai/query-cache";
import {
  applyQueryToContext,
  buildConversationMemoryBlock,
  type ConversationContext,
} from "@/lib/ai/conversation-context";
import { assistantActionsFor } from "@/lib/ai/actions/assistant-actions";
import { buildReportCacheKey } from "@/lib/ai/reports/report-cache";
import type { DashboardPlan } from "@/types/generated-dashboard";
import type { DatasetProfile } from "@/types/dataset-profile";

afterEach(() => {
  _clearCustomDashboardsForTests();
  _clearQueryCacheForTests();
  _clearSchemaBlockCacheForTests();
});

// ---------------------------------------------------------------------------
// Fixtures — two unrelated generated dashboards, so every isolation assertion
// has a real second dataset to be isolated FROM. Neither subject appears
// anywhere in the implementation; that is the point of using two.
// ---------------------------------------------------------------------------

function profileFor(columns: string[], measures: string[], dimensions: string[], rowCount: number): DatasetProfile {
  return {
    rowCount,
    columnCount: columns.length,
    sampled: false,
    parseWarnings: [],
    columns: columns.map((name, position) => ({
      name,
      position,
      role: measures.includes(name) ? "measure" : dimensions.includes(name) ? "dimension" : "text",
      nullCount: 0,
      nullPct: 0,
      isConstant: false,
      distinctCount: 3,
      distinctRatio: 0.3,
    })),
    candidates: { measures, dimensions, temporal: [], identifiers: [] },
    shape: { isLongFormat: false, reasoning: "one row per record" },
    truncated: false,
  };
}

function planFor(title: string, headline: string[], heading: string): DashboardPlan {
  return {
    title,
    subtitle: `${title} overview`,
    domain: title,
    grain: "one row per record",
    headlineMetrics: headline,
    sections: [{ id: "s1", heading, intent: `Show ${heading}.`, whyItMatters: `${heading} drives the outcome.`, priority: 1 }],
    caveats: ["Figures are as supplied in the source file."],
    excludedColumns: [{ name: "notes", reason: "free text" }],
  };
}

const PROFITABILITY_ROWS = [
  { supplier: "Alpha", profit: 100, spend: 1000, category: "A" },
  { supplier: "Beta", profit: 300, spend: 2000, category: "B" },
  { supplier: "Alpha", profit: 50, spend: 500, category: "B" },
  { supplier: "Gamma", profit: 25, spend: 4000, category: "A" },
];

const INVENTORY_ROWS = [
  { product: "Widget", stock: 10, warehouse: "North", value: 900 },
  { product: "Gadget", stock: 40, warehouse: "South", value: 1200 },
  { product: "Widget", stock: 5, warehouse: "South", value: 450 },
];

/** Registers a dashboard exactly as the client's sync call would, then resolves it. */
function registerProfitability(id = "profit001") {
  const columns = ["supplier", "profit", "spend", "category"];
  const result = putCustomDashboard({
    id,
    title: "Supplier Profitability",
    createdAt: "2026-01-05T10:00:00.000Z",
    sourceFileName: "profitability.csv",
    profile: profileFor(columns, ["profit", "spend"], ["supplier", "category"], PROFITABILITY_ROWS.length),
    plan: planFor("Supplier Profitability", ["Total profit", "Profit by supplier"], "Profit concentration"),
    widgets: [],
    columns,
    rows: PROFITABILITY_ROWS,
  });
  assert.equal(result.ok, true, result.error);
  return resolveDashboardDataContext({ type: "custom", dashboardId: id })!;
}

function registerInventory(id = "inv002") {
  const columns = ["product", "stock", "warehouse", "value"];
  const result = putCustomDashboard({
    id,
    title: "Inventory Analysis",
    createdAt: "2026-02-11T08:30:00.000Z",
    sourceFileName: "inventory.csv",
    profile: profileFor(columns, ["stock", "value"], ["product", "warehouse"], INVENTORY_ROWS.length),
    plan: planFor("Inventory Analysis", ["Total stock", "Value by warehouse"], "Stock coverage"),
    widgets: [],
    columns,
    rows: INVENTORY_ROWS,
  });
  assert.equal(result.ok, true, result.error);
  return resolveDashboardDataContext({ type: "custom", dashboardId: id })!;
}

function builtin(): DashboardDataContext {
  return resolveDashboardDataContext({ type: "builtin", dashboardKey: "tail-spend" })!;
}

type ToolSchema = { input_schema: { properties: Record<string, { enum?: unknown[]; anyOf?: { enum?: unknown[] }[] }> } };

function tableEnum(tool: unknown): unknown[] {
  return (tool as ToolSchema).input_schema.properties.table.enum ?? [];
}

function fieldEnum(tool: unknown): unknown[] {
  const groupBy = (tool as ToolSchema).input_schema.properties.groupBy;
  return groupBy.anyOf?.[0]?.enum ?? [];
}

// ---------------------------------------------------------------------------
// The resolver — one function, both dashboard kinds (§4)
// ---------------------------------------------------------------------------

describe("resolveDashboardContext — the single route→dashboard resolver", () => {
  it("resolves a generated dashboard route to a custom context, not null", () => {
    assert.deepEqual(resolveDashboardContext("/generated/abc123"), { type: "custom", dashboardId: "abc123" });
    // A deeper path under the same dashboard resolves to the same dashboard,
    // matching how a built-in dashboard's sub-pages behave.
    assert.deepEqual(resolveDashboardContext("/generated/abc123/detail"), { type: "custom", dashboardId: "abc123" });
  });

  it("still resolves every built-in dashboard exactly as before", () => {
    assert.deepEqual(resolveDashboardContext("/tail-spend"), { type: "builtin", dashboardKey: "tail-spend" });
    assert.deepEqual(resolveDashboardContext("/compliance"), { type: "builtin", dashboardKey: "compliance" });
  });

  it("returns null off a dashboard route, and for a malformed generated id", () => {
    assert.equal(resolveDashboardContext("/"), null);
    assert.equal(resolveDashboardContext("/assistant"), null);
    assert.equal(resolveDashboardContext("/generated/"), null);
    // A colon would let a hostile id forge a context id; a dot/slash would reach
    // another route's path space.
    assert.equal(resolveDashboardContext("/generated/a:b"), null);
    assert.equal(resolveDashboardContext("/generated/..%2Fetc"), null);
  });

  it("produces distinct, parseable context ids per dashboard", () => {
    assert.equal(dashboardContextId({ type: "builtin", dashboardKey: "tail-spend" }), "builtin:tail-spend");
    assert.equal(dashboardContextId({ type: "custom", dashboardId: "abc123" }), "custom:abc123");
    assert.deepEqual(parseDashboardContextId("custom:abc123"), { type: "custom", dashboardId: "abc123" });
    assert.deepEqual(parseDashboardContextId("builtin:compliance"), { type: "builtin", dashboardKey: "compliance" });
    // Links minted before generated dashboards had an assistant.
    assert.deepEqual(parseDashboardContextId("compliance"), { type: "builtin", dashboardKey: "compliance" });
    assert.equal(parseDashboardContextId("custom:bad id"), null);
    assert.equal(parseDashboardContextId("nonsense:x"), null);
  });
});

describe("parseDashboardContext — the wire form is validated, never trusted (§24)", () => {
  it("accepts only a known built-in key or a well-formed generated id", () => {
    assert.deepEqual(parseDashboardContext({ type: "builtin", dashboardKey: "compliance" }), {
      type: "builtin",
      dashboardKey: "compliance",
    });
    assert.deepEqual(parseDashboardContext({ type: "custom", dashboardId: "abc-123_X" }), {
      type: "custom",
      dashboardId: "abc-123_X",
    });
    assert.equal(parseDashboardContext({ type: "builtin", dashboardKey: "not-a-dashboard" }), null);
    assert.equal(parseDashboardContext({ type: "custom", dashboardId: "../../etc/passwd" }), null);
    assert.equal(parseDashboardContext({ type: "custom", dashboardId: "x".repeat(65) }), null);
    assert.equal(parseDashboardContext({ type: "custom" }), null);
    assert.equal(parseDashboardContext({ type: "other", dashboardId: "abc" }), null);
    assert.equal(parseDashboardContext("compliance"), null);
    assert.equal(parseDashboardContext(null), null);
  });
});

// ---------------------------------------------------------------------------
// Registration — the client's snapshot is validated before it can be queried
// ---------------------------------------------------------------------------

describe("putCustomDashboard — validation before anything becomes queryable", () => {
  const valid = {
    id: "ok1",
    title: "Fine",
    createdAt: "2026-01-01T00:00:00.000Z",
    sourceFileName: "f.csv",
    profile: profileFor(["a", "b"], ["b"], ["a"], 1),
    plan: planFor("Fine", ["Total b"], "Bs"),
    widgets: [],
    columns: ["a", "b"],
    rows: [{ a: "x", b: 1 }],
  };

  it("stores a well-formed snapshot and reports a version", () => {
    const result = putCustomDashboard(valid);
    assert.equal(result.ok, true);
    assert.ok(result.version && result.version.length > 0);
    assert.equal(getCustomDashboard("ok1")?.title, "Fine");
  });

  it("rejects a malformed id rather than storing it under a coerced key", () => {
    assert.equal(putCustomDashboard({ ...valid, id: "a:b" }).ok, false);
    assert.equal(putCustomDashboard({ ...valid, id: "" }).ok, false);
    assert.equal(getCustomDashboard("a:b"), null);
  });

  it("rejects an empty or oversized dataset instead of answering from a partial one", () => {
    assert.equal(putCustomDashboard({ ...valid, rows: [] }).ok, false);
    const tooMany = { ...valid, rows: Array.from({ length: MAX_SNAPSHOT_ROWS + 1 }, () => ({ a: "x", b: 1 })) };
    assert.equal(putCustomDashboard(tooMany).ok, false);
  });

  it("rejects rows that aren't objects, and a missing plan/profile", () => {
    assert.equal(putCustomDashboard({ ...valid, rows: [1, 2, 3] }).ok, false);
    assert.equal(putCustomDashboard({ ...valid, plan: undefined }).ok, false);
    assert.equal(putCustomDashboard({ ...valid, profile: undefined }).ok, false);
    assert.equal(putCustomDashboard({ ...valid, columns: [] }).ok, false);
  });

  it("changes its version when the content changes, so caches can't go stale", () => {
    const first = putCustomDashboard(valid).version;
    const renamed = putCustomDashboard({ ...valid, title: "Fine, revised" }).version;
    const extraRow = putCustomDashboard({ ...valid, rows: [...valid.rows, { a: "y", b: 2 }] }).version;
    assert.notEqual(first, renamed);
    assert.notEqual(first, extraRow);
  });
});

// ---------------------------------------------------------------------------
// Data context — GeneratedDashboard.rows is the data source (§5, §7, §8)
// ---------------------------------------------------------------------------

describe("resolveDashboardDataContext — generated dashboards", () => {
  it("is null for a dashboard this process holds no snapshot for (§4, test G)", () => {
    assert.equal(resolveDashboardDataContext({ type: "custom", dashboardId: "nonexistent" }), null);
    // And crucially, not some other dashboard's context.
    registerInventory();
    assert.equal(resolveDashboardDataContext({ type: "custom", dashboardId: "nonexistent" }), null);
  });

  it("exposes the dashboard's own rows as its one queryable table", () => {
    const context = registerProfitability();
    assert.equal(context.tables.length, 1);
    assert.equal(context.tables[0].id, CUSTOM_DASHBOARD_TABLE_ID);
    assert.equal(context.tables[0].rows.length, PROFITABILITY_ROWS.length);
    assert.strictEqual(context.tables[0].rows, PROFITABILITY_ROWS, "must query the stored rows, not a copy");
  });

  it("derives its business description from the generated plan (§8)", () => {
    const { description, label } = registerProfitability();
    assert.equal(label, "Supplier Profitability");
    assert.match(description, /profitability\.csv/i);
    assert.match(description, /one row per record/i, "the plan's grain");
    assert.match(description, /Profit concentration/, "the plan's section heading");
    assert.match(description, /drives the outcome/, "the section's whyItMatters");
    assert.match(description, /as supplied in the source file/, "the plan's caveats");
    assert.match(description, /notes \(free text\)/, "the plan's excluded columns");
  });

  it("is never given the warehouse metric dictionary, which names columns it doesn't have", () => {
    assert.equal(registerProfitability().semanticDictionary, null);
    assert.ok(builtin().semanticDictionary, "built-in dashboards keep theirs");
  });

  it("gets a data version and schema key that cannot collide with another dashboard's", () => {
    const profitability = registerProfitability();
    const inventory = registerInventory();
    assert.notEqual(profitability.dataVersion, inventory.dataVersion);
    assert.notEqual(profitability.schemaCacheKey, inventory.schemaCacheKey);
    assert.notEqual(profitability.dataVersion, builtin().dataVersion);
    assert.ok(profitability.dataVersion.includes("custom:profit001"));
  });
});

describe("buildDashboardSchemaBlock — schema, never rows (§17, §18)", () => {
  it("names every column with its type and profiled role", () => {
    const block = buildDashboardSchemaBlock(registerProfitability());
    for (const column of ["supplier", "profit", "spend", "category"]) {
      assert.ok(block.includes(column), `${column} missing from the schema block`);
    }
    assert.match(block, /profit \(number\) \[measure\]/);
    assert.match(block, /supplier \(string\) \[dimension\]/);
  });

  it("is the same SIZE for 4 rows and 10,000 identical-shaped rows — rows never enter the prompt", () => {
    const small = buildDashboardSchemaBlock(registerProfitability("small01"));
    _clearSchemaBlockCacheForTests();
    const columns = ["supplier", "profit", "spend", "category"];
    const bigRows = Array.from({ length: 10_000 }, (_, i) => ({
      supplier: PROFITABILITY_ROWS[i % PROFITABILITY_ROWS.length].supplier,
      profit: i,
      spend: i * 2,
      category: PROFITABILITY_ROWS[i % PROFITABILITY_ROWS.length].category,
    }));
    putCustomDashboard({
      id: "big01",
      title: "Supplier Profitability",
      createdAt: "2026-01-05T10:00:00.000Z",
      sourceFileName: "profitability.csv",
      profile: profileFor(columns, ["profit", "spend"], ["supplier", "category"], bigRows.length),
      plan: planFor("Supplier Profitability", ["Total profit", "Profit by supplier"], "Profit concentration"),
      widgets: [],
      columns,
      rows: bigRows,
    });
    const big = buildDashboardSchemaBlock(resolveDashboardDataContext({ type: "custom", dashboardId: "big01" })!);
    // Row COUNT appears in the table's one-line description, so the strings
    // differ by a few characters; what matters is that 10,000 rows add no bulk.
    assert.ok(
      Math.abs(big.length - small.length) < 40,
      `schema block grew with row count: ${small.length} → ${big.length}`
    );
    assert.equal(big.includes("9999"), false, "a row value reached the prompt");
  });

  it("gives two different generated dashboards different blocks (no cache bleed)", () => {
    const a = buildDashboardSchemaBlock(registerProfitability());
    const b = buildDashboardSchemaBlock(registerInventory());
    assert.notEqual(a, b);
    assert.equal(a.includes("warehouse"), false);
    assert.equal(b.includes("supplier"), false);
  });
});

// ---------------------------------------------------------------------------
// The query tool — one tool, scoped by whichever dashboard is open (§9, §26)
// ---------------------------------------------------------------------------

describe("query_dashboard_data on a generated dashboard", () => {
  it("is the same tool name and stays strict — no query_custom_dashboard_data", () => {
    const tool = queryDashboardDataTool(registerProfitability());
    assert.equal(tool.name, "query_dashboard_data");
    assert.equal(tool.strict, true);
    assert.equal((tool.input_schema as unknown as { additionalProperties: boolean }).additionalProperties, false);
  });

  it("offers exactly one table id and only this dashboard's own columns", () => {
    const tool = queryDashboardDataTool(registerProfitability());
    assert.deepEqual(tableEnum(tool), [CUSTOM_DASHBOARD_TABLE_ID]);
    assert.deepEqual(fieldEnum(tool), ["category", "profit", "spend", "supplier"]);
  });

  it("never offers another dashboard's table or fields (§10)", () => {
    const profitabilityTool = queryDashboardDataTool(registerProfitability());
    const inventoryTool = queryDashboardDataTool(registerInventory());
    const warehouseTool = queryDashboardDataTool(builtin());

    assert.equal(fieldEnum(profitabilityTool).includes("warehouse"), false);
    assert.equal(fieldEnum(inventoryTool).includes("profit"), false);
    for (const field of fieldEnum(warehouseTool)) {
      assert.equal(fieldEnum(profitabilityTool).includes(field), false, `${String(field)} leaked from the warehouse`);
    }
    for (const table of tableEnum(warehouseTool)) {
      assert.equal(tableEnum(profitabilityTool).includes(table), false, `${String(table)} leaked from the warehouse`);
    }
  });
});

describe("runDashboardQuery on a generated dashboard — grounding (tests B and C)", () => {
  it("answers a total by summing the dashboard's own rows, reconciled independently", () => {
    const context = registerProfitability();
    const outcome = runDashboardQuery(context, {
      table: CUSTOM_DASHBOARD_TABLE_ID,
      measure: "profit",
      aggregation: "sum",
    });
    const expected = PROFITABILITY_ROWS.reduce((sum, row) => sum + row.profit, 0);
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.result.value, expected);
    assert.equal(outcome.result.matchedRows, PROFITABILITY_ROWS.length);
  });

  it("answers a grouped top-N by the same engine the built-in dashboards use", () => {
    const context = registerProfitability();
    const outcome = runDashboardQuery(context, {
      table: CUSTOM_DASHBOARD_TABLE_ID,
      groupBy: "supplier",
      measure: "profit",
      aggregation: "sum",
      sort: "desc",
      limit: 2,
    });
    assert.equal(outcome.error, undefined);
    assert.deepEqual(outcome.result.groups, [
      { group: "Beta", value: 300, rowCount: 1 },
      { group: "Alpha", value: 150, rowCount: 2 },
    ]);
    assert.equal(outcome.result.truncated, true, "a third supplier exists and was capped, not dropped silently");
  });

  it("applies a filter before aggregating, matching what the model would ask for", () => {
    const context = registerProfitability();
    const outcome = runDashboardQuery(context, {
      table: CUSTOM_DASHBOARD_TABLE_ID,
      filters: [{ field: "category", op: "eq", value: "B" }],
      measure: "profit",
      aggregation: "sum",
    });
    const expected = PROFITABILITY_ROWS.filter((r) => r.category === "B").reduce((s, r) => s + r.profit, 0);
    assert.equal(outcome.result.value, expected);
  });

  it("rejects a column this dashboard doesn't have, instead of returning an empty result (test H)", () => {
    const context = registerProfitability();
    const outcome = runDashboardQuery(context, {
      table: CUSTOM_DASHBOARD_TABLE_ID,
      measure: "warehouse_value",
      aggregation: "sum",
    });
    assert.ok(outcome.error, "an unknown column must be reported, not silently zero");
    assert.match(outcome.error!, /warehouse_value/);
    assert.equal(outcome.result.matchedRows, 0);
  });

  it("rejects a table belonging to another dashboard (test E — the isolation case)", () => {
    const context = registerProfitability();
    registerInventory();
    for (const table of ["fact_po_items", "agg_vendor_annual", "inv002", "dashboard_data_2"]) {
      const outcome = runDashboardQuery(context, { table, aggregation: "count" });
      assert.ok(outcome.error, `${table} must be rejected`);
      assert.equal(outcome.result.matchedRows, 0);
    }
  });

  it("never serves one dashboard's cached result to another with an identical schema", () => {
    // Same columns, different data — the case a cache keyed only by the query
    // spec would get wrong. The spec below is byte-identical for both.
    const columns = ["supplier", "profit", "spend", "category"];
    const register = (id: string, rows: Record<string, unknown>[]) => {
      putCustomDashboard({
        id,
        title: "Supplier Profitability",
        createdAt: `2026-03-0${id.length}T00:00:00.000Z`,
        sourceFileName: "profitability.csv",
        profile: profileFor(columns, ["profit", "spend"], ["supplier", "category"], rows.length),
        plan: planFor("Supplier Profitability", ["Total profit"], "Profit concentration"),
        widgets: [],
        columns,
        rows,
      });
      return resolveDashboardDataContext({ type: "custom", dashboardId: id })!;
    };
    const first = register("twinA", [{ supplier: "Alpha", profit: 10, spend: 1, category: "A" }]);
    const second = register("twinBB", [{ supplier: "Alpha", profit: 999, spend: 1, category: "A" }]);
    const spec = { table: CUSTOM_DASHBOARD_TABLE_ID, measure: "profit", aggregation: "sum" };

    assert.equal(runDashboardQuery(first, spec).result.value, 10);
    const secondOutcome = runDashboardQuery(second, spec);
    assert.equal(secondOutcome.result.value, 999, "served the other dashboard's cached total");
    assert.equal(secondOutcome.cacheHit, false);
  });

  it("still caches repeat queries within one dashboard", () => {
    const context = registerProfitability();
    const spec = { table: CUSTOM_DASHBOARD_TABLE_ID, measure: "profit", aggregation: "sum" };
    assert.equal(runDashboardQuery(context, spec).cacheHit, false);
    const second = runDashboardQuery(context, spec);
    assert.equal(second.cacheHit, true);
    assert.equal(second.result.value, runDashboardQuery(context, spec).result.value);
  });

  it("adapts with no code change to a completely different subject (§14, §15)", () => {
    const context = registerInventory();
    const byWarehouse = runDashboardQuery(context, {
      table: CUSTOM_DASHBOARD_TABLE_ID,
      groupBy: "warehouse",
      measure: "value",
      aggregation: "sum",
      sort: "desc",
    });
    assert.equal(byWarehouse.error, undefined);
    assert.deepEqual(byWarehouse.result.groups, [
      { group: "South", value: 1650, rowCount: 2 },
      { group: "North", value: 900, rowCount: 1 },
    ]);
    const distinctProducts = runDashboardQuery(context, {
      table: CUSTOM_DASHBOARD_TABLE_ID,
      measure: "product",
      aggregation: "distinct",
    });
    assert.equal(distinctProducts.result.value, 2);
  });
});

// ---------------------------------------------------------------------------
// Conversation memory — one store, isolated per dashboard (§11, test F)
// ---------------------------------------------------------------------------

describe("conversation memory across dashboard kinds", () => {
  const empty: ConversationContext = {
    conversationId: "c1",
    updatedAt: Date.now(),
    entities: { suppliers: [], categories: [], plants: [] },
    perDashboard: {},
  };

  const update = {
    table: CUSTOM_DASHBOARD_TABLE_ID,
    spec: { groupBy: "supplier", measure: "profit", aggregation: "sum" as const, limit: 5 },
    result: { matchedRows: 4, groups: [{ group: "Beta", value: 300, rowCount: 1 }], truncated: false },
  };

  it("remembers a generated dashboard's last query under its own context id", () => {
    const context = applyQueryToContext(empty, "custom:profit001", update);
    const block = buildConversationMemoryBlock(context, "custom:profit001");
    assert.ok(block);
    assert.match(block!, /supplier/);
    assert.match(block!, /Beta/);
  });

  it("does not leak that memory into another generated dashboard (test F)", () => {
    const context = applyQueryToContext(empty, "custom:profit001", update);
    assert.equal(buildConversationMemoryBlock(context, "custom:inv002"), null);
    assert.equal(context.perDashboard["custom:inv002"], undefined);
  });

  it("does not leak between a generated dashboard and a built-in one, in either direction", () => {
    let context = applyQueryToContext(empty, "custom:profit001", update);
    assert.equal(buildConversationMemoryBlock(context, "builtin:tail-spend"), null);

    context = applyQueryToContext(context, "builtin:tail-spend", {
      table: "agg_vendor_annual",
      spec: { groupBy: "vendor_name", measure: "spend_inr", aggregation: "sum" },
      result: { matchedRows: 2, groups: [{ group: "Vendor X", value: 5, rowCount: 1 }], truncated: false },
    });
    const customBlock = buildConversationMemoryBlock(context, "custom:profit001")!;
    assert.equal(customBlock.includes("agg_vendor_annual"), false);
    assert.equal(customBlock.includes("Vendor X"), false);
    const builtinBlock = buildConversationMemoryBlock(context, "builtin:tail-spend")!;
    assert.equal(builtinBlock.includes(CUSTOM_DASHBOARD_TABLE_ID), false);
  });
});

// ---------------------------------------------------------------------------
// Report Mode — the same action, the same pipeline (§12, §13, test D)
// ---------------------------------------------------------------------------

describe("Report Mode on a generated dashboard", () => {
  it("is offered by the same registry that offers it on built-in dashboards", () => {
    const onCustom = assistantActionsFor({ type: "custom", dashboardId: "profit001" });
    const onBuiltin = assistantActionsFor({ type: "builtin", dashboardKey: "tail-spend" });
    assert.deepEqual(onCustom, onBuiltin, "one action registry, not a generated-dashboard variant");
    assert.equal(onCustom.length, 1);
  });

  it("keys its report cache so two dashboards can never be served each other's report", () => {
    const base = {
      dataVersion: "custom:profit001@v1",
      contextId: "custom:profit001",
      action: "action_plan" as const,
      activeFilters: null,
      objective: "Analyse profitability and identify opportunities",
    };
    assert.notEqual(buildReportCacheKey(base), buildReportCacheKey({ ...base, contextId: "custom:inv002" }));
    assert.notEqual(buildReportCacheKey(base), buildReportCacheKey({ ...base, dataVersion: "custom:profit001@v2" }));
    assert.notEqual(
      buildReportCacheKey(base),
      buildReportCacheKey({ ...base, contextId: "builtin:supplier-fragmentation" })
    );
    // The same request twice is still the same report.
    assert.equal(buildReportCacheKey(base), buildReportCacheKey({ ...base }));
  });

  it("hands the engine a context whose tables are only this dashboard's (§13)", () => {
    // The engine's whole data reach is context.dataContext.tables — asserted
    // here rather than in the engine, since the engine takes no other input that
    // could widen it.
    const context = registerProfitability();
    assert.deepEqual(
      context.tables.map((t) => t.id),
      [CUSTOM_DASHBOARD_TABLE_ID]
    );
    assert.equal(context.tables[0].rows, PROFITABILITY_ROWS);
  });
});
