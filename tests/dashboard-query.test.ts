// The per-dashboard query engine wiring (lib/ai/dashboard-tables.ts,
// lib/ai/dashboard-query.ts) that replaced the hardcoded KPI-prose assistant.
//
// The property under test mirrors what app/api/assistant/route.ts's now-removed
// tests checked: containment (strict enum) is the first layer, and
// runDashboardQuery's own validation against the actual table is the second —
// a field real on one table but not the one requested must still be rejected,
// not silently ignored or answered from the wrong table. Independent
// reconciliation (comparing a query's result against a separately-computed
// total straight off the warehouse sample dataset) is used wherever that's
// meaningful.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { queryDashboardDataTool, runDashboardQuery, renderDashboardQueryResult } from "@/lib/ai/dashboard-query";
import { getDashboardTables } from "@/lib/ai/dashboard-tables";
import { resolveDashboardDataContext, type DashboardDataContext } from "@/lib/ai/dashboard-data-context";
import { DASHBOARD_REGISTRY, type DashboardKey } from "@/lib/ai/dashboard-registry";
import { getSampleDataset } from "@/lib/server/sample-data-source";
import { _clearQueryCacheForTests } from "@/lib/ai/query-cache";

afterEach(() => {
  _clearQueryCacheForTests();
});

/**
 * Both entry points now take a RESOLVED DashboardDataContext rather than a
 * DashboardKey (lib/ai/dashboard-data-context.ts) — the abstraction that lets
 * one query path serve built-in and generated dashboards alike. For a built-in
 * dashboard resolution cannot fail, so the non-null assertion is safe here.
 */
function builtin(key: DashboardKey): DashboardDataContext {
  return resolveDashboardDataContext({ type: "builtin", dashboardKey: key })!;
}

type Schema = Record<string, unknown>;

function properties(tool: { input_schema: unknown }): Record<string, Schema> {
  return (tool.input_schema as { properties: Record<string, Schema> }).properties;
}

function enumOf(schema: Schema): unknown[] {
  assert.ok(Array.isArray(schema.enum), `expected an enum, got ${JSON.stringify(schema)}`);
  return schema.enum;
}

describe("query_dashboard_data tool schema", () => {
  it("is strict, so the model cannot invent properties or values", () => {
    for (const { key } of DASHBOARD_REGISTRY) {
      const tool = queryDashboardDataTool(builtin(key));
      assert.equal(tool.strict, true);
      assert.equal((tool.input_schema as Schema).additionalProperties, false);
    }
  });

  it("constrains table to exactly this dashboard's own tables", () => {
    for (const { key } of DASHBOARD_REGISTRY) {
      const props = properties(queryDashboardDataTool(builtin(key)));
      assert.deepEqual(enumOf(props.table), getDashboardTables(key).map((t) => t.id));
    }
  });

  it("never offers another dashboard's table id", () => {
    const spendOverviewTables = new Set(enumOf(properties(queryDashboardDataTool(builtin("spend-overview"))).table));
    const paymentTermsTables = new Set(enumOf(properties(queryDashboardDataTool(builtin("payment-terms"))).table));
    for (const id of paymentTermsTables) {
      assert.equal(spendOverviewTables.has(id), false, `${String(id)} leaked across dashboards`);
    }
  });
});

describe("runDashboardQuery — validation before execution", () => {
  it("rejects an unknown table as a correctable error, not a silent empty result", () => {
    const outcome = runDashboardQuery(builtin("spend-overview"), { table: "not_a_table" });
    assert.ok(outcome.error);
    assert.match(outcome.error!, /Unknown table "not_a_table"/);
  });

  it("rejects a groupBy field that does not exist on the requested table", () => {
    const outcome = runDashboardQuery(builtin("spend-overview"), {
      table: "fact_po_items",
      groupBy: "not_a_field",
      aggregation: "count",
    });
    assert.ok(outcome.error);
    assert.match(outcome.error!, /Unknown field "not_a_field"/);
  });

  it("rejects a field that is real on a sibling table but not the requested one", () => {
    // invoice_number only exists on the "fact_invoices" table of this same dashboard.
    const outcome = runDashboardQuery(builtin("spend-overview"), {
      table: "fact_po_items",
      select: ["invoice_number"],
    });
    assert.ok(outcome.error);
    assert.match(outcome.error!, /Unknown field "invoice_number" on table "fact_po_items"/);
  });

  it("rejects a filter field that does not exist on the requested table", () => {
    // spend_rank only exists on tail-spend's other table, agg_vendor_annual.
    const outcome = runDashboardQuery(builtin("tail-spend"), {
      table: "fact_po_items",
      filters: [{ field: "spend_rank", op: "eq", value: 1 }],
      aggregation: "count",
    });
    assert.ok(outcome.error);
    assert.match(outcome.error!, /Unknown field "spend_rank"/);
  });
});

describe("runDashboardQuery — correctness against an independent total", () => {
  it("spend-overview fact_po_items sums to the same total as the warehouse sample dataset", () => {
    const independentTotal = (getSampleDataset("fact_po_items")?.rows ?? []).reduce(
      (s, r) => s + (Number(r.net_order_value_inr) || 0),
      0
    );
    const outcome = runDashboardQuery(builtin("spend-overview"), {
      table: "fact_po_items",
      measure: "net_order_value_inr",
      aggregation: "sum",
    });
    assert.equal(outcome.error, undefined);
    assert.ok(Math.abs(Number(outcome.result.value ?? 0) - independentTotal) < 1);
  });

  it("compliance and spend-overview answer from the identical fact_po_items/fact_invoices tables", () => {
    const spendOverview = getDashboardTables("spend-overview");
    const compliance = getDashboardTables("compliance");
    assert.deepEqual(spendOverview.map((t) => t.id), compliance.map((t) => t.id));
    for (const table of spendOverview) {
      const other = compliance.find((t) => t.id === table.id)!;
      assert.equal(other.rows.length, table.rows.length);
      assert.deepEqual(other.rows[0], table.rows[0]);
    }
  });

  it("agg_vendor_annual's total_spend_inr reconciles against fact_po_items' net_order_value_inr", () => {
    // agg_vendor_annual is pre-aggregated from fact_po_items (metadata-registry.ts) —
    // summed across every vendor and year, the two totals must agree.
    const aggOutcome = runDashboardQuery(builtin("tail-spend"), {
      table: "agg_vendor_annual",
      measure: "total_spend_inr",
      aggregation: "sum",
    });
    const poOutcome = runDashboardQuery(builtin("tail-spend"), {
      table: "fact_po_items",
      measure: "net_order_value_inr",
      aggregation: "sum",
    });
    assert.equal(aggOutcome.error, undefined);
    assert.equal(poOutcome.error, undefined);
    assert.ok(
      Math.abs(Number(aggOutcome.result.value ?? 0) - Number(poOutcome.result.value ?? 0)) < 1,
      `agg_vendor_annual sum ${aggOutcome.result.value} != fact_po_items sum ${poOutcome.result.value}`
    );
  });

  it("payment-terms fact_payments table carries every warehouse payment row", () => {
    const outcome = runDashboardQuery(builtin("payment-terms"), { table: "fact_payments", aggregation: "count" });
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.result.value, getSampleDataset("fact_payments")?.rows.length);
  });

  it("groups sum back up to the ungrouped total (grouping never drops or double-counts rows)", () => {
    const grouped = runDashboardQuery(builtin("spend-overview"), {
      table: "fact_po_items",
      groupBy: "category_l1_name",
      measure: "net_order_value_inr",
      aggregation: "sum",
      limit: 50,
    });
    const ungrouped = runDashboardQuery(builtin("spend-overview"), {
      table: "fact_po_items",
      measure: "net_order_value_inr",
      aggregation: "sum",
    });
    assert.equal(grouped.error, undefined);
    assert.equal(grouped.result.truncated, false, "fewer than 50 L1 categories — nothing should be truncated");
    const groupSum = (grouped.result.groups ?? []).reduce((s, g) => s + Number(g.value), 0);
    assert.ok(Math.abs(groupSum - Number(ungrouped.result.value ?? 0)) < 1);
  });
});

describe("renderDashboardQueryResult", () => {
  it("surfaces a failure as a correctable error, not as empty data", () => {
    const outcome = runDashboardQuery(builtin("spend-overview"), { table: "not_a_table" });
    const rendered = renderDashboardQueryResult(outcome);
    assert.match(rendered, /QUERY FAILED/);
    assert.match(rendered, /Do not invent numbers/);
  });

  it("renders a grouped result with each group's value and row count, matching an independent sum", () => {
    const rows = getSampleDataset("fact_po_items")?.rows ?? [];
    const independentItTelecom = rows
      .filter((r) => r.category_l1_name === "IT & Telecom")
      .reduce((s, r) => s + (Number(r.net_order_value_inr) || 0), 0);

    const outcome = runDashboardQuery(builtin("supplier-fragmentation"), {
      table: "fact_po_items",
      groupBy: "category_l1_name",
      measure: "net_order_value_inr",
      aggregation: "sum",
    });
    const rendered = renderDashboardQueryResult(outcome);
    assert.match(rendered, /QUERY RESULT on "fact_po_items"/);
    const itLine = rendered.split("\n").find((line) => line.startsWith("IT & Telecom:"));
    assert.ok(itLine, `no "IT & Telecom" group in:\n${rendered}`);
    const renderedValue = Number(itLine!.slice("IT & Telecom:".length).split("(")[0].trim());
    assert.ok(Math.abs(renderedValue - independentItTelecom) < 1);
  });

  it("says so plainly when an aggregate query matches nothing", () => {
    const outcome = runDashboardQuery(builtin("tail-spend"), {
      table: "fact_po_items",
      filters: [{ field: "vendor_id", op: "eq", value: "does-not-exist" }],
      aggregation: "count",
    });
    const rendered = renderDashboardQueryResult(outcome);
    assert.match(rendered, /0 rows matched/);
  });

  it("says so plainly when a row-level lookup matches nothing", () => {
    const outcome = runDashboardQuery(builtin("tail-spend"), {
      table: "fact_po_items",
      filters: [{ field: "vendor_id", op: "eq", value: "does-not-exist" }],
      select: ["vendor_name"],
    });
    const rendered = renderDashboardQueryResult(outcome);
    assert.match(rendered, /no rows matched/);
  });
});

describe("every dashboard exposes at least one non-empty table", () => {
  for (const { key } of DASHBOARD_REGISTRY as { key: DashboardKey }[]) {
    it(`${key} has queryable rows`, () => {
      const tables = getDashboardTables(key);
      assert.ok(tables.length > 0);
      for (const table of tables) assert.ok(table.rows.length > 0, `table "${table.id}" on ${key} is empty`);
    });
  }
});

describe("runDashboardQuery — result caching (lib/ai/query-cache.ts)", () => {
  it("MISSes the first time, HITs the identical query the second time", () => {
    const first = runDashboardQuery(builtin("spend-overview"), {
      table: "fact_po_items",
      measure: "net_order_value_inr",
      aggregation: "sum",
    });
    assert.equal(first.cacheHit, false);
    const second = runDashboardQuery(builtin("spend-overview"), {
      table: "fact_po_items",
      measure: "net_order_value_inr",
      aggregation: "sum",
    });
    assert.equal(second.cacheHit, true);
    assert.deepEqual(second.result, first.result);
  });

  it("MISSes when the filter is different, even on the same table/dashboard", () => {
    runDashboardQuery(builtin("spend-overview"), {
      table: "fact_po_items",
      filters: [{ field: "plant_name", op: "eq", value: "Vedanta Aluminium (Jharsuguda)" }],
      aggregation: "count",
    });
    const differentFilter = runDashboardQuery(builtin("spend-overview"), {
      table: "fact_po_items",
      filters: [{ field: "plant_name", op: "eq", value: "Hindustan Zinc (Rajasthan)" }],
      aggregation: "count",
    });
    assert.equal(differentFilter.cacheHit, false);
  });

  it("never caches an error outcome — an unknown table/field never reports cacheHit at all", () => {
    const outcome = runDashboardQuery(builtin("spend-overview"), { table: "not_a_table" });
    assert.ok(outcome.error);
    assert.equal(outcome.cacheHit, undefined);
  });

  it(
    "deliberately SHARES a cache entry across two different dashboards that query the identical " +
      "table+spec — spend-overview and compliance both read the same fact_po_items rows " +
      "(proven above in \"compliance and spend-overview answer from the identical fact_po_items/" +
      "fact_invoices tables\"), so this is a correct consequence of the unified dataset, not a bug. " +
      "See lib/ai/query-cache.ts's module comment for the full reasoning.",
    () => {
      const spendOverviewResult = runDashboardQuery(builtin("spend-overview"), {
        table: "fact_po_items",
        groupBy: "category_l1_name",
        measure: "net_order_value_inr",
        aggregation: "sum",
        limit: 5,
      });
      assert.equal(spendOverviewResult.cacheHit, false);

      const complianceResult = runDashboardQuery(builtin("compliance"), {
        table: "fact_po_items",
        groupBy: "category_l1_name",
        measure: "net_order_value_inr",
        aggregation: "sum",
        limit: 5,
      });
      assert.equal(complianceResult.cacheHit, true, "compliance should reuse spend-overview's cache entry — same table, same spec");
      assert.deepEqual(complianceResult.result, spendOverviewResult.result);
    }
  );

  it("does NOT share a cache entry for a table that one dashboard has and the other doesn't", () => {
    // agg_vendor_annual is on tail-spend but not on spend-overview — nothing
    // to cross-share here; this just pins that an unrelated table on a
    // DIFFERENT dashboard was never at risk of colliding in the cache.
    const tailSpendResult = runDashboardQuery(builtin("tail-spend"), { table: "agg_vendor_annual", aggregation: "count" });
    assert.equal(tailSpendResult.cacheHit, false);
    const spendOverviewAttempt = runDashboardQuery(builtin("spend-overview"), { table: "agg_vendor_annual", aggregation: "count" });
    // spend-overview doesn't have this table at all — rejected before the cache is ever consulted.
    assert.ok(spendOverviewAttempt.error);
  });
});
