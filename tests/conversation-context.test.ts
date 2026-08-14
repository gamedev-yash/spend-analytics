// Coverage for the follow-up/conversational-context feature
// (lib/ai/conversation-context.ts) — the structured memory that sits
// alongside the raw {role, content} history app/api/dashboard-chat/route.ts
// already threads to Claude. See that file's top comment for why both exist.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  _clearAllConversationsForTests,
  _forceStaleForTests,
  applyQueryToContext,
  buildContextSummaryForUI,
  buildConversationMemoryBlock,
  clearConversationContext,
  extractEntities,
  getConversationContext,
  sanitizeConversationId,
  saveConversationContext,
  summarizeResult,
  suggestFollowUps,
  type ConversationContext,
  type EntityMemory,
} from "@/lib/ai/conversation-context";
import type { QueryFilter, QueryResult } from "@/lib/ai/query-engine";

afterEach(() => {
  _clearAllConversationsForTests();
});

const EMPTY_ENTITIES: EntityMemory = { suppliers: [], categories: [], plants: [] };

describe("conversation context store", () => {
  it("returns a fresh, empty context for an id never seen before", () => {
    const context = getConversationContext("brand-new-id");
    assert.equal(context.conversationId, "brand-new-id");
    assert.deepEqual(context.entities, EMPTY_ENTITIES);
    assert.deepEqual(context.perDashboard, {});
  });

  it("round-trips whatever was saved", () => {
    const saved: ConversationContext = {
      conversationId: "abc",
      updatedAt: Date.now(),
      entities: { suppliers: ["ABC Corp"], categories: [], plants: [] },
      perDashboard: {},
    };
    saveConversationContext(saved);
    const reloaded = getConversationContext("abc");
    assert.deepEqual(reloaded.entities, saved.entities);
  });

  it("clearConversationContext wipes stored memory back to empty", () => {
    saveConversationContext({
      conversationId: "to-clear",
      updatedAt: Date.now(),
      entities: { suppliers: ["ABC"], categories: [], plants: [] },
      perDashboard: {},
    });
    clearConversationContext("to-clear");
    const reloaded = getConversationContext("to-clear");
    assert.deepEqual(reloaded.entities, EMPTY_ENTITIES);
  });

  it("treats a stale (TTL-expired) entry as gone, never serving expired memory", () => {
    saveConversationContext({
      conversationId: "aged-out",
      updatedAt: Date.now(),
      entities: { suppliers: ["Stale Supplier"], categories: [], plants: [] },
      perDashboard: {},
    });
    _forceStaleForTests("aged-out");
    const reloaded = getConversationContext("aged-out");
    assert.deepEqual(reloaded.entities, EMPTY_ENTITIES);
  });
});

describe("sanitizeConversationId", () => {
  it("passes through a plausible client-supplied id unchanged", () => {
    assert.equal(sanitizeConversationId("client-generated-uuid", () => "should-not-be-used"), "client-generated-uuid");
  });

  it("generates a fresh one when missing, empty, or absurdly long", () => {
    assert.equal(sanitizeConversationId(undefined, () => "generated"), "generated");
    assert.equal(sanitizeConversationId("   ", () => "generated"), "generated");
    assert.equal(sanitizeConversationId("x".repeat(500), () => "generated"), "generated");
  });
});

describe("extractEntities", () => {
  it("buckets vendor/category/plant fields correctly from eq filters", () => {
    const filters: QueryFilter[] = [
      { field: "vendor_name", op: "eq", value: "ABC Corp" },
      { field: "category_l1_name", op: "eq", value: "IT & Telecom" },
      { field: "plant_name", op: "eq", value: "Pune" },
    ];
    const result = extractEntities(EMPTY_ENTITIES, filters);
    assert.deepEqual(result.suppliers, ["ABC Corp"]);
    assert.deepEqual(result.categories, ["IT & Telecom"]);
    assert.deepEqual(result.plants, ["Pune"]);
  });

  it("expands an `in` filter's every value, ignores unrelated fields and non-eq/in operators", () => {
    const filters: QueryFilter[] = [
      { field: "vendor_name", op: "in", value: ["ABC", "XYZ"] },
      { field: "net_order_value_inr", op: "gt", value: 1000 }, // not an entity field
      { field: "vendor_name", op: "gt", value: "ignored" }, // gt doesn't name a specific entity
    ];
    const result = extractEntities(EMPTY_ENTITIES, filters);
    assert.deepEqual(result.suppliers, ["ABC", "XYZ"]);
  });

  it("keeps the newest mentions first and caps each bucket", () => {
    const first = extractEntities(EMPTY_ENTITIES, [{ field: "plant_name", op: "eq", value: "Pune" }]);
    const second = extractEntities(first, [{ field: "plant_name", op: "eq", value: "Chennai" }]);
    const third = extractEntities(second, [{ field: "plant_name", op: "eq", value: "Jharsuguda" }]);
    const fourth = extractEntities(third, [{ field: "plant_name", op: "eq", value: "Rajasthan" }]);
    assert.equal(fourth.plants.length, 3, "capped at 3");
    assert.equal(fourth.plants[0], "Rajasthan", "most recent first");
  });

  it("returns the input unchanged when there are no filters", () => {
    assert.equal(extractEntities(EMPTY_ENTITIES, undefined), EMPTY_ENTITIES);
    assert.equal(extractEntities(EMPTY_ENTITIES, []), EMPTY_ENTITIES);
  });
});

describe("summarizeResult", () => {
  it("takes group labels for a grouped query, capped at 5", () => {
    const result: QueryResult = {
      matchedRows: 100,
      truncated: false,
      groups: Array.from({ length: 8 }, (_, i) => ({ group: `Vendor ${i}`, value: 100 - i, rowCount: 1 })),
    };
    const summary = summarizeResult(result);
    assert.equal(summary.topEntities.length, 5);
    assert.equal(summary.topEntities[0], "Vendor 0");
    assert.equal(summary.rowCount, 100);
  });

  it("takes the first selected field's value per row for a row-level lookup", () => {
    const result: QueryResult = {
      matchedRows: 2,
      truncated: false,
      rows: [{ vendor_name: "ABC", spend: 100 }, { vendor_name: "XYZ", spend: 50 }],
    };
    const summary = summarizeResult(result);
    assert.deepEqual(summary.topEntities, ["ABC", "XYZ"]);
  });

  it("is empty (never throws) for a plain scalar result", () => {
    const summary = summarizeResult({ matchedRows: 1, truncated: false, value: 42 });
    assert.deepEqual(summary.topEntities, []);
    assert.equal(summary.rowCount, 1);
  });
});

describe("applyQueryToContext — dashboard-scoped containment", () => {
  it("stores the query/result under the given dashboard only, never leaking into another dashboard's slot", () => {
    const empty: ConversationContext = {
      conversationId: "x",
      updatedAt: Date.now(),
      entities: EMPTY_ENTITIES,
      perDashboard: {},
    };
    const updated = applyQueryToContext(empty, "builtin:spend-overview", {
      table: "fact_po_items",
      spec: { table: "fact_po_items", groupBy: "vendor_name", measure: "net_order_value_inr", aggregation: "sum", limit: 5 },
      result: { matchedRows: 5, truncated: false, groups: [{ group: "ABC", value: 100, rowCount: 1 }] },
    });
    assert.ok(updated.perDashboard["builtin:spend-overview"]?.lastQuery);
    assert.equal(updated.perDashboard["builtin:compliance"], undefined, "a sibling dashboard's slot must stay untouched");
  });

  it("also updates the global entity bag from the query's filters", () => {
    const empty: ConversationContext = {
      conversationId: "x",
      updatedAt: Date.now(),
      entities: EMPTY_ENTITIES,
      perDashboard: {},
    };
    const updated = applyQueryToContext(empty, "builtin:spend-overview", {
      table: "fact_po_items",
      spec: { table: "fact_po_items", filters: [{ field: "plant_name", op: "eq", value: "Jharsuguda" }] },
      result: { matchedRows: 10, truncated: false, value: 10 },
    });
    assert.deepEqual(updated.entities.plants, ["Jharsuguda"]);
  });
});

describe("buildConversationMemoryBlock", () => {
  it("is null when there is nothing memorable for this dashboard yet", () => {
    const context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
    assert.equal(buildConversationMemoryBlock(context, "builtin:spend-overview"), null);
  });

  it("describes the last query and top results when present", () => {
    let context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
    context = applyQueryToContext(context, "builtin:spend-overview", {
      table: "fact_po_items",
      spec: { table: "fact_po_items", groupBy: "vendor_name", measure: "net_order_value_inr", aggregation: "sum", sort: "desc", limit: 5 },
      result: { matchedRows: 5, truncated: false, groups: [{ group: "ABC", value: 100, rowCount: 1 }, { group: "XYZ", value: 90, rowCount: 1 }] },
    });
    const block = buildConversationMemoryBlock(context, "builtin:spend-overview");
    assert.ok(block);
    assert.match(block!, /grouped by vendor_name/);
    assert.match(block!, /ABC, XYZ/);
  });

  it("never surfaces a query stored under a DIFFERENT dashboard (redirect containment)", () => {
    let context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
    context = applyQueryToContext(context, "builtin:spend-overview", {
      table: "fact_po_items",
      spec: { table: "fact_po_items", groupBy: "vendor_name" },
      result: { matchedRows: 1, truncated: false, groups: [{ group: "ABC", value: 1, rowCount: 1 }] },
    });
    // Nothing queried on payment-terms yet in this conversation.
    assert.equal(buildConversationMemoryBlock(context, "builtin:payment-terms"), null);
  });
});

describe("suggestFollowUps", () => {
  it("is null with no prior query on this dashboard", () => {
    const context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
    assert.equal(suggestFollowUps(context, "builtin:spend-overview"), null);
  });

  it("suggests widening a small top-N and offers a recently-discussed entity not already filtered", () => {
    let context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
    context = applyQueryToContext(context, "builtin:spend-overview", {
      table: "fact_po_items",
      spec: { table: "fact_po_items", groupBy: "vendor_name", limit: 5, filters: [{ field: "plant_name", op: "eq", value: "Jharsuguda" }] },
      result: { matchedRows: 5, truncated: false, groups: [{ group: "ABC", value: 1, rowCount: 1 }] },
    });
    // Discuss a second plant afterwards, without it being part of the stored query's own filters.
    context = { ...context, entities: { ...context.entities, plants: ["Pune", "Jharsuguda"] } };
    const suggestions = suggestFollowUps(context, "builtin:spend-overview")!;
    assert.ok(suggestions.includes("Show top 10"));
    assert.ok(suggestions.some((s) => s.includes("Pune")), `expected a Pune suggestion in ${JSON.stringify(suggestions)}`);
  });

  it("does not suggest a plant/category/supplier that's already the active filter", () => {
    let context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: { suppliers: [], categories: [], plants: ["Jharsuguda"] }, perDashboard: {} };
    context = applyQueryToContext(context, "builtin:spend-overview", {
      table: "fact_po_items",
      spec: { table: "fact_po_items", filters: [{ field: "plant_name", op: "eq", value: "Jharsuguda" }] },
      result: { matchedRows: 5, truncated: false, value: 5 },
    });
    const suggestions = suggestFollowUps(context, "builtin:spend-overview") ?? [];
    assert.ok(!suggestions.some((s) => s === "Only for Jharsuguda"));
  });

  it("offers a breakdown and a YoY comparison for a plain scalar answer (e.g. \"total spend\") — the previously-missed common case", () => {
    let context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
    context = applyQueryToContext(context, "builtin:spend-overview", {
      table: "fact_po_items",
      // No groupBy, no limit, no select — exactly what "What is our total spend?" produces.
      spec: { table: "fact_po_items", measure: "net_order_value_inr", aggregation: "sum" },
      result: { matchedRows: 50000, truncated: false, value: 243610000000 },
    });
    const suggestions = suggestFollowUps(context, "builtin:spend-overview") ?? [];
    assert.ok(suggestions.includes("Break down by category"));
    assert.ok(suggestions.includes("Compare with last year"));
  });

  it("does not suggest a breakdown or YoY comparison for a row-level lookup (select set) — neither means anything against raw rows", () => {
    let context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
    context = applyQueryToContext(context, "builtin:spend-overview", {
      table: "fact_po_items",
      spec: { table: "fact_po_items", select: ["po_number", "vendor_name"], limit: 5 },
      result: { matchedRows: 5, truncated: false, rows: [{ po_number: "PO1", vendor_name: "ABC" }] },
    });
    const suggestions = suggestFollowUps(context, "builtin:spend-overview") ?? [];
    assert.ok(!suggestions.includes("Break down by category"));
    assert.ok(!suggestions.includes("Compare with last year"));
  });

  it("skips the YoY suggestion once a date filter is already applied, but still offers a breakdown", () => {
    let context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
    context = applyQueryToContext(context, "builtin:spend-overview", {
      table: "fact_po_items",
      spec: {
        table: "fact_po_items",
        measure: "net_order_value_inr",
        aggregation: "sum",
        filters: [{ field: "po_date", op: "gte", value: "2024-04-01" }],
      },
      result: { matchedRows: 1409, truncated: false, value: 5177600000 },
    });
    const suggestions = suggestFollowUps(context, "builtin:spend-overview") ?? [];
    assert.ok(suggestions.includes("Break down by category"));
    assert.ok(!suggestions.includes("Compare with last year"));
  });
});

describe("buildContextSummaryForUI", () => {
  it("is null with nothing memorable", () => {
    const context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
    assert.equal(buildContextSummaryForUI(context, "builtin:spend-overview"), null);
  });

  it("combines groupBy, limit, and the most recent named entity — using a human label, never the raw column id", () => {
    let context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
    context = applyQueryToContext(context, "builtin:spend-overview", {
      table: "fact_po_items",
      spec: { table: "fact_po_items", groupBy: "vendor_name", limit: 5, filters: [{ field: "plant_name", op: "eq", value: "Jharsuguda" }] },
      result: { matchedRows: 5, truncated: false, groups: [{ group: "ABC", value: 1, rowCount: 1 }] },
    });
    // "Supplier", not "vendor_name" — a raw internal column id must never
    // reach the user-facing "Remembering: …" strip.
    assert.equal(buildContextSummaryForUI(context, "builtin:spend-overview"), "By Supplier · Top 5 · Jharsuguda");
  });

  it("still produces a readable label (never raw snake_case) for a groupBy field with no explicit mapping", () => {
    let context: ConversationContext = { conversationId: "x", updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
    context = applyQueryToContext(context, "builtin:tail-spend", {
      table: "agg_vendor_annual",
      spec: { table: "agg_vendor_annual", groupBy: "some_new_field_id" },
      result: { matchedRows: 1, truncated: false, groups: [{ group: "X", value: 1, rowCount: 1 }] },
    });
    const summary = buildContextSummaryForUI(context, "builtin:tail-spend");
    assert.ok(summary);
    assert.ok(!summary!.includes("_"), `expected no raw snake_case in "${summary}"`);
    // "ID", not "Id": humanizeFieldName gained an acronym/unit rule so the
    // fallback stops emitting visibly machine-generated labels ("Actual Dpo",
    // "Net Order Value Inr"). The invariant this test exists for — no raw
    // snake_case ever reaches the user — is asserted above and is unchanged.
    assert.equal(summary, "By Some New Field ID");
  });
});
