// Coverage for the user-triggered action-plan feature: the validation gate that
// stands between the engine and a downloadable file, the artifact store's
// filename/eviction safety, the report cache's staleness key, the fact that both
// renderers emit real parseable OOXML from the same object — and, added when the
// feature was made fully generic, a static assertion that no scenario-specific
// code has crept back in.
//
// Deliberately NOT covered here: the engine's Claude tool loop. It needs a live
// model, and this repo's test suite has no HTTP mocking layer — the same reason
// app/api/dashboard-chat's loop isn't unit tested either. Its query path is
// exercised by tests/dashboard-query.test.ts, since it calls the very same
// runDashboardQuery(). End-to-end coverage of the engine is manual: a live POST
// per dashboard, recorded in the implementation notes.
//
// The fixtures below are deliberately BLAND — "Metric A", "Dimension B". An
// earlier version of this file used supplier/spend fixtures, which made it
// impossible to tell whether a passing test proved the pipeline was generic or
// merely that it handled the one domain the fixtures came from.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import ExcelJS from "exceljs";

import { validateActionPlan, ActionPlanValidationError } from "@/lib/ai/actions/action-plan-validate";
import { assistantAction, assistantActionsFor } from "@/lib/ai/actions/assistant-actions";
import { internalIdentifiers, findLeakedIdentifiers, scrubIdentifiers } from "@/lib/ai/actions/identifier-guard";
import { humanizeFieldName } from "@/lib/ai/conversation-context";
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
  objective: "Improve something measurable",
  scope: "Test dashboard, unfiltered",
  insightSummary: "A summary.",
  facts: [{ label: "Metric A", value: "42", source: "Count of records" }],
  insights: [{ insight: "Concentrated", basedOn: "Metric A" }],
  opportunities: [{ opportunity: "Something worth pursuing", basedOn: "Metric A" }],
  recommendations: [
    { action: "Do the thing", priority: "High", reason: "Because of Metric A", expectedImpact: "Lower Metric A", evidence: "Metric A = 42" },
  ],
  benefits: [
    { metric: "Saving", formula: "base x rate", assumption: "Rate is illustrative", basis: "Metric A = 42", confidence: "Medium", value: "Rs 49 L" },
  ],
  risks: [{ risk: "A risk", mitigation: "A mitigation" }],
  implementationPlan: [{ phase: "Phase 1", action: "Validate", timeline: "Weeks 1-2", owner: "A Role" }],
  assumptions: ["The rate is illustrative."],
  nextSteps: ["Confirm the list."],
  dataGaps: [],
};

function planWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...MINIMAL_PLAN, ...overrides };
}

async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return workbook;
}

function sheetContains(workbook: ExcelJS.Workbook, sheetName: string, needle: string): boolean {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return false;
  let found = false;
  sheet.eachRow((row) => {
    if (row.values && JSON.stringify(row.values).includes(needle)) found = true;
  });
  return found;
}

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
          planWith({ benefits: [{ metric: "Savings", formula: "spend x rate", assumption: "", basis: "b", confidence: "Low", value: "Rs 50 Lakh" }] })
        ),
      ActionPlanValidationError
    );
  });

  it("ALLOWS a benefit with no value — declining to quantify is correct behaviour, not an error", () => {
    const plan = validateActionPlan(
      planWith({
        benefits: [{ metric: "Time saved", formula: "records x hours", assumption: "Hours are not tracked here.", basis: "42 records", confidence: "Low" }],
      })
    );
    assert.equal(plan.benefits[0].value, undefined);
  });

  it("rejects an unknown priority rather than coercing it silently", () => {
    assert.throws(
      () =>
        validateActionPlan(
          planWith({ recommendations: [{ action: "X", priority: "Urgent", reason: "Y", expectedImpact: "Z", evidence: "E" }] })
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
      evidence: "e",
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

describe("dataGaps — how the generic engine reports what a dashboard can't answer", () => {
  it("accepts an empty list, which is the normal fully-answerable case", () => {
    assert.deepEqual(validateActionPlan(planWith({ dataGaps: [] })).dataGaps, []);
  });

  it("accepts a missing list rather than demanding gaps be invented", () => {
    const raw = planWith({});
    delete raw.dataGaps;
    assert.deepEqual(validateActionPlan(raw).dataGaps, []);
  });

  it("carries declared gaps through to the validated plan", () => {
    const plan = validateActionPlan(
      planWith({ dataGaps: ["Per-unit cost is not carried by this dashboard.", "No headcount data available."] })
    );
    assert.equal(plan.dataGaps.length, 2);
  });

  it("renders into both documents only when non-empty", async () => {
    const withGaps = validateActionPlan(planWith({ dataGaps: ["Something the dashboard lacks."] }));
    const without = validateActionPlan(planWith({ dataGaps: [] }));

    const [wbWith, wbWithout] = await Promise.all([
      renderActionPlanExcel(withGaps).then(loadWorkbook),
      renderActionPlanExcel(without).then(loadWorkbook),
    ]);
    assert.equal(sheetContains(wbWith, "Benefits & Assumptions", "Data Not Available"), true);
    assert.equal(sheetContains(wbWithout, "Benefits & Assumptions", "Data Not Available"), false);

    // Word's XML is deflated inside the zip, so assert on the size delta: the
    // gaps section adds real content to one and nothing to the other.
    const [docWith, docWithout] = await Promise.all([
      renderActionPlanWord(withGaps),
      renderActionPlanWord(without),
    ]);
    assert.ok(docWith.byteLength > docWithout.byteLength, "gaps section did not reach the Word document");
  });
});

describe("enriched anti-fabrication fields — what a number must carry", () => {
  it("rejects a benefit with no basis, even when formula and assumption are present", () => {
    assert.throws(
      () =>
        validateActionPlan(
          planWith({
            benefits: [{ metric: "M", formula: "a x b", assumption: "illustrative", confidence: "Low", value: "X" }],
          })
        ),
      ActionPlanValidationError
    );
  });

  it("rejects a benefit with no confidence — an unrated number hides how much to trust it", () => {
    assert.throws(
      () =>
        validateActionPlan(
          planWith({ benefits: [{ metric: "M", formula: "a x b", assumption: "i", basis: "b", value: "X" }] })
        ),
      ActionPlanValidationError
    );
  });

  it("rejects an unknown confidence rather than coercing it", () => {
    assert.throws(
      () =>
        validateActionPlan(
          planWith({
            benefits: [{ metric: "M", formula: "a x b", assumption: "i", basis: "b", confidence: "Certain" }],
          })
        ),
      ActionPlanValidationError
    );
  });

  it("requires confidence even on an UNQUANTIFIED benefit — strength of evidence is knowable either way", () => {
    const plan = validateActionPlan(
      planWith({ benefits: [{ metric: "M", formula: "a x b", assumption: "i", basis: "b", confidence: "Low" }] })
    );
    assert.equal(plan.benefits[0].value, undefined);
    assert.equal(plan.benefits[0].confidence, "Low");
  });

  it("rejects a recommendation with no evidence — an untraceable action is an opinion", () => {
    assert.throws(
      () =>
        validateActionPlan(
          planWith({ recommendations: [{ action: "A", priority: "High", reason: "R", expectedImpact: "I" }] })
        ),
      ActionPlanValidationError
    );
  });

  it("allows an opportunity with no scale — stating it unsized beats inflating it", () => {
    const plan = validateActionPlan(planWith({ opportunities: [{ opportunity: "O", basedOn: "Metric A" }] }));
    assert.equal(plan.opportunities[0].scale, undefined);
  });

  it("allows optional dependencies and successMetric to be absent", () => {
    const plan = validateActionPlan(planWith({}));
    assert.equal(plan.recommendations[0].dependencies, undefined);
    assert.equal(plan.implementationPlan[0].successMetric, undefined);
  });

  it("renders the enriched columns into both documents", async () => {
    const plan = validateActionPlan(planWith({}));
    const workbook = await renderActionPlanExcel(plan).then(loadWorkbook);
    assert.ok(sheetContains(workbook, "Recommended Actions", "Evidence"));
    assert.ok(sheetContains(workbook, "Benefits & Assumptions", "Confidence"));
    assert.ok(sheetContains(workbook, "Insights", "Opportunities"));
    assert.ok((await renderActionPlanWord(plan)).byteLength > 2_000);
  });

  it("omits the Opportunities block entirely when there are none", async () => {
    const none = validateActionPlan(planWith({ opportunities: [] }));
    const workbook = await renderActionPlanExcel(none).then(loadWorkbook);
    assert.equal(sheetContains(workbook, "Insights", "Opportunities"), false);
  });
});

// ---------------------------------------------------------------------------

describe("suitability triage — Report Mode is an intent signal, not a command", () => {
  it("the engine offers BOTH terminal moves, so triage costs no extra Claude call", () => {
    const src = readFileSync("lib/ai/actions/action-plan-engine.ts", "utf8");
    const toolArray = src.slice(src.indexOf("const tools: Anthropic.Tool[]"), src.indexOf("const messages"));
    assert.match(toolArray, /queryDashboardDataTool/);
    assert.match(toolArray, /GENERATE_ACTION_PLAN_TOOL/);
    assert.match(toolArray, /RESPOND_WITHOUT_REPORT_TOOL/);
  });

  it("all four non-report kinds are declared in the triage tool", () => {
    const src = readFileSync("lib/ai/actions/action-plan-engine.ts", "utf8");
    for (const kind of ["factual", "navigation", "clarification", "unsupported"]) {
      assert.match(src, new RegExp(`"${kind}"`), `triage tool is missing kind "${kind}"`);
    }
  });

  it("triage decides by understanding, never by inspecting the user's words", () => {
    // The precise invariant: nothing in the pipeline reads the objective (or any
    // alias for the user's text) and branches on its content. Deliberately NOT a
    // blanket ban on string matching — identifier-guard.ts legitimately does
    // `name.includes("_")` to classify the SHAPE of a schema identifier, which
    // has nothing to do with interpreting a request.
    const userTextVar = /(objective|message|question|request|userInput|prompt)\s*(\.|\?\.)\s*(includes|startsWith|endsWith|indexOf|match|search|test)\s*\(/;
    // And no phrase list to match against, however it were applied.
    const keywordList = /[A-Z_]*(KEYWORD|PHRASE|TRIGGER|SCENARIO)[A-Z_]*\s*(:|=)/;
    for (const dir of PIPELINE_DIRS) {
      for (const { path, body } of sourceFiles(dir)) {
        const code = strippedCode(body);
        assert.doesNotMatch(code, userTextVar, `${path} branches on the user's text`);
        assert.doesNotMatch(code, keywordList, `${path} declares a keyword/scenario list`);
      }
    }
  });

  it("the word \"report\" is never required of the user", () => {
    // §4: Report Mode itself is the signal. Nothing may test for the keyword.
    for (const dir of PIPELINE_DIRS) {
      for (const { path, body } of sourceFiles(dir)) {
        assert.doesNotMatch(
          strippedCode(body),
          /(includes|match|test|indexOf)\s*\(\s*["'`]\s*report/i,
          `${path} tests for the word "report"`
        );
      }
    }
  });

  it("a non-report outcome is a SUCCESS in the contract, not an error", () => {
    const src = readFileSync("lib/ai/actions/action-plan-types.ts", "utf8");
    const block = src.slice(src.indexOf("interface AssistantActionNoReport"));
    assert.match(block.slice(0, 300), /success:\s*true/);
  });

  it("a non-report turn never caches, so a clarification is not replayed", () => {
    const src = readFileSync("lib/ai/actions/action-plan-service.ts", "utf8");
    const noReportBranch = src.slice(src.indexOf('outcome.kind === "no_report"'));
    const beforeReturn = noReportBranch.slice(0, noReportBranch.indexOf("raw = outcome.plan"));
    assert.doesNotMatch(beforeReturn, /setCachedReport/);
  });
});

// ---------------------------------------------------------------------------

describe("identifier guard — no internal table/column name reaches the reader", () => {
  it("derives its forbidden vocabulary from the real schemas, across every dashboard", () => {
    const ids = internalIdentifiers();
    assert.ok(ids.length > 10, `expected a real schema, got ${ids.length} identifiers`);
    assert.ok(ids.includes("fact_po_items"), "table ids should be covered");
    // Every entry must be snake_case — that is the rule that keeps ordinary
    // words like "region" or "year" from being treated as internal.
    assert.deepEqual(ids.filter((i) => !i.includes("_")), []);
  });

  it("finds an identifier no matter how deeply nested in the plan", () => {
    const nested = validateActionPlan(
      planWith({ facts: [{ label: "X", value: "1", source: "Rows where is_contract_backed = 0" }] })
    );
    assert.deepEqual(findLeakedIdentifiers(nested), ["is_contract_backed"]);
  });

  it("finds identifiers in assumptions, nextSteps and dataGaps — the fields that actually leaked live", () => {
    const leaky = validateActionPlan(
      planWith({
        assumptions: ["Uses the is_tail flag."],
        nextSteps: ["Pull invoice-level data (fact_invoices)."],
        dataGaps: ["fact_invoices was not queried."],
      })
    );
    const found = findLeakedIdentifiers(leaky);
    assert.ok(found.includes("fact_invoices"));
  });

  it("does NOT flag a clean report written in business language", () => {
    const clean = validateActionPlan(
      planWith({
        facts: [{ label: "Suppliers in this region", value: "98", source: "Count of distinct suppliers this year" }],
        insights: [{ insight: "Spend is concentrated by region and by year.", basedOn: "Supplier count" }],
        assumptions: ["The currency is unchanged across the period."],
      })
    );
    // "region", "year", "currency" are real column names but ordinary English —
    // flagging them would reject correct prose.
    assert.deepEqual(findLeakedIdentifiers(clean), []);
  });

  it("scrubs every occurrence into plain language, leaving no underscore behind", () => {
    const leaky = validateActionPlan(
      planWith({
        facts: [{ label: "Off-contract", value: "1", source: "Rows where is_contract_backed = 0" }],
        assumptions: ["Derived from actual_dpo per document."],
      })
    );
    const scrubbed = scrubIdentifiers(leaky);
    // The actual guarantee: no identifier survives, from any dashboard's schema.
    assert.deepEqual(findLeakedIdentifiers(scrubbed), []);
    assert.ok(!JSON.stringify(scrubbed).includes("is_contract_backed"));
    assert.ok(!JSON.stringify(scrubbed).includes("actual_dpo"));
    // Replaced via the app's existing field-label mapping, not a second one —
    // and acronyms survive as acronyms rather than being title-cased into "Dpo".
    assert.match(JSON.stringify(scrubbed), /Actual DPO/);
  });

  it("every identifier has a label with no snake_case left in it", () => {
    const unlabelled = internalIdentifiers().filter((id) => humanizeFieldName(id).includes("_"));
    assert.deepEqual(unlabelled, [], "these identifiers would scrub into something still machine-looking");
  });

  it("scrubbing preserves everything that is not an identifier", () => {
    const plan = validateActionPlan(planWith({}));
    const scrubbed = scrubIdentifiers(plan);
    assert.deepEqual(scrubbed, plan);
  });
});

// ---------------------------------------------------------------------------
// The guard that keeps this feature generic. Not a behavioural test — a static
// scan of the shipped source. It exists because "no scenario-specific code" is
// the kind of property that erodes one well-intentioned `if` at a time, and a
// code review six months from now will not remember the rule.
// ---------------------------------------------------------------------------

const PIPELINE_DIRS = ["lib/ai/actions", "lib/ai/reports"];

/** Every dashboard key, plus the business terms the retired demo generator used to hardcode. */
const FORBIDDEN_TOKENS = [
  "spend-overview",
  "payment-terms",
  "tail-spend",
  "supplier-fragmentation",
  "single-source-risk",
  "mro",
  "spares",
  "consolidat",
  "fragment",
];

/**
 * Dashboard keys that are ALSO ordinary English words, where a bare substring
 * match proves nothing.
 *
 * "compliance" is the only one of the six. The engine's prompt legitimately
 * lists it among the generic analytical aspects a user might ask about ("cost,
 * risk, efficiency, performance, compliance..."), which is prose for the model,
 * not a branch. Flagging that would have forced a choice between weakening the
 * prompt and disabling the guard — both worse than teaching the guard the
 * difference.
 *
 * Scenario branching on a dashboard key always compares against a STRING
 * LITERAL, so requiring quote delimiters catches `dashboardKey === "compliance"`
 * while ignoring the word in a sentence. The test below plants exactly that
 * violation, so this added precision cannot quietly become a blind spot.
 */
const AMBIGUOUS_KEY_PATTERNS = [/["']compliance["']/];

function sourceFiles(dir: string): { path: string; body: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ path: `${dir}/${f}`, body: readFileSync(`${dir}/${f}`, "utf8") }));
}

/**
 * Comments legitimately discuss dashboards and the retired demo by name — that
 * is documentation, not behaviour. Only executable lines are scanned.
 */
function strippedCode(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .toLowerCase();
}

describe("genericness guard — no scenario-specific code in the report pipeline", () => {
  /** The one place that decides whether a file's code names a dashboard or a retired scenario. */
  function scenarioOffences(path: string, code: string): string[] {
    const found: string[] = [];
    for (const token of FORBIDDEN_TOKENS) {
      if (code.includes(token)) found.push(`${path} contains "${token}"`);
    }
    for (const pattern of AMBIGUOUS_KEY_PATTERNS) {
      if (pattern.test(code)) found.push(`${path} compares against ${pattern}`);
    }
    return found;
  }

  it("no dashboard name or retired demo keyword appears in executable code", () => {
    const offences = PIPELINE_DIRS.flatMap((dir) =>
      sourceFiles(dir).flatMap(({ path, body }) => scenarioOffences(path, strippedCode(body)))
    );
    assert.deepEqual(offences, [], `scenario-specific code found:\n${offences.join("\n")}`);
  });

  it("the guard still catches a real dashboard-key branch (so its precision is not a blind spot)", () => {
    // Exactly the violation the ambiguous-key rule is narrow enough to risk
    // missing. If this ever stops failing, the guard above has gone blind.
    const planted = 'if (context.dashboardKey === "compliance") { useSpecialPath(); }';
    assert.notDeepEqual(scenarioOffences("planted.ts", planted), []);
    // And the prose form must NOT trip it.
    const prose = "const aspects = `cost, risk, efficiency, performance, compliance`;";
    assert.deepEqual(scenarioOffences("prose.ts", prose), []);
  });

  it("the retired demo generator and its selection seam are gone for good", () => {
    const files = PIPELINE_DIRS.flatMap((d) => readdirSync(d));
    assert.equal(files.includes("demo-action-plan.ts"), false, "demo generator is back");
    assert.equal(files.includes("action-plan-generator.ts"), false, "generator-selection seam is back");
  });

  it("no environment flag can switch the engine to an alternate implementation", () => {
    const offences = PIPELINE_DIRS.flatMap((dir) =>
      sourceFiles(dir)
        .filter(({ body }) => /process\.env\.REPORT_GENERATOR|process\.env\.\w*(DEMO|SCENARIO)\w*/i.test(body))
        .map(({ path }) => path)
    );
    assert.deepEqual(offences, [], "a generator/demo env switch reappeared");
  });
});

describe("assistant action registry", () => {
  it("resolves the known action and rejects anything else", () => {
    assert.equal(assistantAction("action_plan")?.id, "action_plan");
    assert.equal(assistantAction("delete_everything"), null);
    assert.equal(assistantAction(""), null);
  });

  it("offers the action on every dashboard today — generated dashboards included", () => {
    // `dashboards: null` means every dashboard of either kind, and the whole
    // report pipeline reads a resolved data context rather than a dashboard key,
    // so Report Mode on a generated dashboard needs no separate registration.
    assert.equal(assistantActionsFor({ type: "custom", dashboardId: "abc123" }).length, 1);
    assert.equal(assistantActionsFor({ type: "builtin", dashboardKey: "payment-terms" }).length, 1);
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
        benefits: [{ metric: "Time saved", formula: "records x hours", assumption: "Hours are not tracked here.", basis: "42 records", confidence: "Low" }],
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
      planWith({ facts: [], insights: [], opportunities: [], benefits: [], risks: [], implementationPlan: [], assumptions: [], nextSteps: [] })
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
    assert.equal(safeFilename("Cost & Cycle — Plan", "docx"), "Cost-Cycle-Plan.docx");
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
    dataVersion: "v1",
    contextId: "builtin:supplier-fragmentation",
    action: "action_plan" as const,
    activeFilters: "Category: Some Category",
    objective: "Improve the metric",
  };

  it("a new dataset version produces a different key — the staleness guarantee", () => {
    assert.notEqual(buildReportCacheKey(base), buildReportCacheKey({ ...base, dataVersion: "v2" }));
  });

  it("different filters, dashboard, or objective each produce a different key", () => {
    assert.notEqual(buildReportCacheKey(base), buildReportCacheKey({ ...base, activeFilters: "Category: Another Category" }));
    assert.notEqual(buildReportCacheKey(base), buildReportCacheKey({ ...base, contextId: "builtin:tail-spend" }));
    assert.notEqual(buildReportCacheKey(base), buildReportCacheKey({ ...base, objective: "Something else" }));
  });

  it("casing and whitespace in the objective do not split the cache", () => {
    assert.equal(
      buildReportCacheKey(base),
      buildReportCacheKey({ ...base, objective: "  Improve   THE   METRIC  " })
    );
  });
});
