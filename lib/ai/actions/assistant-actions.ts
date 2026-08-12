// The Assistant Actions registry — explicit, user-triggered operations the
// assistant panel can offer alongside normal chat.
//
// WHY A REGISTRY FOR ONE ACTION: not speculative generality. It is the thing
// that keeps the *next* action ("Generate Executive Summary", "Compare
// Suppliers", "Export Analysis") from being another button hardcoded into
// DashboardAssistant.tsx with another bespoke endpoint behind it. Adding one
// means an entry here plus a generator; the button row, the request contract,
// the validation, the artifact plumbing, and the download UI are already
// action-agnostic.
//
// WHAT THIS IS NOT: these are not Claude tools. Nothing in this file is ever
// put in front of the model during normal chat — Claude cannot decide to run
// an action. The user clicks, the client posts the action id, the server
// dispatches. That is the whole point of the feature (§2 of the spec): the
// expensive workflow runs when a human asks for it and at no other time.
//
// Client-safe (no `server-only`): the panel renders the button labels from
// this list. Labels and gating rules only — no generator code, no data.

import type { AssistantActionId } from "@/lib/ai/actions/action-plan-types";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";

export interface AssistantActionDefinition {
  id: AssistantActionId;
  /** Button text in the assistant panel. */
  label: string;
  /** Tooltip / aria description — says what will happen, since this is a slow, deliberate operation. */
  description: string;
  /**
   * Which dashboards offer this action. `null` means all of them. Present so a
   * future action that only makes sense on one dashboard doesn't need new
   * gating logic in the UI.
   */
  dashboards: DashboardKey[] | null;
  /** Rough user-facing expectation, shown while it runs. */
  estimatedSeconds: number;
}

export const ASSISTANT_ACTIONS: AssistantActionDefinition[] = [
  {
    id: "action_plan",
    label: "Generate Action Plan & Report",
    description:
      "Analyse this dashboard's data against your question and produce a structured action plan, downloadable as Word and Excel.",
    dashboards: null,
    estimatedSeconds: 25,
  },
];

export function assistantActionsFor(dashboardKey: DashboardKey): AssistantActionDefinition[] {
  return ASSISTANT_ACTIONS.filter((a) => a.dashboards === null || a.dashboards.includes(dashboardKey));
}

/** Null for anything not in the registry — the API rejects on null rather than trusting a client-supplied id. */
export function assistantAction(id: string): AssistantActionDefinition | null {
  return ASSISTANT_ACTIONS.find((a) => a.id === id) ?? null;
}
