// Regression coverage for the unified-dataset AI-assistant audit:
//   1. dashboard-registry descriptions stay rich enough to route on (not a
//      one-liner regression) and every route/key pairing still resolves.
//   2. lib/ai/dashboard-context.ts and lib/ai/dashboard-query.ts memoize their
//      per-dashboard schema/tool-schema builds — the fix for the redundant
//      describeSchema() recompute app/api/dashboard-chat/route.ts used to pay
//      on every tool-calling pass of every request (docs/ARCHITECTURE.md §4.3).
//
// Deliberately does not assert exact description wording — that would make
// the test brittle against future copy edits for no real safety benefit.
// It asserts the *properties* that make a description useful for routing:
// long enough to carry real scope/exclusion guidance, and naming at least one
// other dashboard by label so a redirect decision has something to key off.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DASHBOARD_REGISTRY,
  dashboardKeyForPathname,
  dashboardMeta,
} from "@/lib/ai/dashboard-registry";
import { buildDashboardContext, isDashboardContextCached } from "@/lib/ai/dashboard-context";
import { queryDashboardDataTool } from "@/lib/ai/dashboard-query";

const MIN_DESCRIPTION_LENGTH = 300;

describe("DASHBOARD_REGISTRY descriptions", () => {
  it("every dashboard has a routing-grade description, not a one-line label", () => {
    for (const { key, description } of DASHBOARD_REGISTRY) {
      assert.ok(
        description.length >= MIN_DESCRIPTION_LENGTH,
        `${key}'s description is only ${description.length} chars — too short to carry scope + exclusion guidance`
      );
    }
  });

  it("every description names at least one OTHER dashboard, for redirect grounding", () => {
    for (const { key, label, description } of DASHBOARD_REGISTRY) {
      const otherLabels = DASHBOARD_REGISTRY.filter((d) => d.key !== key).map((d) => d.label);
      const mentionsAnother = otherLabels.some((otherLabel) => description.includes(otherLabel));
      assert.ok(mentionsAnother, `${label}'s description doesn't name any sibling dashboard to redirect to`);
    }
  });

  it("every registry entry's route still round-trips through dashboardKeyForPathname", () => {
    for (const { key, route } of DASHBOARD_REGISTRY) {
      assert.equal(dashboardKeyForPathname(route), key);
      assert.equal(dashboardKeyForPathname(`${route}/sub-page`), key);
    }
  });

  it("dashboardMeta throws on an unknown key rather than returning undefined", () => {
    // @ts-expect-error deliberately invalid key
    assert.throws(() => dashboardMeta("not-a-real-dashboard"));
  });
});

describe("per-dashboard context/tool-schema memoization", () => {
  it("buildDashboardContext(key) is marked cached after being built once", () => {
    const context = buildDashboardContext("spend-overview");
    assert.ok(context.length > 0);
    assert.equal(isDashboardContextCached("spend-overview"), true);
    // Same key, second call — must be the identical content, not a fresh rebuild.
    assert.equal(buildDashboardContext("spend-overview"), context);
  });

  it("different dashboards get independently cached, non-identical context", () => {
    const spendOverview = buildDashboardContext("spend-overview");
    const paymentTerms = buildDashboardContext("payment-terms");
    assert.notEqual(spendOverview, paymentTerms);
    assert.equal(isDashboardContextCached("payment-terms"), true);
  });

  it("queryDashboardDataTool(key) returns the same cached object on repeat calls", () => {
    // Reference equality (not just deepEqual) is the actual proof of
    // memoization — two independently-built tool schemas would never be
    // ===, since input_schema is a fresh object literal each time.
    assert.strictEqual(queryDashboardDataTool("tail-spend"), queryDashboardDataTool("tail-spend"));
  });

  it("memoized tool schemas still don't leak fields across dashboards", () => {
    const tailSpend = queryDashboardDataTool("tail-spend") as { input_schema: { properties: { table: { enum: string[] } } } };
    const paymentTerms = queryDashboardDataTool("payment-terms") as {
      input_schema: { properties: { table: { enum: string[] } } };
    };
    assert.notDeepEqual(tailSpend.input_schema.properties.table.enum, paymentTerms.input_schema.properties.table.enum);
  });
});
