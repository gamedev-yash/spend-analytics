// The single source of truth for an action-plan report.
//
// ONE OBJECT, TWO RENDERERS: lib/ai/reports/report-word.ts and
// lib/ai/reports/report-excel.ts both consume exactly this — neither derives,
// reformats, or supplements business content of its own. That is what
// guarantees the .docx and the .xlsx a user downloads can never disagree with
// each other or with the summary rendered in the chat panel.
//
// NO `server-only` HERE ON PURPOSE: the assistant panel renders the report
// summary client-side, so it needs these types. They are types and enums
// only — no data, no rendering, no Claude, no filesystem — the same rule
// lib/ai/dashboard-registry.ts already follows for being importable from a
// "use client" component.
//
// THE FACT / INSIGHT / RECOMMENDATION / ASSUMPTION SEPARATION IS STRUCTURAL,
// NOT STYLISTIC. They are four distinct arrays rather than one prose blob
// precisely so an assumption can never quietly render as a fact: `facts[]`
// carries a `source` naming the query that produced it, `benefits[]` cannot
// state a value without also stating the formula and assumption that got
// there, and the renderers label each section by its own kind. A generator
// that wants to claim a number has to put it somewhere that forces it to say
// where the number came from.

/** Which assistant action produced this — see lib/ai/actions/assistant-actions.ts. */
export type AssistantActionId = "action_plan";

export type Priority = "High" | "Medium" | "Low";

/**
 * How confident the engine is in a quantified benefit. Required on every one, so
 * a number can never appear without a stated reliability alongside its formula
 * and assumption — the difference between "computed from a complete count" and
 * "scaled by an industry rule of thumb" is exactly what a reader needs and what
 * a bare figure hides.
 */
export type Confidence = "High" | "Medium" | "Low";

/**
 * Why a Report-Mode turn produced no report.
 *
 * Report Mode ON is the user's signal that they WANT analysis; it is not a
 * promise that whatever they typed next is an analytical objective. Without
 * these outcomes the engine had one legal move — emit a plan — which meant a
 * factual question, a navigation request, or three ambiguous words all forced it
 * to invent an objective and a strategy to match. That is the single largest
 * hallucination risk this feature had, and it is a modelling problem, not a
 * prompting one: the fix is giving the engine somewhere honest to go.
 *
 * - `factual`   the request wants a specific figure, not a strategy
 * - `navigation` the request is about moving around the app
 * - `clarification` a real analytical intent, too vague to act on yet
 * - `unsupported`  a genuine objective this dashboard's data cannot serve
 */
export type NoReportKind = "factual" | "navigation" | "clarification" | "unsupported";

/**
 * A value actually read off a dashboard query result. `source` is a
 * plain-language note on which query produced it ("Count of distinct
 * suppliers in MRO & Spares"), never an internal table/column name — the same
 * "no internal implementation detail reaches the user" rule the chat system
 * prompt enforces applies to every string in this file, since all of it is
 * rendered into documents a business user reads.
 */
export interface ReportFact {
  label: string;
  value: string;
  source: string;
}

/** A derived observation. Never a number the data didn't produce — cite it via `basedOn`. */
export interface ReportInsight {
  insight: string;
  /** Which fact(s) this reading rests on, in plain language. */
  basedOn: string;
}

/**
 * Something worth pursuing that is not yet a recommendation and not yet a
 * quantified benefit.
 *
 * Its real job is relieving pressure to fabricate. Without a home for "there is
 * clearly something here, and the data cannot size it", the engine had to either
 * drop the finding or promote it to a benefit — and a benefit wants a number.
 * This lets an opportunity be stated honestly at whatever precision the data
 * actually supports.
 */
export interface ReportOpportunity {
  opportunity: string;
  /** Which fact(s) or insight(s) point at it, in plain language. */
  basedOn: string;
  /** Set only when the data supports sizing it. Absent is a normal, honest outcome. */
  scale?: string;
}

export interface ReportRecommendation {
  action: string;
  priority: Priority;
  reason: string;
  expectedImpact: string;
  /** The specific finding this rests on — traceability, so a reader can audit any recommendation back to a measured figure. */
  evidence: string;
  /** What must be true or done first. Absent when the action stands alone. */
  dependencies?: string;
}

/**
 * A quantified benefit is only ever allowed to appear WITH the arithmetic and
 * the assumption behind it. `value` is optional by design: when the dashboard
 * can't support a number, a generator states the opportunity and leaves
 * `value` unset rather than inventing one — the renderers print
 * "Not quantifiable from available dashboard data" in that case.
 */
export interface ReportBenefit {
  metric: string;
  /** e.g. "Addressable spend x assumed improvement rate". Required — a benefit with no stated derivation is a fabricated number. */
  formula: string;
  /** e.g. "A 3-5% improvement scenario, requiring business validation." Required for the same reason. */
  assumption: string;
  /** Which measured figure the formula starts from. Required: it is the difference between an estimate anchored in data and one anchored in nothing. */
  basis: string;
  /** Required even when `value` is absent — an unquantified benefit still has a knowable strength of evidence. */
  confidence: Confidence;
  /** Omit when the data genuinely can't support a figure. A range ("₹40-70 L") is preferred over a false point estimate. */
  value?: string;
}

export interface ReportRisk {
  risk: string;
  mitigation: string;
}

export interface ReportPhase {
  phase: string;
  action: string;
  timeline: string;
  /** A role, never an invented personal name. */
  owner: string;
  /** How this phase is judged done. Optional, but a phase without one is a wish rather than a plan. */
  successMetric?: string;
}

export interface ActionPlanResult {
  title: string;
  objective: string;
  /** Executive-summary paragraph. Prose, but grounded — no figure here that isn't also in `facts`. */
  insightSummary: string;
  /** Plain-language note on what the report was scoped to (dashboard + filters), so a downloaded file is self-describing months later. */
  scope: string;
  facts: ReportFact[];
  insights: ReportInsight[];
  /** Between insight and action — see ReportOpportunity on why this exists separately. */
  opportunities: ReportOpportunity[];
  recommendations: ReportRecommendation[];
  benefits: ReportBenefit[];
  risks: ReportRisk[];
  implementationPlan: ReportPhase[];
  /** Standalone list of every condition the estimates rest on. Never merged into insights or facts. */
  assumptions: string[];
  nextSteps: string[];
  /**
   * What the objective needed but this dashboard could not supply.
   *
   * Exists because the engine is generic: a user can ask anything on any
   * dashboard, so "the data to answer this isn't here" is a NORMAL outcome, not
   * an error — and the honest response is to name the gap rather than pad the
   * report around it. Without somewhere to put this, an objective that reaches
   * past the dashboard's tables pressures the model into inventing coverage.
   *
   * Empty is the common, healthy case: the objective was fully answerable.
   */
  dataGaps: string[];
}

// ---------------------------------------------------------------------------
// API contract — POST /api/assistant-actions
// ---------------------------------------------------------------------------

export interface AssistantActionRequest {
  action: AssistantActionId;
  dashboardKey: string;
  /**
   * What the user actually wants out of the report. The UI fills this from the
   * last user message so nobody has to retype the question they just asked.
   */
  objective: string;
  /**
   * The same free-text filter summary the chat endpoint already receives
   * (context/DashboardActiveFiltersContext.tsx). Deliberately not a structured
   * filter object: this app publishes a prose summary and nothing else, and
   * inventing a parallel structured contract here would be a second filter
   * architecture for one feature to use.
   */
  activeFilters?: string;
  /** Reuses the existing conversation memory store — never a second memory system. */
  conversationId?: string;
}

export interface ArtifactDescriptor {
  available: boolean;
  /** Opaque, server-issued: /api/assistant-actions/artifacts/<uuid>. Never a filesystem path. */
  downloadUrl?: string;
  filename?: string;
  /** Set instead of downloadUrl when rendering that one format failed — the other format and the on-screen report still stand. */
  error?: string;
}

export interface AssistantActionSuccess {
  success: true;
  type: "action_plan";
  report: ActionPlanResult;
  artifacts: {
    word: ArtifactDescriptor;
    excel: ArtifactDescriptor;
  };
  /**
   * True when served from the report cache rather than regenerated. There is no
   * companion "which generator answered" field: there is exactly one engine, so
   * every report is produced the same way and nothing downstream branches on
   * its origin.
   */
  cached: boolean;
}

/**
 * A Report-Mode turn that correctly decided NOT to produce a report.
 *
 * `success: true` on purpose — this is the system working, not failing. Modelling
 * it as an error would push the frontend into showing a red box for the entirely
 * reasonable act of asking "what would you like me to analyse?".
 */
export interface AssistantActionNoReport {
  success: true;
  type: "no_report";
  kind: NoReportKind;
  /** What to show the user — a clarifying question, or an explanation of the limitation. */
  message: string;
  /**
   * Clickable choices for `kind: "clarification"`, derived from what the current
   * dashboard can actually analyse. Rendered through the assistant's existing
   * option-chip mechanism rather than a new one.
   */
  options?: string[];
}

export interface AssistantActionFailure {
  success: false;
  error: string;
}

export type AssistantActionResponse =
  | AssistantActionSuccess
  | AssistantActionNoReport
  | AssistantActionFailure;
