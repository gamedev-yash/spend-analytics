// dbo.snapshots validation and statement building — no database involved.
//
// The safety property mirrors the query engine's: SQL text is a literal, values
// are bound parameters. These tests pin that a request can influence parameters
// only, and that malformed bodies die as 400s before any driver call.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInsertStatement,
  buildListStatement,
  SnapshotValidationError,
  validateNewSnapshot,
} from "@/lib/server/snapshots";

const VALID_BODY = {
  name: "Tail Spend — 3 Aug 2026",
  dashboardId: "tail-spend",
  data: { filters: { categories: ["Raw Materials"] }, microPOThreshold: 25_000 },
};

function expectRejected(body: unknown, fragment: string): void {
  try {
    validateNewSnapshot(body);
  } catch (err) {
    assert.ok(err instanceof SnapshotValidationError, `expected validation error, got ${String(err)}`);
    assert.equal(err.status, 400);
    assert.ok(err.message.includes(fragment), `${JSON.stringify(err.message)} should mention ${fragment}`);
    return;
  }
  throw new Error(`expected rejection mentioning ${JSON.stringify(fragment)}`);
}

describe("validateNewSnapshot", () => {
  it("accepts a well-formed body and serializes the data payload", () => {
    const snapshot = validateNewSnapshot(VALID_BODY);
    assert.equal(snapshot.name, VALID_BODY.name);
    assert.equal(snapshot.dashboardId, "tail-spend");
    assert.equal(snapshot.createdBy, "local-user", "createdBy defaults when omitted");
    assert.deepEqual(JSON.parse(snapshot.dataJson), VALID_BODY.data);
  });

  it("trims and keeps an explicit createdBy", () => {
    const snapshot = validateNewSnapshot({ ...VALID_BODY, createdBy: "  chinmay  " });
    assert.equal(snapshot.createdBy, "chinmay");
  });

  it("rejects a missing or empty name", () => {
    expectRejected({ ...VALID_BODY, name: undefined }, "`name`");
    expectRejected({ ...VALID_BODY, name: "   " }, "`name`");
  });

  it("rejects over-long fields at the schema's column widths", () => {
    expectRejected({ ...VALID_BODY, name: "x".repeat(256) }, "255");
    expectRejected({ ...VALID_BODY, dashboardId: "x".repeat(101) }, "100");
    expectRejected({ ...VALID_BODY, createdBy: "x".repeat(101) }, "100");
  });

  it("rejects a missing data payload — a snapshot with no state preserves nothing", () => {
    expectRejected({ name: "n", dashboardId: "d" }, "`data`");
    expectRejected({ name: "n", dashboardId: "d", data: null }, "`data`");
  });

  it("rejects a data payload above the serialized cap", () => {
    const body = { ...VALID_BODY, data: { blob: "y".repeat(500_001) } };
    expectRejected(body, "limit");
  });

  it("rejects non-object bodies", () => {
    expectRejected(null, "JSON object");
    expectRejected("a string", "JSON object");
  });
});

describe("buildInsertStatement", () => {
  const snapshot = validateNewSnapshot(VALID_BODY);
  const built = buildInsertStatement(snapshot, "00000000-0000-4000-8000-000000000000");

  it("binds every value — none appears in the SQL text", () => {
    assert.deepEqual(
      built.parameters.map((p) => p.name),
      ["id", "name", "dashboardId", "createdBy", "data"]
    );
    for (const parameter of built.parameters) {
      if (typeof parameter.value === "string" && parameter.value.length > 2) {
        assert.ok(
          !built.sql.includes(parameter.value),
          `parameter "${parameter.name}" leaked into SQL text`
        );
      }
    }
  });

  it("targets dbo.snapshots and returns the inserted row via OUTPUT", () => {
    assert.match(built.sql, /INSERT INTO dbo\.snapshots/);
    assert.match(built.sql, /OUTPUT INSERTED\.id[\s\S]*INSERTED\.created_at/);
    assert.match(built.sql, /VALUES \(@id, @name, @dashboardId, @createdBy, @data\)/);
  });

  it("stores data as the serialized JSON string", () => {
    const data = built.parameters.find((p) => p.name === "data");
    assert.equal(typeof data?.value, "string");
    assert.deepEqual(JSON.parse(String(data?.value)), VALID_BODY.data);
  });
});

describe("buildListStatement", () => {
  it("orders newest first and caps with TOP(@limit)", () => {
    const built = buildListStatement(undefined, 50);
    assert.match(built.sql, /SELECT TOP \(@limit\)/);
    assert.match(built.sql, /ORDER BY created_at DESC/);
    assert.ok(!built.sql.includes("WHERE"), "no filter without a dashboardId");
    assert.deepEqual(built.parameters, [{ name: "limit", value: 50 }]);
  });

  it("filters by dashboardId as a bound parameter", () => {
    const built = buildListStatement("tail-spend", 10);
    assert.match(built.sql, /WHERE dashboard_id = @dashboardId/);
    assert.ok(!built.sql.includes("tail-spend"), "filter value must not appear in SQL text");
    assert.deepEqual(built.parameters, [
      { name: "limit", value: 10 },
      { name: "dashboardId", value: "tail-spend" },
    ]);
  });

  it("rejects a limit outside 1..200 instead of clamping silently", () => {
    assert.throws(() => buildListStatement(undefined, 0), SnapshotValidationError);
    assert.throws(() => buildListStatement(undefined, 201), SnapshotValidationError);
    assert.throws(() => buildListStatement(undefined, 2.5), SnapshotValidationError);
  });

  it("rejects an over-long dashboardId filter", () => {
    assert.throws(() => buildListStatement("x".repeat(101)), SnapshotValidationError);
  });
});
