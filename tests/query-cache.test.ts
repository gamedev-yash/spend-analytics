// Coverage for lib/ai/query-cache.ts's deterministic key-building and
// get/set primitives. Integration-level coverage (does runDashboardQuery()
// actually report cacheHit correctly, including the cross-dashboard sharing
// this cache is deliberately keyed to allow) lives in
// tests/dashboard-query.test.ts alongside its other correctness tests.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  _clearQueryCacheForTests,
  _sizeForTests,
  buildQueryCacheKey,
  getCachedQueryResult,
  setCachedQueryResult,
} from "@/lib/ai/query-cache";
import type { QuerySpec, QueryResult } from "@/lib/ai/query-engine";

afterEach(() => {
  _clearQueryCacheForTests();
});

const SAMPLE_RESULT: QueryResult = { matchedRows: 1, truncated: false, value: 42 };

describe("query-cache get/set", () => {
  it("is a MISS before anything is cached", () => {
    const key = buildQueryCacheKey("v1", { table: "fact_po_items", aggregation: "sum" });
    assert.equal(getCachedQueryResult(key), null);
  });

  it("is a HIT for the identical key right after being set", () => {
    const key = buildQueryCacheKey("v1", { table: "fact_po_items", aggregation: "sum" });
    setCachedQueryResult(key, SAMPLE_RESULT);
    assert.deepEqual(getCachedQueryResult(key), SAMPLE_RESULT);
  });
});

describe("buildQueryCacheKey — what does and doesn't change the key", () => {
  it("a different dataset version produces a different key (this is the invalidation mechanism)", () => {
    const spec: QuerySpec = { table: "fact_po_items", aggregation: "sum", measure: "net_order_value_inr" };
    const keyV1 = buildQueryCacheKey("v1", spec);
    const keyV2 = buildQueryCacheKey("v2", spec);
    assert.notEqual(keyV1, keyV2);
  });

  it("a different filter value produces a different key", () => {
    const base: QuerySpec = { table: "fact_po_items", aggregation: "count" };
    const keyPune = buildQueryCacheKey("v1", { ...base, filters: [{ field: "plant_name", op: "eq", value: "Pune" }] });
    const keyChennai = buildQueryCacheKey("v1", { ...base, filters: [{ field: "plant_name", op: "eq", value: "Chennai" }] });
    assert.notEqual(keyPune, keyChennai);
  });

  it("a different table produces a different key even with an otherwise identical spec", () => {
    const keyPoItems = buildQueryCacheKey("v1", { table: "fact_po_items", aggregation: "count" });
    const keyInvoices = buildQueryCacheKey("v1", { table: "fact_invoices", aggregation: "count" });
    assert.notEqual(keyPoItems, keyInvoices);
  });

  it("filter ORDER does not change the key — two semantically identical specs must hash the same", () => {
    const specA: QuerySpec = {
      table: "fact_po_items",
      filters: [
        { field: "plant_name", op: "eq", value: "Pune" },
        { field: "category_l1_name", op: "eq", value: "IT & Telecom" },
      ],
    };
    const specB: QuerySpec = {
      table: "fact_po_items",
      filters: [
        { field: "category_l1_name", op: "eq", value: "IT & Telecom" },
        { field: "plant_name", op: "eq", value: "Pune" },
      ],
    };
    assert.equal(buildQueryCacheKey("v1", specA), buildQueryCacheKey("v1", specB));
  });

  it("an `in` filter's value order does not change the key either", () => {
    const specA: QuerySpec = { table: "fact_po_items", filters: [{ field: "vendor_name", op: "in", value: ["ABC", "XYZ"] }] };
    const specB: QuerySpec = { table: "fact_po_items", filters: [{ field: "vendor_name", op: "in", value: ["XYZ", "ABC"] }] };
    assert.equal(buildQueryCacheKey("v1", specA), buildQueryCacheKey("v1", specB));
  });

  it("select field order does not change the key", () => {
    const specA: QuerySpec = { table: "fact_po_items", select: ["vendor_name", "po_number"] };
    const specB: QuerySpec = { table: "fact_po_items", select: ["po_number", "vendor_name"] };
    assert.equal(buildQueryCacheKey("v1", specA), buildQueryCacheKey("v1", specB));
  });

  it("deliberately does NOT take a dashboardKey — same table+spec always yields the same key regardless of caller (see module comment on cross-dashboard sharing)", () => {
    // buildQueryCacheKey's signature is (datasetVersion, spec) — no
    // dashboardKey parameter at all. This test pins that arity so a future
    // refactor can't silently reintroduce dashboard-scoping by accident;
    // tests/dashboard-query.test.ts's cross-dashboard test proves the actual
    // behavioral consequence (two dashboards sharing a cache entry).
    assert.equal(buildQueryCacheKey.length, 2);
  });
});

describe("query-cache size bound", () => {
  it("never grows past its configured maximum", () => {
    for (let i = 0; i < 1200; i += 1) {
      const key = buildQueryCacheKey("v1", { table: "fact_po_items", filters: [{ field: "vendor_id", op: "eq", value: `V${i}` }] });
      setCachedQueryResult(key, SAMPLE_RESULT);
    }
    assert.ok(_sizeForTests() <= 1000, `expected size <= 1000, got ${_sizeForTests()}`);
  });
});
