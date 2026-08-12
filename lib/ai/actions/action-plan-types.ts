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

export interface ReportRecommendation {
  action: string;
  priority: Priority;
  reason: string;
  expectedImpact: string;
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
  /** e.g. "Addressable spend x assumed savings rate". Required — a benefit with no stated derivation is a fabricated number. */
  formula: string;
  /** e.g. "5% savings rate is an illustrative scenario requiring business validation." Required for the same reason. */
  assumption: string;
  /** Omit when the data genuinely can't support a figure. */
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
  owner: string;
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
  recommendations: ReportRecommendation[];
  benefits: ReportBenefit[];
  risks: ReportRisk[];
  implementationPlan: ReportPhase[];
  /** Standalone list of every condition the estimates rest on. Never merged into insights or facts. */
  assumptions: string[];
  nextSteps: string[];
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
  /** Which generator answered — "demo" (predefined content) or "dynamic" (Claude + live queries). Surfaced so a demo report is never mistaken for a live one. */
  generator: "demo" | "dynamic";
  /** True when served from the report cache rather than regenerated. */
  cached: boolean;
}

export interface AssistantActionFailure {
  success: false;
  error: string;
}

export type AssistantActionResponse = AssistantActionSuccess | AssistantActionFailure;
