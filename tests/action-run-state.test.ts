// Regression coverage for the report card that never revealed its report.
//
// The failure being locked out: the progress card was matched by object identity
// while being updated immutably, so the FIRST write invalidated the reference the
// SECOND write needed. Report Mode's reveal writes twice — "finish your step
// animation", then "here is the result" — so a completed report (both documents
// generated, server-side log confirming it) was never rendered, and the card sat
// on "running" indefinitely. Nothing in the suite could see it, because the logic
// lived in a closure inside the component.
//
// Every test below therefore drives at least TWO consecutive writes. A single
// write passing proves nothing — that is precisely the case that always worked
// and is what hid the bug (the abort path writes once).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dropActionRun, writeActionPlan, type ActionRunEntry } from "@/components/ai-assistant/action-run-state";
import type { ActionPlanState } from "@/components/ai-assistant/ActionPlanCard";

interface Entry extends ActionRunEntry {
  role: "user" | "assistant";
  content: string;
}

const RUNNING: ActionPlanState = { status: "running", label: "Generate Action Plan & Report", estimatedSeconds: 160 };
const FINISHING: ActionPlanState = { ...RUNNING, finishing: true };
const DONE: ActionPlanState = {
  status: "done",
  label: "Generate Action Plan & Report",
  estimatedSeconds: 160,
  report: { title: "A report" } as ActionPlanState extends { report?: infer R } ? R : never,
  cached: false,
};

function transcript(): Entry[] {
  return [
    { role: "assistant", content: "welcome" },
    { role: "user", content: "generate an actionable plan" },
    { role: "assistant", content: "", actionRunId: "action-run-1", actionPlan: RUNNING },
  ];
}

function cardOf(messages: Entry[], runId = "action-run-1"): ActionPlanState | undefined {
  return messages.find((m) => m.actionRunId === runId)?.actionPlan;
}

describe("writeActionPlan — the two-beat reveal", () => {
  it("applies a SECOND consecutive write (the exact case the identity match lost)", () => {
    const afterFirst = writeActionPlan(transcript(), "action-run-1", FINISHING);
    assert.equal(cardOf(afterFirst)?.finishing, true);

    const afterSecond = writeActionPlan(afterFirst, "action-run-1", DONE);
    assert.equal(cardOf(afterSecond)?.status, "done", "the finished report never reached the card");
  });

  it("survives any number of rewrites, not just two", () => {
    let messages = transcript();
    for (const state of [FINISHING, RUNNING, FINISHING, DONE]) {
      messages = writeActionPlan(messages, "action-run-1", state);
    }
    assert.equal(cardOf(messages)?.status, "done");
  });

  it("still finds the card after a chat turn lands mid-generation (why an index won't do)", () => {
    // A three-minute report does not block the composer, so ordinary turns can
    // arrive while it runs and shift the card's position.
    let messages = writeActionPlan(transcript(), "action-run-1", FINISHING);
    messages = [...messages, { role: "user", content: "unrelated question" }, { role: "assistant", content: "an answer" }];
    messages = writeActionPlan(messages, "action-run-1", DONE);
    assert.equal(cardOf(messages)?.status, "done");
    assert.equal(messages.length, 5, "no message was dropped or duplicated");
  });

  it("leaves ordinary chat turns and other runs untouched", () => {
    const withSecondRun: Entry[] = [
      ...transcript(),
      { role: "assistant", content: "", actionRunId: "action-run-2", actionPlan: RUNNING },
    ];
    const updated = writeActionPlan(withSecondRun, "action-run-2", DONE);
    assert.equal(cardOf(updated, "action-run-1")?.status, "running", "the other run was modified");
    assert.equal(cardOf(updated, "action-run-2")?.status, "done");
    assert.deepEqual(
      updated.filter((m) => !m.actionRunId).map((m) => m.content),
      ["welcome", "generate an actionable plan"]
    );
  });

  it("is a no-op for an unknown run rather than writing onto the wrong message", () => {
    const before = transcript();
    const after = writeActionPlan(before, "action-run-999", DONE);
    assert.deepEqual(after, before);
  });
});

describe("dropActionRun — triage decided this isn't a report", () => {
  it("removes the card even after it has already been rewritten once", () => {
    const rewritten = writeActionPlan(transcript(), "action-run-1", FINISHING);
    const dropped = dropActionRun(rewritten, "action-run-1");
    assert.equal(cardOf(dropped), undefined, "a stranded progress card was left above the answer");
    assert.equal(dropped.length, 2);
  });

  it("keeps every ordinary turn and any other run", () => {
    const withSecondRun: Entry[] = [
      ...transcript(),
      { role: "assistant", content: "", actionRunId: "action-run-2", actionPlan: RUNNING },
    ];
    const dropped = dropActionRun(withSecondRun, "action-run-1");
    assert.equal(dropped.length, 3);
    assert.equal(cardOf(dropped, "action-run-2")?.status, "running");
  });
});
