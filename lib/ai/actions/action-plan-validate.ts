// Runtime validation for an ActionPlanResult, applied to EVERY generator's
// output before a single byte of .docx or .xlsx is produced.
//
// WHY THIS EXISTS EVEN THOUGH THE CLAUDE TOOL IS `strict: true`: strict mode
// constrains the JSON shape Claude emits, not its content, and it does not
// constrain a hand-written generator at all. This module is where "do not
// trust Claude output blindly" (§19) is actually enforced — and it runs on
// the demo generator too, so the demo can never drift into a shape the
// renderers can't handle.
//
// IT REJECTS RATHER THAN REPAIRS, with one deliberate exception: over-long
// strings and over-long arrays are TRUNCATED, because a model returning 40
// recommendations is verbose, not wrong, and failing the user's report over
// it would be worse than clipping it. Anything structurally wrong — a missing
// title, a benefit with a value but no formula, an unknown priority — is a
// hard failure. Silently repairing those would mean shipping a document whose
// numbers nobody can trace, which is the exact failure mode this whole
// fact/insight/assumption separation exists to prevent.

import "server-only";

import type {
  ActionPlanResult,
  Priority,
  ReportBenefit,
  ReportFact,
  ReportInsight,
  ReportPhase,
  ReportRecommendation,
  ReportRisk,
} from "@/lib/ai/actions/action-plan-types";

// Bounds are generous — they exist to keep a runaway generation from producing
// a 300-page document or a cache entry that eats the process, not to shape
// what a legitimate report can say.
const MAX_TEXT = 2_000;
const MAX_SUMMARY = 6_000;
const MAX_ITEMS = 25;
const MAX_ASSUMPTIONS = 30;

const PRIORITIES: Priority[] = ["High", "Medium", "Low"];

export class ActionPlanValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Action plan failed validation: ${issues.join("; ")}`);
    this.name = "ActionPlanValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Required non-empty string, truncated to `max`. Pushes an issue and returns "" when absent. */
function requireText(
  value: unknown,
  path: string,
  issues: string[],
  max = MAX_TEXT
): string {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${path} must be a non-empty string`);
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Optional string — absent/blank is legitimate (see ReportBenefit.value), so it never produces an issue. */
function optionalText(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * Empty arrays are allowed for every section: a genuinely thin dashboard
 * should produce a short report, not a padded one. The renderers print an
 * explicit "None identified" for an empty section rather than omitting it, so
 * an empty array reads as a finding instead of looking like a bug.
 */
function mapItems<T>(
  value: unknown,
  path: string,
  issues: string[],
  parse: (item: Record<string, unknown>, itemPath: string, issues: string[]) => T,
  max = MAX_ITEMS
): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
    return [];
  }
  return value.slice(0, max).flatMap((entry, i) => {
    if (!isRecord(entry)) {
      issues.push(`${path}[${i}] must be an object`);
      return [];
    }
    return [parse(entry, `${path}[${i}]`, issues)];
  });
}

function parseFact(item: Record<string, unknown>, path: string, issues: string[]): ReportFact {
  return {
    label: requireText(item.label, `${path}.label`, issues),
    value: requireText(item.value, `${path}.value`, issues),
    source: requireText(item.source, `${path}.source`, issues),
  };
}

function parseInsight(item: Record<string, unknown>, path: string, issues: string[]): ReportInsight {
  return {
    insight: requireText(item.insight, `${path}.insight`, issues),
    basedOn: requireText(item.basedOn, `${path}.basedOn`, issues),
  };
}

function parseRecommendation(item: Record<string, unknown>, path: string, issues: string[]): ReportRecommendation {
  const priority = PRIORITIES.find((p) => p === item.priority);
  if (!priority) issues.push(`${path}.priority must be one of ${PRIORITIES.join(", ")}`);
  return {
    action: requireText(item.action, `${path}.action`, issues),
    priority: priority ?? "Medium",
    reason: requireText(item.reason, `${path}.reason`, issues),
    expectedImpact: requireText(item.expectedImpact, `${path}.expectedImpact`, issues),
  };
}

/**
 * The core anti-fabrication rule, enforced structurally rather than by asking
 * the model nicely: `formula` and `assumption` are mandatory on every benefit,
 * quantified or not. A generator that wants to print "₹50 Lakh" must also
 * print the arithmetic and the condition it rests on, or the report doesn't
 * render at all.
 */
function parseBenefit(item: Record<string, unknown>, path: string, issues: string[]): ReportBenefit {
  return {
    metric: requireText(item.metric, `${path}.metric`, issues),
    formula: requireText(item.formula, `${path}.formula`, issues),
    assumption: requireText(item.assumption, `${path}.assumption`, issues),
    value: optionalText(item.value),
  };
}

function parseRisk(item: Record<string, unknown>, path: string, issues: string[]): ReportRisk {
  return {
    risk: requireText(item.risk, `${path}.risk`, issues),
    mitigation: requireText(item.mitigation, `${path}.mitigation`, issues),
  };
}

function parsePhase(item: Record<string, unknown>, path: string, issues: string[]): ReportPhase {
  return {
    phase: requireText(item.phase, `${path}.phase`, issues),
    action: requireText(item.action, `${path}.action`, issues),
    timeline: requireText(item.timeline, `${path}.timeline`, issues),
    owner: requireText(item.owner, `${path}.owner`, issues),
  };
}

function parseStringList(value: unknown, path: string, issues: string[], max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array of strings`);
    return [];
  }
  return value
    .slice(0, max)
    .map((entry) => optionalText(entry))
    .filter((entry): entry is string => entry !== undefined);
}

/**
 * Throws ActionPlanValidationError on anything structurally wrong. The route
 * turns that into a 422 with the issue list — a real diagnostic, not a
 * generic "something went wrong", because the most likely cause is a
 * generator bug worth seeing during the demo.
 */
export function validateActionPlan(raw: unknown): ActionPlanResult {
  const issues: string[] = [];
  if (!isRecord(raw)) {
    throw new ActionPlanValidationError(["report must be an object"]);
  }

  const plan: ActionPlanResult = {
    title: requireText(raw.title, "title", issues, 300),
    objective: requireText(raw.objective, "objective", issues),
    insightSummary: requireText(raw.insightSummary, "insightSummary", issues, MAX_SUMMARY),
    scope: requireText(raw.scope, "scope", issues),
    facts: mapItems(raw.facts, "facts", issues, parseFact),
    insights: mapItems(raw.insights, "insights", issues, parseInsight),
    recommendations: mapItems(raw.recommendations, "recommendations", issues, parseRecommendation),
    benefits: mapItems(raw.benefits, "benefits", issues, parseBenefit),
    risks: mapItems(raw.risks, "risks", issues, parseRisk),
    implementationPlan: mapItems(raw.implementationPlan, "implementationPlan", issues, parsePhase),
    assumptions: parseStringList(raw.assumptions, "assumptions", issues, MAX_ASSUMPTIONS),
    nextSteps: parseStringList(raw.nextSteps, "nextSteps", issues, MAX_ITEMS),
  };

  // A plan with nothing actionable in it isn't a report — better to fail loudly
  // than to hand someone an empty Word document with a nice cover page.
  if (plan.recommendations.length === 0) {
    issues.push("recommendations must contain at least one entry");
  }

  // Quantified benefits carry the highest fabrication risk, so they get the
  // one cross-field check in this module: a stated value with no assumption
  // behind it is exactly the "You will save ₹50 Lakh" failure the spec bans.
  plan.benefits.forEach((benefit, i) => {
    if (benefit.value && !benefit.assumption) {
      issues.push(`benefits[${i}] states a value without an assumption`);
    }
  });

  if (issues.length > 0) throw new ActionPlanValidationError(issues);
  return plan;
}
