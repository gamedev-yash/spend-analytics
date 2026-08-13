// THE action-plan engine. One engine, for every dashboard and every objective.
//
// GENERIC BY CONSTRUCTION, NOT BY DISCIPLINE. This file contains no dashboard
// name, no keyword list, no scenario branch, no per-business-problem path, and
// no hardcoded fact, insight, recommendation, or benefit. Everything it knows
// about the situation arrives through ActionPlanContext, and every field of
// that context is derived from `dashboardKey` by modules that already existed:
//
//   dashboardKey ─┬─► queryDashboardDataTool(key)    WHAT IT MAY QUERY (enum-scoped)
//                 ├─► buildDashboardContext(key)     the schema it can see
//                 └─► dashboardMeta(key)             label + business scope
//   plus  activeFilters (the user's live view) and conversationMemory (prior queries)
//
// The consequence worth understanding: adding a seventh dashboard to
// DASHBOARD_REGISTRY + dashboard-tables.ts makes reports work there with ZERO
// changes to this file. Nothing here enumerates dashboards, so nothing here can
// fall out of date when one is added.
//
// WHY THERE IS NO GENERATOR-SELECTION SEAM ANYMORE: there used to be a second,
// scenario-scoped generator holding predefined content for one dashboard, plus
// a REPORT_GENERATOR env flag to choose between them. Both are gone. A single
// engine means there is no configuration under which a user can receive
// canned content, and no code path whose behaviour depends on which business
// problem was recognised.
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
//     dashboard by enabling Report mode on it, and there is nobody to ask a
//     clarifying question of inside a one-shot workflow. An objective this
//     dashboard genuinely can't serve is reported through the plan's own
//     `dataGaps`, not bounced back as a question.
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
import { validateActionPlan } from "@/lib/ai/actions/action-plan-validate";
import { findLeakedIdentifiers, scrubIdentifiers } from "@/lib/ai/actions/identifier-guard";
import type { ActionPlanResult, NoReportKind } from "@/lib/ai/actions/action-plan-types";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";

/**
 * Everything the engine is allowed to see. Assembled once by
 * action-plan-service.ts — the engine never reads the raw HTTP request, and
 * every field here is derived from `dashboardKey` or supplied by the user, so
 * there is nothing for a scenario-specific value to attach to.
 */
export interface ActionPlanContext {
  dashboardKey: DashboardKey;
  dashboardLabel: string;
  dashboardDescription: string;
  /** The user's own words, already trimmed and length-bounded by the route. Never parsed, matched, or classified. */
  objective: string;
  /** Free-text summary of the dashboard's current filter state, or null when unfiltered. */
  activeFilters: string | null;
  /**
   * The compact conversation-memory block from lib/ai/conversation-context.ts —
   * the SAME structured memory normal chat uses, not a second memory system, and
   * not the full raw transcript. It already carries the last query's shape and
   * its top results, which is exactly the "relevant previous query result" this
   * workflow needs in order to avoid re-asking the warehouse for something the
   * conversation just established.
   */
  conversationMemory: string | null;
}

const MAX_TOKENS = 16_000;

/**
 * Back to 8 from a brief experiment at 10.
 *
 * Latency here is roughly passes x time-per-pass, and 10 put worst-case runs
 * past 300s with no better report to show for it — observed emits land on
 * passes 5-9. 8 with an earlier budget nudge (below) bounds the tail without
 * cutting off legitimate investigation, and the repair round now covers the
 * degenerate forced-emit case that motivated raising it in the first place.
 */
const MAX_TOOL_PASSES = 8;

/**
 * How many times a rejected plan may be handed back for correction.
 *
 * WHY THIS EXISTS: the emit tool is FORCED on the final pass, so a run that
 * spends its whole budget querying is compelled to emit whether or not it is
 * ready — and a compelled emit can arrive degenerate (observed: an empty object,
 * every field missing). Validation caught that correctly, but rejection with no
 * recovery turned a recoverable situation into a 422 for the user.
 *
 * Handing the validator's own issue list back as a tool_result is the natural
 * repair: the model is told exactly what was wrong in the same channel it would
 * receive a failed query in, and gets to emit again. Two attempts, because a
 * model that cannot satisfy the schema twice given explicit reasons is not going
 * to on the third, and each attempt costs a full round trip.
 */
const MAX_REPAIR_ATTEMPTS = 2;

// Dev-only. Same rule as app/api/dashboard-chat's DEBUG_TIMING: never logged in
// production, and it records shape and counts only — never a query result value
// or any part of the report's business content.
const DEBUG_ENGINE = process.env.NODE_ENV !== "production";

/**
 * What one engine run can conclude. A union rather than "plan or throw", because
 * "this request should not become a report" is a correct answer, not a failure —
 * see NoReportKind in action-plan-types.ts for why that distinction is the whole
 * point of the triage.
 */
export type ActionPlanOutcome =
  | { kind: "plan"; plan: ActionPlanResult }
  | { kind: "no_report"; reason: NoReportKind; message: string; options: string[] | null };

export class ActionPlanGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionPlanGenerationError";
  }
}

/**
 * The suitability triage, expressed as a tool rather than a separate step.
 *
 * WHY IT IS A TOOL AND NOT A CLASSIFIER CALL: the obvious design is a cheap
 * Claude call that labels the request, then the engine proceeds or bails. That
 * spends a whole round trip re-reading context the engine is about to read
 * anyway, and it splits one judgement across two prompts that can disagree.
 * Putting both terminal moves in the SAME tool array makes triage the engine's
 * FIRST decision instead of a preceding stage: it sees the objective, the
 * dashboard's schema, the filters and the conversation memory, then either
 * starts querying toward a plan or calls this. Zero extra Claude calls, one
 * consistent judgement, and the classification is made by whatever has the most
 * context rather than the least.
 *
 * This is what makes Report Mode an intent signal rather than a command. The
 * user is saying "I want analysis", not "treat my next keystroke as an
 * objective" — and the difference is what stops a factual question from being
 * answered with an invented strategy.
 */
const RESPOND_WITHOUT_REPORT_TOOL: Anthropic.Tool = {
  name: "respond_without_report",
  description:
    "Call this INSTEAD of generate_action_plan when the user's request is not an analytical objective this dashboard can build a report around. Use it for a request that wants a specific figure rather than a strategy, a request about navigating the app, a request whose analytical intent is real but too vague to act on, or a genuine objective that this dashboard's data cannot serve. Never use it to avoid work on a request that IS a valid objective.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["factual", "navigation", "clarification", "unsupported"],
        description:
          "factual = wants a specific number or fact, not a strategy. navigation = wants to move somewhere in the app. clarification = genuinely analytical but too vague to act on. unsupported = a real objective, but this dashboard's data cannot answer it.",
      },
      message: {
        type: "string",
        description:
          "For clarification: one short question asking what to analyse. For unsupported: say plainly what this dashboard DOES hold, what is missing, and what would be needed — never a bare refusal. For factual/navigation: one sentence noting the request will be answered normally. Business language only.",
      },
      options: {
        type: ["array", "null"],
        items: { type: "string" },
        description:
          "For kind=clarification only: 2-5 short, concrete analytical angles drawn from what THIS dashboard can actually analyse, so the user can pick instead of guessing. Null otherwise.",
      },
    },
    required: ["kind", "message", "options"],
    additionalProperties: false,
  },
};

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
      opportunities: {
        type: "array",
        description:
          "Things worth pursuing that follow from the insights. Include one WITHOUT a scale rather than inflating it into a benefit when the data cannot size it.",
        items: {
          type: "object",
          properties: {
            opportunity: { type: "string" },
            basedOn: { type: "string", description: "Which fact(s) or insight(s) point at it." },
            scale: { type: "string", description: "Rough size, ONLY if the data supports it. Omit otherwise." },
          },
          required: ["opportunity", "basedOn"],
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
            evidence: { type: "string", description: "The specific measured finding this rests on, so a reader can audit it." },
            dependencies: { type: "string", description: "What must happen first. Omit when the action stands alone." },
          },
          required: ["action", "priority", "reason", "expectedImpact", "evidence"],
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
            basis: { type: "string", description: "Which measured figure the formula starts from." },
            confidence: {
              type: "string",
              enum: ["High", "Medium", "Low"],
              description: "High = computed from a complete measured figure. Medium = measured base, assumed rate. Low = largely assumption.",
            },
            value: { type: "string", description: "The computed figure, or a range. OMIT entirely when not supportable from the data." },
          },
          required: ["metric", "formula", "assumption", "basis", "confidence"],
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
            owner: { type: "string", description: "A business role, not a person's name." },
            successMetric: { type: "string", description: "How this phase is judged done." },
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
      dataGaps: {
        type: "array",
        description:
          "What the objective needed but this dashboard could not supply. Name the missing information in business terms and say where it would have to come from. Use an empty array when the objective was fully answerable — do not invent gaps. This is the correct place for anything you were tempted to estimate around.",
        items: { type: "string" },
      },
    },
    required: [
      "title",
      "objective",
      "scope",
      "insightSummary",
      "facts",
      "insights",
      "opportunities",
      "recommendations",
      "benefits",
      "risks",
      "implementationPlan",
      "assumptions",
      "nextSteps",
      "dataGaps",
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

FIRST DECIDE WHETHER THIS REQUEST SHOULD BECOME A REPORT AT ALL.

The user has switched on Report Mode, which tells you they want analysis. It does NOT tell you that what they typed is an analytical objective. Judge the request itself, against what this dashboard holds:

- A request that ONE FIGURE OR ONE SHORT LIST would fully satisfy is factual, not analytical. Apply that test literally: if you could answer it completely with a single number, a single total, or one ranked list and nothing would be left unanswered, it is factual. Call respond_without_report with kind="factual". Being able to query it is not a reason to build a report around it — do not manufacture recommendations, savings, or a strategy for a number someone simply asked for.
- A request about moving around the application rather than analysing data is NOT a report objective. Call respond_without_report with kind="navigation".
- A request that states NO DIRECTION AT ALL is not yet an objective. Direction means an aspect (cost, risk, efficiency, performance, compliance...), a problem to solve, a decision to inform, or an explicit ask for priorities/attention/a summary. A request that only names a subject — "analyse this", "look at X", "tell me about Y" — supplies a topic and no direction, and you must NOT choose one for the user. Call respond_without_report with kind="clarification", ask one short question, and offer 2-5 concrete analytical angles drawn from what THIS dashboard's tables can actually support.
- A genuine objective that this dashboard's data cannot serve is NOT a report objective. Call respond_without_report with kind="unsupported", and say what this dashboard does hold, what is missing, and what would be needed.

Otherwise — any request that expresses a goal, a problem to solve, an aspect to evaluate, an area to improve, a decision to inform, or a request for priorities, attention or an executive overview — IS a valid objective, however broadly it is phrased. Build the report. The user never has to use the word "report"; asking for one explicitly is just one of many valid phrasings.

The distinction that matters is DIRECTION, not breadth. "What should management focus on?" and "Give me an executive overview" are broad but directional — they ask for priorities — so proceed and survey the dashboard's material dimensions. "Analyse this" is not broad, it is directionless — so ask.

Make this decision BEFORE you query. Deciding does not require data: it requires reading the request and knowing what your tables hold, both of which you already have. Do not run queries in order to work out whether to build a report.

${filtersBlock}${memoryBlock}
${buildDashboardContext(context.dashboardKey)}

${SEMANTIC_METRIC_DICTIONARY}

IF IT IS A VALID OBJECTIVE — derive every step from the objective and the schema above. There is no template for any particular kind of question:

1. INTERPRET THE OBJECTIVE. Decide what it is actually asking for. If it is broad ("what needs attention here", "create an executive report"), treat the dashboard's own scope as the objective and survey its most material dimensions rather than guessing at a narrower question. If it is specific, answer that.
2. DECIDE WHAT DATA YOU NEED. Work out which of the tables and fields listed above bear on the objective, and what breakdowns would evidence it. Only you can judge this — it depends entirely on the objective and on what this dashboard carries.
3. QUERY. Call query_dashboard_data, typically 3 to 6 times. Start broad (an overall total, or a breakdown across the main dimension) so later figures have something to be a share OF, then go narrower where the first results point. If a result is empty or surprising, query again to check it rather than reasoning around it.
4. ESTABLISH FACTS. Put every figure you actually read off a result into "facts", each with the plain-language basis that produced it.
5. DERIVE INSIGHTS. Say what the facts mean — concentration, imbalance, an outlier, a gap, a trend. Each must name the fact(s) it rests on. Introduce no new numbers here.
6. ASSESS BENEFITS. Quantify only what the data supports, always with the arithmetic and the assumption. Where it cannot be quantified, say so instead of estimating. A range with a stated basis is better than a false point estimate.
7. RECOMMEND AND SEQUENCE. Derive recommendations from the insights, prioritise them, then phase them into an implementation plan with timelines and role owners.
8. DECLARE GAPS. Anything the objective needed that this dashboard could not supply goes in "dataGaps". Then call generate_action_plan exactly once. That call is your final action.

ABSOLUTE RULES ON NUMBERS:
- A figure may go in "facts" ONLY if you read it off a query result in this session. Never estimate, never recall a number from earlier in the conversation as if it were fresh, never fabricate.
- "insights" may not introduce numbers that are not already in "facts".
- Every entry in "benefits" must state its "formula" and its "assumption". If the data cannot support a figure, OMIT "value" and say plainly in the assumption that it cannot be estimated from the available dashboard data. Writing "you will save X" without a stated assumption is a serious error.
- An assumption is never a fact. Anything you assumed rather than measured goes in "assumptions", and the benefit that depends on it must name it.
- If a query returns no rows, or the objective needs data this dashboard does not carry, put it in "dataGaps" and keep the rest of the plan honest. A shorter report that is entirely true is correct; a fuller one that estimates around a gap is not.
- The tables above are the ONLY data in reach. If the objective largely depends on something outside them, say that plainly in "dataGaps" and build the plan from what IS available — never approximate the missing part from whatever is present.

LANGUAGE — the most common mistake in this report, so read carefully:
- Table and column names (fact_po_items, vendor_name, actual_dpo, is_contract_backed, ...) are for YOUR use when calling query_dashboard_data. NEVER write one into any field of generate_action_plan. Not in a fact's basis, not in an assumption, not in a next step, not in a data gap, not in parentheses as a helpful hint. A business reader does not know what these mean.
- The "source"/basis of a fact is where this goes wrong most often, because you are tempted to cite the exact filter you used. Describe what was counted, in business terms:
  The pattern, using placeholder names — apply it to whatever columns YOUR tables above actually have:
    WRONG: "Sum of <amount_column> where <flag_column> = 0"
    RIGHT: "Total value of records not meeting <what that flag means in business terms>"
    WRONG: "Count of rows where <flag_column> = 1"
    RIGHT: "Number of records that <what that flag means>"
    WRONG: "Uses the pre-computed <tier_column> field in <table_name>"
    RIGHT: "Uses the pre-computed tier already assigned to each record"
    WRONG: "Pull <table_name> to quantify the gap"
    RIGHT: "Pull <what that table holds, in business terms> to quantify the gap"
  Translate the MEANING of a flag or code, never its name. If you cannot say what a column means in business language, do not cite it.
- Amounts in rupees: use Cr and L, matching how the dashboards display money.
- Owners are procurement roles ("Category Manager", "Sourcing Lead"), never invented personal names.
- Write for an executive audience: specific, concrete, no filler.

The user's objective for this report:
${context.objective}`;
}

/**
 * Runs the engine for one objective on one dashboard.
 *
 * A plain function, not a pluggable generator: there is nothing to choose
 * between, and a one-implementation interface with a `canHandle` gate would
 * only re-create the seam that let scenario-specific content in.
 *
 * Returns Claude's tool input RAW AND UNVALIDATED on purpose — the single
 * validation gate lives in action-plan-service.ts, so there is exactly one
 * place that decides whether a plan is fit to render.
 */
export async function generateActionPlan(context: ActionPlanContext): Promise<ActionPlanOutcome> {
  const resolved = resolveAnthropicClient();
  if (!resolved) {
    throw new ActionPlanGenerationError("NO_CLIENT");
  }
  const { client, model } = resolved;

  const systemPrompt = buildSystemPrompt(context);
  const tools: Anthropic.Tool[] = [
    queryDashboardDataTool(context.dashboardKey),
    GENERATE_ACTION_PLAN_TOOL,
    RESPOND_WITHOUT_REPORT_TOOL,
  ];
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Produce the action plan for this objective: ${context.objective}\n\nQuery the dashboard data first, then call generate_action_plan.`,
    },
  ];

  let repairAttempts = 0;

  for (let pass = 0; pass < MAX_TOOL_PASSES; pass += 1) {
    // The last pass forces the emit tool, so a run that spent its whole
    // budget querying still returns a structured plan built from what it
    // found rather than nothing at all. Mirrors the chat loop's
    // force-prose-on-the-last-pass rule, inverted for this workflow's
    // different terminal condition.
    //
    // A forced emit is a last resort, not a plan: being compelled to emit
    // before it is ready is exactly how a degenerate plan gets produced. The
    // budget nudge below exists to make sure the model chooses to emit on its
    // own before it ever gets here.
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
    let repairRequested = false;

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "generate_action_plan") {
        const raw = block.input;
        if (DEBUG_ENGINE) {
          console.debug(
            `[action-plan] emit pass=${pass} fields=${Object.keys((raw ?? {}) as Record<string, unknown>).length} repairs=${repairAttempts}`
          );
        }

        // STRUCTURE IS WORTH A ROUND TRIP; VOCABULARY IS NOT.
        //
        // A structurally broken plan cannot be rendered at all, so asking the
        // model to fix it is the only route to a report — worth the cost.
        //
        // A leaked identifier is a different situation: the plan is complete and
        // correctly grounded, and only some sentences name a column instead of a
        // business concept. That was first routed through this same repair
        // channel, and measurement killed the idea — the leak occurred in 3 of 3
        // live runs (is_contract_backed every time), so "repair on leak" was not
        // a rare path but a second full generation on nearly every report, and
        // 145-215s became 317-822s. Scrubbing is deterministic, costs
        // microseconds, and delivers exactly the same guarantee. Its prose is
        // stiffer than a model rewrite, which is why the system prompt now
        // carries explicit phrasing examples: prevention at zero latency, with
        // this as the backstop that makes the rule absolute rather than likely.
        //
        // Validation here is only to decide whether to request a correction. The
        // authoritative gate is still action-plan-service.ts — this cannot admit
        // anything the service would reject, because it is the same function.
        let candidate: ActionPlanResult;
        try {
          candidate = validateActionPlan(raw);
        } catch (err) {
          const issues = err instanceof Error && "issues" in err ? (err as { issues: string[] }).issues : [];
          if (repairAttempts >= MAX_REPAIR_ATTEMPTS) {
            throw new ActionPlanGenerationError(
              "The report could not be assembled into a usable form. Try a narrower objective."
            );
          }
          repairAttempts += 1;
          if (DEBUG_ENGINE) console.debug(`[action-plan] repair ${repairAttempts}: ${issues.join("; ")}`);

          // Fed back through the tool_result channel — the same way a failed
          // query is reported — so the model sees precisely which fields were
          // wrong and can emit again. A tool_use must always be answered by a
          // tool_result, so this is also what keeps the conversation valid.
          messages.push({ role: "assistant", content: response.content });
          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: block.id,
                is_error: true,
                content: `The plan was rejected and no report was produced. Problems: ${issues.join("; ")}. Call generate_action_plan again, fixing those and keeping every other field populated from the data you have already gathered. Do not run more queries.`,
              },
            ],
          });
          repairRequested = true;
          break;
        }

        // Terminal. Vocabulary is fixed in place rather than round-tripped: when
        // nothing leaked (the goal, and what the prompt examples are for) this
        // returns the model's own words untouched.
        const leaked = findLeakedIdentifiers(candidate);
        if (leaked.length === 0) return { kind: "plan", plan: candidate };
        if (DEBUG_ENGINE) console.debug(`[action-plan] scrubbed ${leaked.length} leaked identifier(s): ${leaked.join(", ")}`);
        return { kind: "plan", plan: scrubIdentifiers(candidate) };
      }

      if (block.name === "respond_without_report") {
        const input = block.input as { kind?: string; message?: string; options?: unknown };
        const reason = (["factual", "navigation", "clarification", "unsupported"] as NoReportKind[]).find(
          (k) => k === input.kind
        );
        const message = typeof input.message === "string" ? input.message.trim() : "";
        // A malformed triage call is not a reason to fail the turn — fall back to
        // asking what to analyse, which is safe for every kind.
        if (!reason || !message) {
          if (DEBUG_ENGINE) console.debug("[action-plan] malformed triage call, defaulting to clarification");
          return {
            kind: "no_report",
            reason: "clarification",
            message: "What would you like this report to analyse?",
            options: null,
          };
        }
        const options = Array.isArray(input.options)
          ? input.options.filter((o): o is string => typeof o === "string" && o.trim() !== "").slice(0, 5)
          : [];
        if (DEBUG_ENGINE) console.debug(`[action-plan] no report: ${reason} (pass=${pass})`);
        return {
          kind: "no_report",
          reason,
          message,
          // Chips only make sense for a clarification; the others are statements.
          options: reason === "clarification" && options.length >= 2 ? options : null,
        };
      }

      if (block.name === "query_dashboard_data") queryCalls.push(block);
    }

    if (repairRequested) continue;

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

    // Told BEFORE the forced pass, not on it. A model that decides for itself
    // to stop querying writes a complete plan; one compelled mid-investigation
    // does not. Two passes of warning leaves room to emit voluntarily and, if
    // that emit is rejected, to repair it — both without ever reaching the
    // forced call.
    if (pass === MAX_TOOL_PASSES - 3) {
      messages.push({
        role: "user",
        content:
          "You are near the end of your query budget. Stop gathering data and call generate_action_plan now, using the figures you already have. A shorter plan built entirely on what you have gathered is correct; anything the data could not cover goes in dataGaps.",
      });
    }
  }

  throw new ActionPlanGenerationError("The report could not be completed in the allowed number of steps.");
}
