// The per-dashboard query engine wiring (lib/ai/dashboard-tables.ts,
// lib/ai/dashboard-query.ts) that replaced the hardcoded KPI-prose assistant.
//
// The property under test mirrors tests/assistant-tools.test.ts: containment
// (strict enum) is the first layer, and runDashboardQuery's own validation
// against the actual table is the second — a field real on one table but not
// the one requested must still be rejected, not silently ignored or answered
// from the wrong table. Independent reconciliation (comparing a query's
// result against a separately-computed total) is used wherever a dashboard's
// mock data already carries an authoritative total to check against.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { queryDashboardDataTool, runDashboardQuery, renderDashboardQueryResult } from "@/lib/ai/dashboard-query";
import { getDashboardTables } from "@/lib/ai/dashboard-tables";
import { DASHBOARD_REGISTRY, type DashboardKey } from "@/lib/ai/dashboard-registry";
import { poItems } from "@/lib/sap/raw-data";
import { tailSpendMock } from "@/app/tail-spend/tailSpendMock";
import { invoices as paymentTermsInvoices } from "@/app/payment-terms/data";

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
      const tool = queryDashboardDataTool(key);
      assert.equal(tool.strict, true);
      assert.equal((tool.input_schema as Schema).additionalProperties, false);
    }
  });

  it("constrains table to exactly this dashboard's own tables", () => {
    for (const { key } of DASHBOARD_REGISTRY) {
      const props = properties(queryDashboardDataTool(key));
      assert.deepEqual(enumOf(props.table), getDashboardTables(key).map((t) => t.id));
    }
  });

  it("never offers another dashboard's table id", () => {
    const spendOverviewTables = new Set(enumOf(properties(queryDashboardDataTool("spend-overview")).table));
    const tailSpendTables = new Set(enumOf(properties(queryDashboardDataTool("tail-spend")).table));
    for (const id of tailSpendTables) assert.equal(spendOverviewTables.has(id), false, `${String(id)} leaked across dashboards`);
  });
});

describe("runDashboardQuery — validation before execution", () => {
  it("rejects an unknown table as a correctable error, not a silent empty result", () => {
    const outcome = runDashboardQuery("spend-overview", { table: "not_a_table" });
    assert.ok(outcome.error);
    assert.match(outcome.error!, /Unknown table "not_a_table"/);
  });

  it("rejects a groupBy field that does not exist on the requested table", () => {
    const outcome = runDashboardQuery("spend-overview", {
      table: "purchase_orders",
      groupBy: "not_a_field",
      aggregation: "count",
    });
    assert.ok(outcome.error);
    assert.match(outcome.error!, /Unknown field "not_a_field"/);
  });

  it("rejects a field that is real on a sibling table but not the requested one", () => {
    // invoice_number only exists on the "invoices" table of this same dashboard.
    const outcome = runDashboardQuery("spend-overview", {
      table: "purchase_orders",
      select: ["invoice_number"],
    });
    assert.ok(outcome.error);
    assert.match(outcome.error!, /Unknown field "invoice_number" on table "purchase_orders"/);
  });

  it("rejects a filter field that does not exist on the requested table", () => {
    const outcome = runDashboardQuery("tail-spend", {
      table: "category_breakdown",
      filters: [{ field: "vendor_name", op: "eq", value: "x" }],
      aggregation: "count",
    });
    assert.ok(outcome.error);
    assert.match(outcome.error!, /Unknown field "vendor_name"/);
  });
});

describe("runDashboardQuery — correctness against an independent total", () => {
  it("spend-overview purchase_orders sums to the same total as the raw (non-deleted) PO rows", () => {
    const independentTotal = poItems.filter((p) => !p.is_deleted).reduce((s, p) => s + p.net_value_inr, 0);
    const outcome = runDashboardQuery("spend-overview", {
      table: "purchase_orders",
      measure: "net_value_inr",
      aggregation: "sum",
    });
    assert.equal(outcome.error, undefined);
    assert.ok(Math.abs(Number(outcome.result.value ?? 0) - independentTotal) < 1);
  });

  it("compliance and spend-overview answer from the identical purchase_orders/invoices tables", () => {
    const spendOverview = getDashboardTables("spend-overview");
    const compliance = getDashboardTables("compliance");
    assert.deepEqual(spendOverview.map((t) => t.id), compliance.map((t) => t.id));
    for (const table of spendOverview) {
      const other = compliance.find((t) => t.id === table.id)!;
      assert.equal(other.rows.length, table.rows.length);
      assert.deepEqual(other.rows[0], table.rows[0]);
    }
  });

  it("tail-spend category_breakdown's totalSpend reconciles against the dashboard's own headline KPI", () => {
    const outcome = runDashboardQuery("tail-spend", {
      table: "category_breakdown",
      measure: "totalSpend",
      aggregation: "sum",
    });
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.result.value, tailSpendMock.kpi.totalAnnualSpend);
  });

  it("payment-terms invoices table carries every mock invoice row", () => {
    const outcome = runDashboardQuery("payment-terms", { table: "invoices", aggregation: "count" });
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.result.value, paymentTermsInvoices.length);
  });

  it("groups sum back up to the ungrouped total (grouping never drops or double-counts rows)", () => {
    const grouped = runDashboardQuery("spend-overview", {
      table: "purchase_orders",
      groupBy: "category_l1",
      measure: "net_value_inr",
      aggregation: "sum",
      limit: 50,
    });
    const ungrouped = runDashboardQuery("spend-overview", {
      table: "purchase_orders",
      measure: "net_value_inr",
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
    const outcome = runDashboardQuery("spend-overview", { table: "not_a_table" });
    const rendered = renderDashboardQueryResult(outcome);
    assert.match(rendered, /QUERY FAILED/);
    assert.match(rendered, /Do not invent numbers/);
  });

  it("renders a grouped result with each group's value and row count", () => {
    const outcome = runDashboardQuery("supplier-fragmentation", {
      table: "categories",
      groupBy: "category",
      measure: "spendCr",
      aggregation: "sum",
    });
    const rendered = renderDashboardQueryResult(outcome);
    assert.match(rendered, /QUERY RESULT on "categories"/);
    assert.match(rendered, /IT & Telecom: 126/);
  });

  it("says so plainly when an aggregate query matches nothing", () => {
    const outcome = runDashboardQuery("tail-spend", {
      table: "suppliers",
      filters: [{ field: "segment", op: "eq", value: "does-not-exist" }],
      aggregation: "count",
    });
    const rendered = renderDashboardQueryResult(outcome);
    assert.match(rendered, /0 rows matched/);
  });

  it("says so plainly when a row-level lookup matches nothing", () => {
    const outcome = runDashboardQuery("tail-spend", {
      table: "suppliers",
      filters: [{ field: "segment", op: "eq", value: "does-not-exist" }],
      select: ["supplierName"],
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
