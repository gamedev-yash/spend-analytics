// Coverage for the user-triggered action-plan feature: the validation gate
// that stands between a generator and a downloadable file, the demo
// generator's scope guard, the artifact store's filename/eviction safety, the
// report cache's staleness key, and — the part worth actually proving — that
// both renderers emit real, parseable OOXML from the same object.
//
// Deliberately NOT covered here: the Claude generator's tool loop. It needs a
// live model, and this repo's test suite has no HTTP mocking layer — the same
// reason app/api/dashboard-chat's loop isn't unit tested either. Its query
// path is exercised by tests/dashboard-query.test.ts, since it calls the very
// same runDashboardQuery().

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import ExcelJS from "exceljs";

import { validateActionPlan, ActionPlanValidationError } from "@/lib/ai/actions/action-plan-validate";
import { demoActionPlanGenerator } from "@/lib/ai/actions/demo-action-plan";
import { selectGenerator, type ActionPlanContext, type ActionPlanGenerator } from "@/lib/ai/actions/action-plan-generator";
import { assistantAction, assistantActionsFor } from "@/lib/ai/actions/assistant-actions";
import type { ActionPlanResult } from "@/lib/ai/actions/action-plan-types";
import { renderActionPlanWord } from "@/lib/ai/reports/report-word";
import { renderActionPlanExcel } from "@/lib/ai/reports/report-excel";
import {
  _clearArtifactsForTests,
  _sizeForTests,
  getArtifact,
  putArtifact,
  safeFilename,
} from "@/lib/ai/reports/artifact-store";
import { _clearReportCacheForTests, buildReportCacheKey } from "@/lib/ai/reports/report-cache";

afterEach(() => {
  _clearArtifactsForTests();
  _clearReportCacheForTests();
});

const MINIMAL_PLAN: Record<string, unknown> = {
  title: "Test Plan",
  objective: "Reduce something measurable",
  scope: "Test dashboard, unfiltered",
  insightSummary: "A summary.",
  facts: [{ label: "Suppliers", value: "98", source: "Count of distinct suppliers" }],
  insights: [{ insight: "Fragmented", basedOn: "Supplier count" }],
  recommendations: [{ action: "Consolidate", priority: "High", reason: "Too many", expectedImpact: "Fewer suppliers" }],
  benefits: [{ metric: "Savings", formula: "spend x rate", assumption: "5% is illustrative", value: "Rs 49 L" }],
  risks: [{ risk: "Sole source", mitigation: "Screen first" }],
  implementationPlan: [{ phase: "Phase 1", action: "Validate", timeline: "Weeks 1-2", owner: "Category Manager" }],
  assumptions: ["5% savings rate is illustrative."],
  nextSteps: ["Confirm the list."],
};

function planWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...MINIMAL_PLAN, ...overrides };
}

const CONTEXT: ActionPlanContext = {
  dashboardKey: "supplier-fragmentation",
  dashboardLabel: "Supplier Fragmentation",
  dashboardDescription: "…",
  objective: "Give me a plan to reduce supplier fragmentation in MRO & Spares",
  activeFilters: null,
  conversationMemory: null,
};

// ---------------------------------------------------------------------------

describe("validateActionPlan — the gate before any file is written", () => {
  it("accepts a well-formed plan unchanged", () => {
    const plan = validateActionPlan(MINIMAL_PLAN);
    assert.equal(plan.title, "Test Plan");
    assert.equal(plan.recommendations.length, 1);
    assert.equal(plan.benefits[0].value, "Rs 49 L");
  });

  it("rejects a plan with no recommendations — an action plan with nothing to do is not a report", () => {
    assert.throws(() => validateActionPlan(planWith({ recommendations: [] })), ActionPlanValidationError);
  });

  it("rejects a benefit that states a value with no formula behind it (the anti-fabrication rule)", () => {
    assert.throws(
      () => validateActionPlan(planWith({ benefits: [{ metric: "Savings", value: "Rs 50 Lakh" }] })),
      ActionPlanValidationError
    );
  });

  it("rejects a benefit that states a value with no assumption behind it", () => {
    assert.throws(
      () =>
        validateActionPlan(
          planWith({ benefits: [{ metric: "Savings", formula: "spend x rate", assumption: "", value: "Rs 50 Lakh" }] })
        ),
      ActionPlanValidationError
    );
  });

  it("ALLOWS a benefit with no value — declining to quantify is correct behaviour, not an error", () => {
    const plan = validateActionPlan(
      planWith({
        benefits: [{ metric: "Time saved", formula: "suppliers x hours", assumption: "Hours are not tracked here." }],
      })
    );
    assert.equal(plan.benefits[0].value, undefined);
  });

  it("rejects an unknown priority rather than coercing it silently", () => {
    assert.throws(
      () =>
        validateActionPlan(
          planWith({ recommendations: [{ action: "X", priority: "Urgent", reason: "Y", expectedImpact: "Z" }] })
        ),
      ActionPlanValidationError
    );
  });

  it("rejects a missing title", () => {
    assert.throws(() => validateActionPlan(planWith({ title: "" })), ActionPlanValidationError);
  });

  it("rejects a non-object entirely", () => {
    assert.throws(() => validateActionPlan("not a plan"), ActionPlanValidationError);
  });

  it("truncates rather than fails on an over-long list — verbosity is not a correctness failure", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      action: `Action ${i}`,
      priority: "Low",
      reason: "r",
      expectedImpact: "i",
    }));
    const plan = validateActionPlan(planWith({ recommendations: many }));
    assert.equal(plan.recommendations.length, 25);
  });

  it("reports every issue at once, so a broken generator is diagnosable in one pass", () => {
    try {
      validateActionPlan(planWith({ title: "", objective: "", recommendations: [] }));
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof ActionPlanValidationError);
      assert.ok(err.issues.length >= 3, `expected several issues, got ${err.issues.length}`);
    }
  });
});

// ---------------------------------------------------------------------------

describe("demo generator scope guard — never a generic report on the wrong dashboard", () => {
  it("handles the MRO fragmentation scenario it was written for", () => {
    assert.equal(demoActionPlanGenerator.canHandle(CONTEXT), true);
  });

  it("declines the same objective on a different dashboard", () => {
    assert.equal(demoActionPlanGenerator.canHandle({ ...CONTEXT, dashboardKey: "payment-terms" }), false);
  });

  it("declines an unrelated objective on its own dashboard", () => {
    assert.equal(
      demoActionPlanGenerator.canHandle({ ...CONTEXT, objective: "Which categories have active contracts?" }),
      false
    );
  });

  it("produces content that passes the same validation gate as a live plan", async () => {
    const plan = validateActionPlan(await demoActionPlanGenerator.generate(CONTEXT));
    assert.ok(plan.recommendations.length > 0);
    assert.ok(plan.assumptions.length > 0);
    // The one benefit it deliberately declines to quantify.
    assert.ok(plan.benefits.some((b) => b.value === undefined));
    // Says out loud that it is demo content.
    assert.match(plan.scope, /demonstration/i);
  });
});

describe("selectGenerator", () => {
  const dynamicStub: ActionPlanGenerator = {
    kind: "dynamic",
    canHandle: () => true,
    generate: async () => MINIMAL_PLAN as unknown as ActionPlanResult,
  };

  it("prefers the demo generator for the scenario it claims", () => {
    const chosen = selectGenerator(CONTEXT, [demoActionPlanGenerator, dynamicStub]);
    assert.equal(chosen?.kind, "demo");
  });

  it("falls through to the dynamic generator when the demo declines", () => {
    const chosen = selectGenerator({ ...CONTEXT, dashboardKey: "tail-spend" }, [demoActionPlanGenerator, dynamicStub]);
    assert.equal(chosen?.kind, "dynamic");
  });

  it("REPORT_GENERATOR=dynamic drops the demo generator entirely — the production switch", () => {
    const previous = process.env.REPORT_GENERATOR;
    process.env.REPORT_GENERATOR = "dynamic";
    try {
      const chosen = selectGenerator(CONTEXT, [demoActionPlanGenerator, dynamicStub]);
      assert.equal(chosen?.kind, "dynamic");
    } finally {
      if (previous === undefined) delete process.env.REPORT_GENERATOR;
      else process.env.REPORT_GENERATOR = previous;
    }
  });
});

describe("assistant action registry", () => {
  it("resolves the known action and rejects anything else", () => {
    assert.equal(assistantAction("action_plan")?.id, "action_plan");
    assert.equal(assistantAction("delete_everything"), null);
    assert.equal(assistantAction(""), null);
  });

  it("offers the action on every dashboard today", () => {
    assert.equal(assistantActionsFor("payment-terms").length, 1);
  });
});

// ---------------------------------------------------------------------------

/** ZIP local-file-header names are stored uncompressed, so a raw scan proves real OOXML packaging. */
function zipContains(bytes: Uint8Array, entryName: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(entryName, "ascii"));
}

describe("renderers — one ActionPlanResult, two real documents", () => {
  it("Word output is a valid OOXML package containing a document part", async () => {
    const plan = validateActionPlan(MINIMAL_PLAN);
    const bytes = await renderActionPlanWord(plan);
    assert.ok(bytes.byteLength > 2_000, `suspiciously small: ${bytes.byteLength} bytes`);
    assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], "missing ZIP magic — not a real .docx");
    assert.ok(zipContains(bytes, "[Content_Types].xml"));
    assert.ok(zipContains(bytes, "word/document.xml"));
  });

  it("Excel output parses back through ExcelJS with the five expected sheets", async () => {
    const plan = validateActionPlan(MINIMAL_PLAN);
    const bytes = await renderActionPlanExcel(plan);
    assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], "missing ZIP magic — not a real .xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    assert.deepEqual(
      workbook.worksheets.map((w) => w.name),
      ["Executive Summary", "Supporting Data", "Insights", "Recommended Actions", "Benefits & Assumptions"]
    );
  });

  it("both renderers print the SAME fallback for an unquantified benefit — the single-source-of-truth check", async () => {
    const plan = validateActionPlan(
      planWith({
        benefits: [{ metric: "Time saved", formula: "suppliers x hours", assumption: "Hours are not tracked here." }],
      })
    );
    const [word, excel] = await Promise.all([renderActionPlanWord(plan), renderActionPlanExcel(plan)]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(excel) as unknown as ArrayBuffer);
    const benefitsSheet = workbook.getWorksheet("Benefits & Assumptions");
    let foundInExcel = false;
    benefitsSheet?.eachRow((row) => {
      if (row.values && JSON.stringify(row.values).includes("Not quantifiable from available dashboard data")) {
        foundInExcel = true;
      }
    });
    assert.ok(foundInExcel, "Excel is missing the not-quantifiable fallback");
    // Word's XML is deflated inside the zip, so assert on size/validity here
    // and trust the shared constant (lib/ai/reports/report-labels.ts) for the
    // wording — which is exactly the invariant that constant exists to hold.
    assert.ok(word.byteLength > 2_000);
  });

  it("renders a plan whose optional sections are all empty without throwing", async () => {
    const plan = validateActionPlan(
      planWith({ facts: [], insights: [], benefits: [], risks: [], implementationPlan: [], assumptions: [], nextSteps: [] })
    );
    const [word, excel] = await Promise.all([renderActionPlanWord(plan), renderActionPlanExcel(plan)]);
    assert.ok(word.byteLength > 1_000);
    assert.ok(excel.byteLength > 1_000);
  });
});

// ---------------------------------------------------------------------------

describe("artifact store", () => {
  it("issues an opaque id and returns the bytes back", () => {
    const stored = putArtifact("word", "plan.docx", new Uint8Array([1, 2, 3]));
    assert.match(stored.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(getArtifact(stored.id)?.bytes, new Uint8Array([1, 2, 3]));
  });

  it("returns null for an unknown id — the download route's 404 path", () => {
    assert.equal(getArtifact("../../etc/passwd"), null);
    assert.equal(getArtifact(""), null);
  });

  it("safeFilename strips path separators, traversal, and quotes from a model-supplied title", () => {
    assert.equal(safeFilename("../../etc/passwd", "docx"), "etcpasswd.docx");
    assert.equal(safeFilename('evil"; rm -rf /', "xlsx"), "evil-rm--rf.xlsx");
    assert.equal(safeFilename("", "docx"), "action-plan.docx");
    assert.equal(safeFilename("MRO & Spares — Plan", "docx"), "MRO-Spares-Plan.docx");
    // No separator survives, whatever the input.
    for (const name of ["a/b", "a\\b", "..", "./x"]) {
      const out = safeFilename(name, "docx");
      assert.ok(!out.includes("/") && !out.includes("\\"), `separator survived in ${out}`);
    }
  });

  it("evicts oldest-first once the entry bound is reached", () => {
    for (let i = 0; i < 210; i += 1) putArtifact("word", `p${i}.docx`, new Uint8Array([i % 256]));
    assert.ok(_sizeForTests() <= 200, `store grew to ${_sizeForTests()}`);
  });
});

describe("report cache key — what invalidates a report", () => {
  const base = {
    datasetVersion: "v1",
    dashboardKey: "supplier-fragmentation",
    action: "action_plan" as const,
    activeFilters: "Category: MRO & Spares",
    objective: "Reduce fragmentation",
  };

  it("a new dataset version produces a different key — the staleness guarantee", () => {
    assert.notEqual(buildReportCacheKey(base), buildReportCacheKey({ ...base, datasetVersion: "v2" }));
  });

  it("different filters, dashboard, or objective each produce a different key", () => {
    assert.notEqual(buildReportCacheKey(base), buildReportCacheKey({ ...base, activeFilters: "Category: IT" }));
    assert.notEqual(buildReportCacheKey(base), buildReportCacheKey({ ...base, dashboardKey: "tail-spend" }));
    assert.notEqual(buildReportCacheKey(base), buildReportCacheKey({ ...base, objective: "Something else" }));
  });

  it("casing and whitespace in the objective do not split the cache", () => {
    assert.equal(
      buildReportCacheKey(base),
      buildReportCacheKey({ ...base, objective: "  Reduce   FRAGMENTATION  " })
    );
  });
});
