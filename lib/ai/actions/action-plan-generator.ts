// The generator seam — the one place that decides HOW an action plan's
// content gets produced, kept deliberately separate from everything around it.
//
//        ActionPlanService  (validation, cache, artifacts, API shape)
//                 │
//         ActionPlanGenerator          ← this interface
//            ├── DemoActionPlanGenerator     predefined content (urgent demo)
//            └── ClaudeActionPlanGenerator   Claude + query_dashboard_data
//
// Replacing the demo with the real thing is a change to the ORDER of the list
// in `selectGenerator` below and nothing else: the request shape, the result
// shape, validation, caching, both renderers, the endpoint, and the entire
// frontend are identical either way. That is the whole reason this seam is
// here rather than an `if (DEMO)` branch inside the service.

import "server-only";

import type { ActionPlanResult } from "@/lib/ai/actions/action-plan-types";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";

/** Everything a generator is allowed to see. Assembled once by the service — no generator reads the raw HTTP request. */
export interface ActionPlanContext {
  dashboardKey: DashboardKey;
  dashboardLabel: string;
  dashboardDescription: string;
  /** User's own words, already trimmed and length-bounded by the route. */
  objective: string;
  /** Free-text summary of the dashboard's current filter state, or null when unfiltered. */
  activeFilters: string | null;
  /**
   * The compact conversation-memory block from lib/ai/conversation-context.ts —
   * the SAME structured memory normal chat uses, not a second memory system,
   * and not the full raw transcript. It already contains the last query's
   * shape and its top results, which is exactly the "relevant previous query
   * result" the workflow needs in order to avoid re-asking the warehouse for
   * something the conversation just established.
   */
  conversationMemory: string | null;
}

export interface ActionPlanGeneration {
  plan: ActionPlanResult;
  /** Reported to the client so a predefined report is never mistaken for a live one. */
  kind: "demo" | "dynamic";
}

export interface ActionPlanGenerator {
  kind: "demo" | "dynamic";
  /**
   * Whether this generator is willing to answer this specific request. The
   * demo generator says no to anything outside the scenario it was written
   * for, so an unrelated dashboard falls through to the live generator
   * instead of being handed a confidently wrong report about suppliers it
   * has never seen. Enforces §9 (dashboard-specific, never generic).
   */
  canHandle(context: ActionPlanContext): boolean;
  generate(context: ActionPlanContext): Promise<ActionPlanResult>;
}

/**
 * REPORT_GENERATOR=dynamic skips the demo generator entirely; anything else
 * (including unset) prefers it where it applies and falls through to the live
 * one where it doesn't. Flipping this env var is the "replace demo with
 * production" switch — no code change, no API change.
 */
export function selectGenerator(
  context: ActionPlanContext,
  generators: ActionPlanGenerator[]
): ActionPlanGenerator | null {
  const preferDynamic = process.env.REPORT_GENERATOR === "dynamic";
  const ordered = preferDynamic ? generators.filter((g) => g.kind === "dynamic") : generators;
  return ordered.find((g) => g.canHandle(context)) ?? null;
}
