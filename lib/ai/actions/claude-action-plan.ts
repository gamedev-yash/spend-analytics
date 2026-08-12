// The live action-plan generator: Claude analysing this dashboard's real data
// and emitting a structured plan.
//
// WHAT IT REUSES, UNCHANGED — this is the point of the file:
//   queryDashboardDataTool()      the SAME per-dashboard enum-scoped schema chat uses
//   runDashboardQuery()           the SAME validation + engine + result cache
//   renderDashboardQueryResult()  the SAME correctable tool_result rendering
//   buildDashboardContext()       the SAME memoized schema text
//   SEMANTIC_METRIC_DICTIONARY    the SAME metric definitions
//   resolveAnthropicClient()      the SAME key/model resolution
// There is no second query path, no second SQL surface, no relaxed validation.
// A query composed here is validated against exactly the same table/field
// enums a chat query is, because it goes through exactly the same function.
//
// WHAT'S DIFFERENT FROM THE CHAT LOOP, AND WHY:
//   - `generate_action_plan` is in this tool array and ONLY this one. It is
//     never offered during normal chat, so Claude cannot decide to run a
//     report mid-conversation. That is a structural guarantee, not a prompt
//     instruction (§2, §17).
//   - No redirect_to_dashboard / ask_with_options. The user already chose the
//     dashboard by clicking the button on it, and there is nobody to ask a
//     clarifying question of inside a one-shot workflow.
//   - More passes (8 vs. chat's 4) and a larger token budget: this is the
//     expensive operation the user explicitly opted into, and it needs several
//     queries before it has enough facts to write from.
//   - The loop terminates on the generate_action_plan tool call rather than on
//     prose. Prose is not an acceptable output here — the renderers need
//     structure, so the final pass forces the tool.

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicClient } from "@/lib/ai/anthropic-client";
import { buildDashboardContext } from "@/lib/ai/dashboard-context";
import {
  queryDashboardDataTool,
  runDashboardQuery,
  renderDashboardQueryResult,
} from "@/lib/ai/dashboard-query";
import { SEMANTIC_METRIC_DICTIONARY } from "@/lib/ai/semantic-metrics";
import type { ActionPlanContext, ActionPlanGenerator } from "@/lib/ai/actions/action-plan-generator";
import type { ActionPlanResult } from "@/lib/ai/actions/action-plan-types";

const MAX_TOKENS = 16_000;
const MAX_TOOL_PASSES = 8;

export class ActionPlanGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionPlanGenerationError";
  }
}

// ---------------------------------------------------------------------------
// The internal Claude tool. Distinct from the "Generate Action Plan & Report"
// user action that triggers this whole workflow — see the module comment on
// lib/ai/actions/assistant-actions.ts for why those are deliberately two
// different things.
// ---------------------------------------------------------------------------

const GENERATE_ACTION_PLAN_TOOL: Anthropic.Tool = {
  name: "generate_action_plan",
  description:
    "Emit the finished, structured action plan. Call this exactly once, as your final action, after you have gathered every figure you intend to cite via query_dashboard_data. Do not call it before you have queried the data.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Specific report title naming the category/scope, not a generic one." },
      objective: { type: "string", description: "What this plan is trying to achieve, in one or two sentences." },
      scope: { type: "string", description: "Which dashboard and which filtered view this was produced from, in plain language." },
      insightSummary: { type: "string", description: "Executive summary paragraph. Every figure in it must also appear in facts." },
      facts: {
        type: "array",
        description: "ONLY values you actually read off a query result. Never a value you inferred, rounded from memory, or assumed.",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            // Format guidance only — deliberately a placeholder rather than a
            // realistic figure, so the schema can never anchor the model
            // toward a number it did not actually query.
            value: { type: "string", description: "The figure as it should be displayed, formatted as a count or as an amount in Cr / L." },
            source: { type: "string", description: "Plain-language note on what was counted or summed. Never a table or column name." },
          },
          required: ["label", "value", "source"],
          additionalProperties: false,
        },
      },
      insights: {
        type: "array",
        description: "Observations DERIVED from the facts. No new numbers here that aren't in facts.",
        items: {
          type: "object",
          properties: {
            insight: { type: "string" },
            basedOn: { type: "string", description: "Which fact(s) this reading rests on." },
          },
          required: ["insight", "basedOn"],
          additionalProperties: false,
        },
      },
      recommendations: {
        type: "array",
        description: "At least one. Actions suggested on the strength of the insights.",
        items: {
          type: "object",
          properties: {
            action: { type: "string" },
            priority: { type: "string", enum: ["High", "Medium", "Low"] },
            reason: { type: "string" },
            expectedImpact: { type: "string" },
          },
          required: ["action", "priority", "reason", "expectedImpact"],
          additionalProperties: false,
        },
      },
      benefits: {
        type: "array",
        description:
          "Estimated business benefits. formula and assumption are ALWAYS required. Omit `value` entirely when the dashboard data cannot support a figure — do not invent one.",
        items: {
          type: "object",
          properties: {
            metric: { type: "string" },
            formula: { type: "string", description: "The arithmetic, e.g. \"Addressable spend x assumed savings rate\"." },
            assumption: { type: "string", description: "The condition the estimate rests on, stated as an assumption requiring validation." },
            value: { type: "string", description: "The computed figure. OMIT when not supportable from the data." },
          },
          required: ["metric", "formula", "assumption"],
          additionalProperties: false,
        },
      },
      risks: {
        type: "array",
        items: {
          type: "object",
          properties: { risk: { type: "string" }, mitigation: { type: "string" } },
          required: ["risk", "mitigation"],
          additionalProperties: false,
        },
      },
      implementationPlan: {
        type: "array",
        items: {
          type: "object",
          properties: {
            phase: { type: "string" },
            action: { type: "string" },
            timeline: { type: "string" },
            owner: { type: "string", description: "A procurement role, not a person's name." },
          },
          required: ["phase", "action", "timeline", "owner"],
          additionalProperties: false,
        },
      },
      assumptions: {
        type: "array",
        description: "Every condition the estimates rest on, stated plainly. Anything you assumed rather than measured belongs here.",
        items: { type: "string" },
      },
      nextSteps: { type: "array", items: { type: "string" } },
    },
    required: [
      "title",
      "objective",
      "scope",
      "insightSummary",
      "facts",
      "insights",
      "recommendations",
      "benefits",
      "risks",
      "implementationPlan",
      "assumptions",
      "nextSteps",
    ],
    additionalProperties: false,
  },
};

function buildSystemPrompt(context: ActionPlanContext): string {
  const filtersBlock = context.activeFilters
    ? `\nThe user has this filtered view open on the dashboard: ${context.activeFilters}\nScope your queries to match it, so the report agrees with what is on their screen. Say so in the scope field.\n`
    : "";

  // The SAME structured memory normal chat uses (lib/ai/conversation-context.ts),
  // not the raw transcript — it already carries the last query's shape and its
  // top results, which is exactly what lets this workflow skip re-asking for
  // something the conversation just established (§17).
  const memoryBlock = context.conversationMemory ? `\n${context.conversationMemory}\n` : "";

  return `You are a procurement analyst producing a structured action plan from the "${context.dashboardLabel}" dashboard of a Vedanta procurement analytics app.

What this dashboard covers:
${context.dashboardDescription}
${filtersBlock}${memoryBlock}
${buildDashboardContext(context.dashboardKey)}

${SEMANTIC_METRIC_DICTIONARY}

HOW TO WORK:
1. Call query_dashboard_data as many times as you need — typically 3 to 6 queries — to establish the real figures behind the user's objective. Query first; write afterwards.
2. Then call generate_action_plan exactly once with the finished plan. That call is your final action.

ABSOLUTE RULES ON NUMBERS:
- A figure may go in "facts" ONLY if you read it off a query result in this session. Never estimate, never recall a number from earlier in the conversation as if it were fresh, never fabricate.
- "insights" may not introduce numbers that are not already in "facts".
- Every entry in "benefits" must state its "formula" and its "assumption". If the data cannot support a figure, OMIT "value" and say plainly in the assumption that it cannot be estimated from the available dashboard data. Writing "you will save X" without a stated assumption is a serious error.
- An assumption is never a fact. Anything you assumed rather than measured goes in "assumptions", and the benefit that depends on it must name it.
- If a query returns no rows, or the objective needs data this dashboard does not carry, say so plainly in the plan rather than approximating around it.

LANGUAGE:
- Table and column names (fact_po_items, vendor_name, actual_dpo, ...) are for YOUR use when calling query_dashboard_data. Never write one into any field of generate_action_plan — this report is read by business users. Say "suppliers", not "vendor_name"; "payment records", not "fact_payments".
- Amounts in rupees: use Cr and L, matching how the dashboards display money.
- Owners are procurement roles ("Category Manager", "Sourcing Lead"), never invented personal names.
- Write for an executive audience: specific, concrete, no filler.

The user's objective for this report:
${context.objective}`;
}

export const claudeActionPlanGenerator: ActionPlanGenerator = {
  kind: "dynamic",

  // Always willing: the live generator is the fallback for every dashboard and
  // every objective. Whether it CAN run (API key configured) is resolved in
  // generate(), so a missing key surfaces as a clear error rather than as a
  // silent "no generator available".
  canHandle(): boolean {
    return true;
  },

  async generate(context: ActionPlanContext): Promise<ActionPlanResult> {
    const resolved = resolveAnthropicClient();
    if (!resolved) {
      throw new ActionPlanGenerationError("NO_CLIENT");
    }
    const { client, model } = resolved;

    const systemPrompt = buildSystemPrompt(context);
    const tools: Anthropic.Tool[] = [queryDashboardDataTool(context.dashboardKey), GENERATE_ACTION_PLAN_TOOL];
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Produce the action plan for this objective: ${context.objective}\n\nQuery the dashboard data first, then call generate_action_plan.`,
      },
    ];

    for (let pass = 0; pass < MAX_TOOL_PASSES; pass += 1) {
      // The last pass forces the emit tool, so a run that spent its whole
      // budget querying still returns a structured plan built from what it
      // found rather than nothing at all. Mirrors the chat loop's
      // force-prose-on-the-last-pass rule, inverted for this workflow's
      // different terminal condition.
      const forceEmit = pass === MAX_TOOL_PASSES - 1;

      const response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        tools,
        tool_choice: forceEmit ? { type: "tool", name: "generate_action_plan" } : { type: "auto" },
        messages,
      });

      if (response.stop_reason === "refusal") {
        throw new ActionPlanGenerationError("The assistant declined to produce this report.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new ActionPlanGenerationError(
          "The report was too long to complete. Try a narrower objective or a more specific filter."
        );
      }

      const queryCalls: Anthropic.ToolUseBlock[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        if (block.name === "generate_action_plan") {
          // Terminal. Returned RAW and unvalidated on purpose — the service
          // runs it through validateActionPlan(), so there is exactly one
          // validation gate for every generator rather than one per generator.
          return block.input as unknown as ActionPlanResult;
        }
        if (block.name === "query_dashboard_data") queryCalls.push(block);
      }

      if (queryCalls.length === 0) {
        // No query and no plan — the model produced prose, which is not a
        // usable output here. Push it back and let the next pass (or the
        // forced final pass) correct course.
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content:
            "That was not a tool call. Either call query_dashboard_data to gather more figures, or call generate_action_plan with the finished plan.",
        });
        continue;
      }

      messages.push({ role: "assistant", content: response.content });
      // Concurrent, order-preserving — each result must land on the
      // tool_use_id of the call that produced it. Same shape as the chat loop.
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        queryCalls.map(async (call) => {
          const outcome = runDashboardQuery(context.dashboardKey, call.input as Record<string, unknown>);
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            is_error: outcome.error !== undefined,
            content: renderDashboardQueryResult(outcome),
          };
        })
      );
      messages.push({ role: "user", content: results });
    }

    throw new ActionPlanGenerationError("The report could not be completed in the allowed number of steps.");
  },
};
