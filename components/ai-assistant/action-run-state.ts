// The two transcript updates a report run performs, extracted from
// DashboardAssistant so they are testable — and they badly needed to be.
//
// THE BUG THIS EXISTS TO PREVENT FROM RECURRING: both operations used to match
// the progress card by OBJECT IDENTITY (`m === entry`, closing over the entry
// object). That cannot survive its own first update: rewriting a message
// replaces it with a copy, so the object the closure held was no longer in the
// array. The reveal writes TWICE — once to tell the card to finish its step
// animation, then again with the result — so the second write silently matched
// nothing and the finished report was never shown. The card sat on "running"
// indefinitely while the server had produced the report, both documents
// included. The abort path masked it, because that one writes only once.
//
// A pure function over a plain array, with no React and no client-component
// import at runtime (the ActionPlanState import is type-only, so it is erased):
// that is what lets tests/action-run-state.test.ts assert the invariant that
// actually matters — CONSECUTIVE writes must both land.

import type { ActionPlanState } from "./ActionPlanCard";

/** The only two fields these helpers care about; ChatEntry satisfies it structurally. */
export interface ActionRunEntry {
  /** Identifies one report run. Absent on every ordinary chat turn, which is what keeps those untouched. */
  actionRunId?: string;
  actionPlan?: ActionPlanState;
}

/**
 * Replaces the progress/result state of one run's card, wherever it currently
 * sits in the transcript and however many times it has already been rewritten.
 *
 * Matching by id rather than by index matters for the same reason the original
 * code used identity: an ordinary chat turn can land while a three-minute report
 * is still generating, so a position captured at the start is not where the card
 * will be at the end.
 */
export function writeActionPlan<T extends ActionRunEntry>(
  messages: readonly T[],
  runId: string,
  actionPlan: ActionPlanState
): T[] {
  return messages.map((message) => (message.actionRunId === runId ? { ...message, actionPlan } : message));
}

/**
 * Removes one run's card entirely — used when triage decides the request should
 * not become a report at all, where leaving a spent progress card above the
 * answer reads as a failure.
 */
export function dropActionRun<T extends ActionRunEntry>(messages: readonly T[], runId: string): T[] {
  return messages.filter((message) => message.actionRunId !== runId);
}
