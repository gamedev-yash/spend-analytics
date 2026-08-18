// The action-plan service: everything that happens between "the user clicked
// the button" and "here is a report plus two download links", minus the HTTP
// layer (app/api/assistant-actions/route.ts) and minus the content itself
// (the generators).
//
// It owns exactly four things, in this order:
//   1. assemble the ActionPlanContext from existing services — never new ones
//   2. cache lookup
//   3. run the engine, then VALIDATE — one gate, before any file exists
//   4. render both artifacts from the ONE validated object, and cache
//
// WHY THE ORDER MATTERS: validation sits between generation and rendering, so
// nothing the engine produces can put an unvalidated figure into a document a
// user downloads. And both renderers are called with the same `plan` variable,
// which is what makes the single-source-of-truth guarantee mechanical rather
// than a convention someone has to remember.
//
// NOTHING HERE IS DASHBOARD- OR SCENARIO-AWARE. It never inspects the objective
// and never branches on which dashboard it was handed; it passes both through to
// modules that already resolved what a dashboard is. Grep this directory for a
// dashboard name and you will find none.
//
// WHAT IT REUSES RATHER THAN REBUILDS (§24): the caller's already-resolved
// DashboardDataContext for identity, label, scope, tables and data version;
// getConversationContext + buildConversationMemoryBlock for context (the SAME
// memory normal chat uses, not a second store). The only thing this feature adds
// to the shared layer is the report cache and the artifact store.
//
// IT IS ALSO BLIND TO DASHBOARD KIND. A generated dashboard and a built-in one
// arrive here as the same resolved object, so Report Mode, both renderers, the
// cache and the artifact plumbing needed no branch to support generated
// dashboards — only the resolution step upstream changed.
//
// PARTIAL-FAILURE POLICY: a renderer that throws does not fail the request.
// The on-screen report is the primary deliverable and it is already valid by
// this point; losing one file format is a degraded result, not a failed one,
// so the artifact descriptor carries an `error` and the other format plus the
// summary still reach the user.

import "server-only";

import { generateActionPlan, type ActionPlanContext } from "@/lib/ai/actions/action-plan-engine";
import { validateActionPlan } from "@/lib/ai/actions/action-plan-validate";
import type {
  ActionPlanResult,
  ArtifactDescriptor,
  AssistantActionId,
  AssistantActionNoReport,
  AssistantActionSuccess,
} from "@/lib/ai/actions/action-plan-types";
import type { DashboardDataContext } from "@/lib/ai/dashboard-data-context";
import { buildConversationMemoryBlock, getConversationContext } from "@/lib/ai/conversation-context";
import { putArtifact, safeFilename } from "@/lib/ai/reports/artifact-store";
import { buildReportCacheKey, getCachedReport, setCachedReport } from "@/lib/ai/reports/report-cache";
import { renderActionPlanExcel } from "@/lib/ai/reports/report-excel";
import { renderActionPlanWord } from "@/lib/ai/reports/report-word";

export const ARTIFACT_URL_PREFIX = "/api/assistant-actions/artifacts";

export interface RunActionPlanInput {
  action: AssistantActionId;
  /** Resolved by the route before this is called — so a dashboard that cannot be loaded fails there, not half-way through a three-minute workflow. */
  dataContext: DashboardDataContext;
  objective: string;
  activeFilters: string | null;
  conversationId: string | null;
}

/** Everything that can go wrong in a way the user should see a specific message for. */
export class ActionPlanServiceError extends Error {
  readonly status: number;
  readonly issues?: string[];
  constructor(message: string, status: number, issues?: string[]) {
    super(message);
    this.name = "ActionPlanServiceError";
    this.status = status;
    this.issues = issues;
  }
}

function buildContext(input: RunActionPlanInput): ActionPlanContext {
  // The existing structured memory, not the raw transcript — compact by
  // construction (it holds the last query's shape and its top results), which
  // is exactly the "relevant context, not the whole history" §10 asks for.
  // Read under the SAME context id chat writes it under, so a report picks up
  // what the conversation just established on THIS dashboard and nothing from
  // any other.
  // Absent conversationId simply means no memory, the same as a fresh chat.
  const conversationMemory = input.conversationId
    ? buildConversationMemoryBlock(getConversationContext(input.conversationId), input.dataContext.contextId)
    : null;

  return {
    dataContext: input.dataContext,
    objective: input.objective,
    activeFilters: input.activeFilters,
    conversationMemory,
  };
}

/** Renders one format, converting a throw into a descriptor the client can render honestly. */
async function renderArtifact(
  format: "word" | "excel",
  plan: ActionPlanResult,
  render: () => Promise<Uint8Array>
): Promise<{ descriptor: ArtifactDescriptor; artifactId: string | null }> {
  try {
    const bytes = await render();
    const filename = safeFilename(plan.title, format === "word" ? "docx" : "xlsx");
    const artifact = putArtifact(format, filename, bytes);
    return {
      descriptor: {
        available: true,
        downloadUrl: `${ARTIFACT_URL_PREFIX}/${artifact.id}`,
        filename: artifact.filename,
      },
      artifactId: artifact.id,
    };
  } catch (err) {
    console.error(`[action-plan] ${format} rendering failed:`, err);
    return {
      descriptor: { available: false, error: `The ${format === "word" ? "Word" : "Excel"} file could not be generated.` },
      artifactId: null,
    };
  }
}

function descriptorFor(artifactId: string | null, format: "word" | "excel", plan: ActionPlanResult): ArtifactDescriptor {
  if (!artifactId) {
    return { available: false, error: `The ${format === "word" ? "Word" : "Excel"} file could not be generated.` };
  }
  return {
    available: true,
    downloadUrl: `${ARTIFACT_URL_PREFIX}/${artifactId}`,
    filename: safeFilename(plan.title, format === "word" ? "docx" : "xlsx"),
  };
}

/**
 * A report, or a reasoned decision not to produce one. Both are successful
 * outcomes of a Report-Mode turn — see NoReportKind for why that matters.
 */
export type RunActionPlanResult = AssistantActionSuccess | AssistantActionNoReport;

// Dev-only, same rule as the engine's DEBUG_ENGINE and the chat route's
// DEBUG_TIMING: counts and durations only, never a figure from the report and
// never the user's objective text.
//
// WHY A START LINE AND NOT JUST THE END: the engine logged only on emit, which
// made "how long did that run take, and did the client actually get it?"
// unanswerable from the log — the gap before an emit could equally be a slow run
// or an idle server. One line at entry and one at exit turns that into a fact.
const DEBUG_SERVICE = process.env.NODE_ENV !== "production";

function debugService(message: string): void {
  if (DEBUG_SERVICE) console.debug(`[action-plan] ${message}`);
}

export async function runActionPlan(input: RunActionPlanInput): Promise<RunActionPlanResult> {
  const startedAt = performance.now();
  const elapsed = () => `${Math.round(performance.now() - startedAt)}ms`;
  debugService(`start dashboard=${input.dataContext.contextId} action=${input.action} objectiveChars=${input.objective.length}`);
  const context = buildContext(input);

  const cacheKey = buildReportCacheKey({
    dataVersion: input.dataContext.dataVersion,
    contextId: input.dataContext.contextId,
    action: input.action,
    activeFilters: input.activeFilters,
    objective: input.objective,
  });

  const cached = getCachedReport(cacheKey);
  if (cached) {
    debugService(`done dashboard=${input.dataContext.contextId} outcome=cached in ${elapsed()}`);
    return {
      success: true,
      type: "action_plan",
      report: cached.plan,
      artifacts: {
        word: descriptorFor(cached.wordArtifactId, "word", cached.plan),
        excel: descriptorFor(cached.excelArtifactId, "excel", cached.plan),
      },
      cached: true,
    };
  }

  let raw: unknown;
  try {
    // One engine, called directly. No selection step, so no configuration and
    // no input can route this to anything other than a live analysis of this
    // dashboard's own data.
    const outcome = await generateActionPlan(context);

    // Triage said this request should not become a report. Returned straight
    // through: nothing is validated, no document is rendered, and NOTHING IS
    // CACHED — a clarifying question is about this turn's wording, not a
    // reusable artifact of dashboard+filters+objective, so caching it would
    // make the assistant repeat a question the user has already answered.
    if (outcome.kind === "no_report") {
      debugService(`done dashboard=${input.dataContext.contextId} outcome=no_report:${outcome.reason} in ${elapsed()}`);
      return {
        success: true,
        type: "no_report",
        kind: outcome.reason,
        message: outcome.message,
        ...(outcome.options ? { options: outcome.options } : {}),
      };
    }
    raw = outcome.plan;
  } catch (err) {
    // The engine signals a missing API key with this sentinel so the service
    // can map it to the same 503 the chat endpoint uses, rather than leaking a
    // stack trace or an upstream message.
    if (err instanceof Error && err.message === "NO_CLIENT") {
      throw new ActionPlanServiceError(
        "Report generation needs an API key and a model configured in the server environment.",
        503
      );
    }
    debugService(`done dashboard=${input.dataContext.contextId} outcome=generation_failed in ${elapsed()}`);
    console.error("[action-plan] generation failed:", err);
    throw new ActionPlanServiceError(
      err instanceof Error && err.name === "ActionPlanGenerationError"
        ? err.message
        : "The report could not be generated. Please try again.",
      502
    );
  }

  // THE ONE VALIDATION GATE. Nothing reaches a renderer without passing through
  // here — and because the engine returns its tool input raw, this is the only
  // place that decides whether a plan is fit to become a document.
  let plan: ActionPlanResult;
  try {
    plan = validateActionPlan(raw);
  } catch (err) {
    const issues = err instanceof Error && "issues" in err ? (err as { issues: string[] }).issues : undefined;
    console.error("[action-plan] validation failed:", issues ?? err);
    throw new ActionPlanServiceError("The generated report was not in a usable form. Please try again.", 422, issues);
  }

  // ONE `plan`, TWO RENDERERS — the single-source-of-truth guarantee, in one
  // expression. Concurrent because they are independent pure projections of the
  // same object; neither can observe the other's output.
  const [word, excel] = await Promise.all([
    renderArtifact("word", plan, () => renderActionPlanWord(plan)),
    renderArtifact("excel", plan, () => renderActionPlanExcel(plan)),
  ]);

  setCachedReport(cacheKey, {
    plan,
    wordArtifactId: word.artifactId,
    excelArtifactId: excel.artifactId,
  });

  // The last thing the server does. If this line is present and the user still
  // saw a failure, the report was produced and something between here and the
  // panel dropped it — which is a completely different investigation from a
  // report that never got built, and previously indistinguishable in the log.
  debugService(
    `done dashboard=${input.dataContext.contextId} outcome=report facts=${plan.facts.length} word=${word.artifactId !== null} excel=${excel.artifactId !== null} in ${elapsed()}`
  );

  return {
    success: true,
    type: "action_plan",
    report: plan,
    artifacts: { word: word.descriptor, excel: excel.descriptor },
    cached: false,
  };
}
