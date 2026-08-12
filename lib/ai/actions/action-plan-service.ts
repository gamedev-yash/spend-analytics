// The action-plan service: everything that happens between "the user clicked
// the button" and "here is a report plus two download links", minus the HTTP
// layer (app/api/assistant-actions/route.ts) and minus the content itself
// (the generators).
//
// It owns exactly five things, in this order:
//   1. assemble the ActionPlanContext from existing services — never new ones
//   2. cache lookup
//   3. generator selection + execution
//   4. VALIDATION — one gate, every generator, before any file exists
//   5. render both artifacts from the ONE validated object, and cache
//
// WHY THE ORDER MATTERS: validation sits between generation and rendering, so
// no generator — demo, Claude, or whatever replaces them — can put an
// unvalidated figure into a document a user downloads. And both renderers are
// called with the same `plan` variable, which is what makes §14's
// single-source-of-truth guarantee mechanical rather than a convention
// someone has to remember.
//
// WHAT IT REUSES RATHER THAN REBUILDS (§24): dashboardMeta for identity,
// getConversationContext + buildConversationMemoryBlock for context (the
// SAME memory normal chat uses, not a second store), getDatasetVersion for
// cache correctness. The only thing this feature adds to the shared layer is
// the report cache and the artifact store.
//
// PARTIAL-FAILURE POLICY: a renderer that throws does not fail the request.
// The on-screen report is the primary deliverable and it is already valid by
// this point; losing one file format is a degraded result, not a failed one,
// so the artifact descriptor carries an `error` and the other format plus the
// summary still reach the user.

import "server-only";

import {
  selectGenerator,
  type ActionPlanContext,
  type ActionPlanGenerator,
} from "@/lib/ai/actions/action-plan-generator";
import { validateActionPlan } from "@/lib/ai/actions/action-plan-validate";
import { claudeActionPlanGenerator } from "@/lib/ai/actions/claude-action-plan";
import { demoActionPlanGenerator } from "@/lib/ai/actions/demo-action-plan";
import type {
  ActionPlanResult,
  ArtifactDescriptor,
  AssistantActionId,
  AssistantActionSuccess,
} from "@/lib/ai/actions/action-plan-types";
import { dashboardMeta, type DashboardKey } from "@/lib/ai/dashboard-registry";
import { buildConversationMemoryBlock, getConversationContext } from "@/lib/ai/conversation-context";
import { putArtifact, safeFilename } from "@/lib/ai/reports/artifact-store";
import { buildReportCacheKey, getCachedReport, setCachedReport } from "@/lib/ai/reports/report-cache";
import { renderActionPlanExcel } from "@/lib/ai/reports/report-excel";
import { renderActionPlanWord } from "@/lib/ai/reports/report-word";
import { getDatasetVersion } from "@/lib/server/sample-data-source";

/**
 * Ordering IS the demo/production switch. Demo first means it answers the one
 * scenario it recognizes and everything else falls through to Claude. Setting
 * REPORT_GENERATOR=dynamic (handled in selectGenerator) drops the demo
 * generator from consideration entirely — no code change, no API change, no
 * frontend change. Deleting lib/ai/actions/demo-action-plan.ts and its entry
 * below is the permanent version of the same switch.
 */
const GENERATORS: ActionPlanGenerator[] = [demoActionPlanGenerator, claudeActionPlanGenerator];

export const ARTIFACT_URL_PREFIX = "/api/assistant-actions/artifacts";

export interface RunActionPlanInput {
  action: AssistantActionId;
  dashboardKey: DashboardKey;
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
  const meta = dashboardMeta(input.dashboardKey);
  // The existing structured memory, not the raw transcript — compact by
  // construction (it holds the last query's shape and its top results), which
  // is exactly the "relevant context, not the whole history" §10 asks for.
  // Absent conversationId simply means no memory, the same as a fresh chat.
  const conversationMemory = input.conversationId
    ? buildConversationMemoryBlock(getConversationContext(input.conversationId), input.dashboardKey)
    : null;

  return {
    dashboardKey: input.dashboardKey,
    dashboardLabel: meta.label,
    dashboardDescription: meta.description,
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

export async function runActionPlan(input: RunActionPlanInput): Promise<AssistantActionSuccess> {
  const context = buildContext(input);

  const cacheKey = buildReportCacheKey({
    datasetVersion: getDatasetVersion(),
    dashboardKey: input.dashboardKey,
    action: input.action,
    activeFilters: input.activeFilters,
    objective: input.objective,
  });

  const cached = getCachedReport(cacheKey);
  if (cached) {
    return {
      success: true,
      type: "action_plan",
      report: cached.plan,
      artifacts: {
        word: descriptorFor(cached.wordArtifactId, "word", cached.plan),
        excel: descriptorFor(cached.excelArtifactId, "excel", cached.plan),
      },
      generator: cached.generator,
      cached: true,
    };
  }

  const generator = selectGenerator(context, GENERATORS);
  if (!generator) {
    throw new ActionPlanServiceError("No report generator is available for this dashboard.", 503);
  }

  let raw: unknown;
  try {
    raw = await generator.generate(context);
  } catch (err) {
    // The Claude generator signals a missing API key with this sentinel so the
    // service can map it to the same 503 the chat endpoint uses, rather than
    // leaking a stack trace or an upstream message.
    if (err instanceof Error && err.message === "NO_CLIENT") {
      throw new ActionPlanServiceError(
        "Report generation needs an API key and a model configured in the server environment.",
        503
      );
    }
    console.error("[action-plan] generation failed:", err);
    throw new ActionPlanServiceError(
      err instanceof Error && err.name === "ActionPlanGenerationError"
        ? err.message
        : "The report could not be generated. Please try again.",
      502
    );
  }

  // THE ONE VALIDATION GATE. Runs on demo output and Claude output alike —
  // nothing reaches a renderer without passing through here.
  let plan: ActionPlanResult;
  try {
    plan = validateActionPlan(raw);
  } catch (err) {
    const issues = err instanceof Error && "issues" in err ? (err as { issues: string[] }).issues : undefined;
    console.error("[action-plan] validation failed:", issues ?? err);
    throw new ActionPlanServiceError("The generated report was not in a usable form. Please try again.", 422, issues);
  }

  // ONE `plan`, TWO RENDERERS — the §14 guarantee, in one expression.
  // Concurrent because they are independent pure projections of the same
  // object; neither can observe the other's output.
  const [word, excel] = await Promise.all([
    renderArtifact("word", plan, () => renderActionPlanWord(plan)),
    renderArtifact("excel", plan, () => renderActionPlanExcel(plan)),
  ]);

  setCachedReport(cacheKey, {
    plan,
    generator: generator.kind,
    wordArtifactId: word.artifactId,
    excelArtifactId: excel.artifactId,
  });

  return {
    success: true,
    type: "action_plan",
    report: plan,
    artifacts: { word: word.descriptor, excel: excel.descriptor },
    generator: generator.kind,
    cached: false,
  };
}
