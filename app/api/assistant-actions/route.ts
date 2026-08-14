// POST /api/assistant-actions — run an explicitly user-triggered assistant
// action (today: "Generate Action Plan & Report").
//
// WHY THIS IS A SEPARATE ENDPOINT FROM /api/dashboard-chat, AND WHY THAT IS
// NOT A SECOND CHAT: a normal chat turn must stay fast, and the only way to
// guarantee an expensive workflow never runs during one is for the expensive
// workflow to be unreachable from it. The chat route's tool array does not
// contain generate_action_plan and never will — Claude cannot decide to
// produce a report mid-conversation. A human clicks, and only then does this
// route exist in the picture (§2, §17).
//
// It duplicates NO dashboard, context, query, or memory logic (§24). Every
// one of those comes from the same shared modules the chat route uses; this
// file is request validation, dispatch, and error mapping.
//
// Responses mirror /api/v1/*'s { success, ... } shape rather than the chat
// route's flatter one, because this endpoint returns a typed artifact-bearing
// payload rather than a reply string.
//   200 { success: true, type, report, artifacts, generator, cached }
//   400 { success: false, error }   unknown action / dashboard / missing objective
//   409 { success: false, error, needsDashboardSync } a generated dashboard's
//                                   snapshot isn't loaded on this server yet —
//                                   the client re-registers it and retries
//   422 { success: false, error }   the generated plan failed validation
//   502 { success: false, error }   the model or the workflow failed
//   503 { success: false, error }   no API key / model configured
//
// Report Mode works on a generated dashboard through this same route, with the
// same engine and the same two renderers: the dashboard is resolved to a
// DashboardDataContext here, exactly as in the chat route, and nothing below
// this line knows or cares which kind it got.

import { runActionPlan, ActionPlanServiceError } from "@/lib/ai/actions/action-plan-service";
import { assistantAction, assistantActionsFor, ASSISTANT_ACTIONS } from "@/lib/ai/actions/assistant-actions";
import type { AssistantActionFailure, AssistantActionId } from "@/lib/ai/actions/action-plan-types";
import { parseDashboardContext, type DashboardContext } from "@/lib/ai/dashboard-context";
import { resolveDashboardDataContext } from "@/lib/ai/dashboard-data-context";
import { DASHBOARD_REGISTRY } from "@/lib/ai/dashboard-registry";
import { sanitizeConversationId } from "@/lib/ai/conversation-context";

export const runtime = "nodejs";

const DASHBOARD_KEYS = DASHBOARD_REGISTRY.map((d) => d.key);

// Same bound and rationale as the chat route's MAX_ACTIVE_FILTERS_LENGTH: this
// field is attacker-controlled and only ever reaches the model as prose.
const MAX_ACTIVE_FILTERS_LENGTH = 400;
// The objective is the user's own question, echoed back by the UI. Bounded so
// it can't be used to stuff the report prompt or the cache key.
const MAX_OBJECTIVE_LENGTH = 1_000;

function failure(error: string, status: number): Response {
  return Response.json({ success: false, error } satisfies AssistantActionFailure, { status });
}

function sanitizeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

interface AssistantActionBody {
  action?: unknown;
  /** `{ type: "builtin", dashboardKey }` or `{ type: "custom", dashboardId }` — see lib/ai/dashboard-context.ts. */
  dashboard?: unknown;
  /** Legacy shorthand for a built-in dashboard; `dashboard` wins when both are sent. */
  dashboardKey?: unknown;
  objective?: unknown;
  activeFilters?: unknown;
  conversationId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: AssistantActionBody;
  try {
    body = (await request.json()) as AssistantActionBody;
  } catch {
    return failure("Request body must be JSON.", 400);
  }

  // Validated against the registry, not against a string comparison — an
  // unknown action id is rejected before anything else happens, so adding a
  // future action never widens what this endpoint accepts by accident.
  const actionId = typeof body.action === "string" ? body.action : "";
  const action = assistantAction(actionId);
  if (!action) {
    return failure(`action must be one of: ${ASSISTANT_ACTIONS.map((a) => a.id).join(", ")}`, 400);
  }

  const dashboardContext: DashboardContext | null =
    parseDashboardContext(body.dashboard) ??
    parseDashboardContext(
      typeof body.dashboardKey === "string" ? { type: "builtin", dashboardKey: body.dashboardKey } : null
    );
  if (!dashboardContext) {
    return failure(
      `dashboard must be { type: "builtin", dashboardKey: one of ${DASHBOARD_KEYS.join(" | ")} } or { type: "custom", dashboardId }`,
      400
    );
  }
  // Per-action dashboard gating — no-op while every action allows every
  // dashboard, but it means a future dashboard-specific action is enforced
  // server-side and not only by the button being hidden. Same registry rule the
  // panel renders from, so the two can't disagree.
  if (!assistantActionsFor(dashboardContext).some((a) => a.id === action.id)) {
    return failure("That action is not available on this dashboard.", 400);
  }

  // Resolved BEFORE the workflow starts: a dashboard this server can't load must
  // fail in milliseconds, not part-way through a multi-minute generation. And,
  // as in the chat route, an unresolvable dashboard is never substituted for
  // another one.
  const dataContext = resolveDashboardDataContext(dashboardContext);
  if (!dataContext) {
    return Response.json(
      {
        success: false,
        error: "This dashboard's data isn't loaded on the server yet.",
        needsDashboardSync: true,
      },
      { status: 409 }
    );
  }

  const objective = sanitizeText(body.objective, MAX_OBJECTIVE_LENGTH);
  if (!objective) {
    return failure("A non-empty `objective` is required — ask the assistant a question first.", 400);
  }

  const activeFilters = sanitizeText(body.activeFilters, MAX_ACTIVE_FILTERS_LENGTH);
  // Reuses the chat route's own bounds check. Unlike chat, a missing id is not
  // replaced with a fresh one: this workflow only ever READS conversation
  // memory, so "no id" simply means "no memory to draw on", and minting an id
  // that will never be written to would be misleading.
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId.trim()
      ? sanitizeConversationId(body.conversationId, () => "")
      : null;

  // NOTE ON PERMISSIONS (§19): this application has no user, session, or
  // authorization layer of any kind — no auth middleware, no roles, nothing
  // for a route to consult. Rather than invent a permission model that would
  // be fictional, every input that DOES exist is validated above, and the
  // data reachable from here is exactly the data the dashboard itself already
  // renders unauthenticated. When auth lands, this is the line it goes on.

  try {
    const result = await runActionPlan({
      action: action.id satisfies AssistantActionId,
      dataContext,
      objective,
      activeFilters,
      conversationId: conversationId || null,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof ActionPlanServiceError) {
      return failure(err.message, err.status);
    }
    console.error("[assistant-actions] Unexpected error:", err);
    return failure("Something went wrong generating that report. Please try again.", 500);
  }
}
