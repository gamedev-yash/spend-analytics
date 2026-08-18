// THE per-dashboard grounded assistant — one endpoint for BOTH dashboard kinds:
// the built-in dashboards registered in lib/ai/dashboard-registry.ts (Spend
// Overview, Compliance, Payment Terms, Tail Spend, Supplier Fragmentation,
// Single Source Risk, and any added there later) AND the generated dashboards a
// user builds from their own file (/generated/<id>).
//
// There is no second chat endpoint, no second Claude integration, and no second
// tool set. The request names a dashboard as a DashboardContext
// (lib/ai/dashboard-context.ts); that resolves once, here, into a
// DashboardDataContext (lib/ai/dashboard-data-context.ts) and everything after
// that point is identical for both kinds — same system prompt shape, same
// query_dashboard_data tool, same validation, same conversation memory, same
// tool-calling loop. The ONLY difference between a built-in and a generated
// dashboard is where the resolver found the rows.
//
// The endpoint is handed exactly one dashboard's own data — never another
// dashboard's — and is told the names of the others purely so it can redirect,
// never so it can answer from them. If the question needs data this dashboard
// doesn't have, the model calls redirect_to_dashboard instead of guessing; that
// tool call is structural, not prose, so the UI can render a real link rather
// than parsing free text for a dashboard name.
//
// The model does not answer from a hardcoded summary. It is shown this
// dashboard's real column/table schema (buildDashboardSchemaBlock) and must call
// query_dashboard_data to get an actual number back before stating one.
//
// GENERATED DASHBOARDS AND THE SYNC HANDSHAKE: a generated dashboard's rows live
// in the browser's localStorage, so this process may not hold the snapshot the
// request names (fresh server, second tab, evicted entry). That is answered with
// 409 + needsDashboardSync, and the client re-registers via
// /api/dashboard-context and retries. It is never answered from another
// dashboard's data, and never from an empty dataset pretending to be this one.

import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicClient, NO_KEY_ERROR } from "@/lib/ai/anthropic-client";
import { parseDashboardContext, type DashboardContext } from "@/lib/ai/dashboard-context";
import {
  buildDashboardSchemaBlock,
  isDashboardSchemaBlockCached,
  resolveDashboardDataContext,
  type DashboardDataContext,
} from "@/lib/ai/dashboard-data-context";
import { queryDashboardDataTool, runDashboardQuery, renderDashboardQueryResult } from "@/lib/ai/dashboard-query";
import { DASHBOARD_REGISTRY, dashboardMeta, type DashboardKey } from "@/lib/ai/dashboard-registry";
import {
  applyQueryToContext,
  buildContextSummaryForUI,
  buildConversationMemoryBlock,
  clearConversationContext,
  getConversationContext,
  sanitizeConversationId,
  saveConversationContext,
  suggestFollowUps,
  type QueryMemoryUpdate,
} from "@/lib/ai/conversation-context";

export const runtime = "nodejs";

// Was 1,536 — too tight on claude-opus-5, where adaptive thinking is on by
// default and shares this same budget with the tool call and the reply, so a
// non-trivial answer risked truncating mid-thought or mid-reply.
const MAX_TOKENS = 4_096;

// Hard cap on tool-calling rounds. The last allowed pass always forces a
// prose-only reply (tool_choice: "none") so a query issued on an earlier pass
// is guaranteed to be read back and answered instead of left stranded — see
// the tool_choice logic in POST below.
const MAX_TOOL_PASSES = 4;

const DASHBOARD_KEYS = DASHBOARD_REGISTRY.map((d) => d.key);

interface DashboardChatRequest {
  /**
   * Which dashboard is asking — `{ type: "builtin", dashboardKey }` or
   * `{ type: "custom", dashboardId }`. The one field that decides what data
   * this request can reach, so it is parsed, never trusted (see
   * parseDashboardContext).
   */
  dashboard?: unknown;
  /**
   * Legacy shorthand for `{ type: "builtin", dashboardKey }`. Still accepted so
   * an existing caller (or a hand-written curl from the docs) keeps working;
   * `dashboard` wins when both are present.
   */
  dashboardKey?: string;
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  /**
   * Human-readable summary of the filters currently applied on the
   * dashboard's own UI (e.g. "Plant: Pune · Category: IT & Telecom · Date:
   * 2025-01-01 to 2025-06-30"), published by that dashboard's filter
   * component via context/DashboardActiveFiltersContext.tsx. Free text by
   * design — see that file's top comment for why a plain-language summary,
   * not a structured filter object, is what's sent. Never trusted as a
   * literal query: it only ever reaches the model as prose in the system
   * prompt, the same as anything the user types.
   */
  activeFilters?: string;
  /**
   * Identifies the conversation for follow-up memory (lib/ai/conversation-context.ts)
   * — deliberately not the same thing as dashboardKey (§13 of this feature's
   * spec: a user can have multiple conversations on one dashboard, and one
   * conversation's memory now follows the user across a dashboard redirect).
   * Optional: a first-ever message from a fresh panel won't have one yet: the
   * server generates one and echoes it back in the response for the client
   * to persist. Never trusted verbatim — see sanitizeConversationId.
   */
  conversationId?: string;
  /** "New chat" clicked — wipes this conversation's stored memory before handling the message, same session-only store either way. */
  clearContext?: boolean;
  /**
   * Normalized-on-the-client text of every follow-up suggestion the user has
   * already clicked in this dashboard's persisted conversation (see
   * lib/ai/conversation-store.ts) — chat persistence + dynamic follow-ups
   * feature. Combined here with the raw `history` above (already-asked
   * questions) so suggestFollowUps() never re-offers either. Optional and
   * additive: an older client that never sends it simply gets no extra
   * exclusion, same as before this field existed.
   */
  usedSuggestions?: string[];
}

// Bounds what a client can put in front of the model as "current filters" —
// defense in depth, since this field is attacker-controlled the same way
// `message` is. The real summaries this app generates (six dashboards, see
// each one's filterSummary.ts) are well under this.
const MAX_ACTIVE_FILTERS_LENGTH = 400;

function sanitizeActiveFilters(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_ACTIVE_FILTERS_LENGTH ? trimmed.slice(0, MAX_ACTIVE_FILTERS_LENGTH) : trimmed;
}

// Same defense-in-depth reasoning as sanitizeActiveFilters above — attacker-
// controlled the same way `message` is, so both the array length and each
// entry's length are bounded before it's ever used as generator input.
const MAX_USED_SUGGESTIONS = 50;
const MAX_USED_SUGGESTION_LENGTH = 200;

function sanitizeUsedSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .slice(0, MAX_USED_SUGGESTIONS)
    .map((v) => v.slice(0, MAX_USED_SUGGESTION_LENGTH));
}

interface DashboardChatResponse {
  reply: string;
  redirect: { key: DashboardKey; label: string; route: string } | null;
  /** Set when the model called ask_with_options — clickable choices instead of free text. */
  options: string[] | null;
  /** Echoed back so the client can persist it for the next message — see DashboardChatRequest.conversationId. */
  conversationId: string;
  /** Deterministic, derived from this conversation's stored memory — null when there's nothing to suggest yet. Falls back to the client's static starter chips. */
  suggestedFollowUps: string[] | null;
  /** Compact "what I remember" for the UI's context indicator — null when there's nothing memorable yet. */
  contextSummary: string | null;
}

const REDIRECT_TOOL: Anthropic.Tool = {
  name: "redirect_to_dashboard",
  description:
    "Call this INSTEAD of answering when the user's question needs data that belongs to a different dashboard than the one you were given data for. Never guess an answer using data you don't have.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      dashboardKey: {
        type: "string",
        enum: DASHBOARD_KEYS,
        description: "Which dashboard actually covers what the user asked about.",
      },
      reason: {
        type: "string",
        description: "One short, specific sentence on why that dashboard covers it.",
      },
    },
    required: ["dashboardKey", "reason"],
    additionalProperties: false,
  },
};

const ASK_OPTIONS_TOOL: Anthropic.Tool = {
  name: "ask_with_options",
  description:
    "Call this INSTEAD of a prose question when the request is ambiguous among a small set of clear choices (which metric, which time range, etc.). Gives the user clickable choices instead of making them type a follow-up. Do not use it for yes/no confirmations or when the right next step is free text.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The short clarifying question to show the user above the choices.",
      },
      options: {
        type: "array",
        items: { type: "string" },
        description: "2 to 5 short, mutually exclusive choices the user can click instead of typing.",
      },
    },
    required: ["question", "options"],
    additionalProperties: false,
  },
};

function buildSystemPrompt(
  dataContext: DashboardDataContext,
  activeFilters: string | null,
  memoryBlock: string | null
): string {
  const isCustom = dataContext.context.type === "custom";

  // Only added when something is actually filtered — an unfiltered dashboard
  // costs this prompt nothing extra, matching the "don't pad every request
  // with metadata it doesn't need" rule the rest of this prompt already follows.
  const activeFiltersBlock = activeFilters
    ? `\nThe user currently has this filtered view open on the dashboard: ${activeFilters}\nMatch query_dashboard_data's filters to this by default, so your answer agrees with what's on screen. Depart from it only when the user's question clearly asks to look outside it (e.g. explicitly asks for the company-wide/unfiltered total, or names a different plant/category/period than what's listed above).\n`
    : "";

  // Same "only when non-empty" rule as activeFiltersBlock above — a fresh
  // conversation with nothing memorable yet costs the prompt nothing extra.
  // See lib/ai/conversation-context.ts for what this contains and why it
  // exists alongside (not instead of) the raw message history below.
  const memoryPromptBlock = memoryBlock ? `\n${memoryBlock}\n` : "";

  // Present only for the dashboards whose data it actually describes — see
  // DashboardDataContext.semanticDictionary for why a generated dashboard must
  // never be shown warehouse metric recipes.
  const dictionaryBlock = dataContext.semanticDictionary ? `\n${dataContext.semanticDictionary}\n` : "";

  // The two kinds differ in ONE sentence of framing, and it is a factual
  // difference rather than a behavioural one: the built-in dashboards are slices
  // of one shared warehouse, whereas a generated dashboard is a self-contained
  // dataset the user uploaded. Both then get the identical grounding rules
  // below, because the rule ("only this dashboard's data, only via the tool") is
  // the same rule.
  const boundaryBlock = isCustom
    ? `You have DATA ACCESS ONLY for this dashboard, via the query_dashboard_data tool. This dashboard was generated from a file the user supplied, and its records are a self-contained dataset: nothing outside the table listed below is in reach, and no other dashboard in this app shares its data. If a question needs something these columns do not contain, say so plainly — do not substitute a similar-sounding column, and do not answer from general knowledge.`
    : `You have DATA ACCESS ONLY for this dashboard, via the query_dashboard_data tool. This is a business-scope boundary, not a separate database — every built-in dashboard in this app reads the same underlying warehouse; "this dashboard's tables" below just means the slice of it relevant to this business area.`;

  // A built-in dashboard's column ids are warehouse internals a business reader
  // has never seen, so they must never reach the user's screen. A generated
  // dashboard's OWN columns are the opposite — they are the user's file headers,
  // printed on that dashboard's filter controls, so quoting one is not a leak.
  //
  // The clause both variants MUST carry is the one about the OTHER dashboards:
  // their registry descriptions name real warehouse tables and columns
  // (fact_payments, actual_dpo, ...) and are in this prompt for routing, so
  // without it the model quotes them straight into a redirect reason. That is
  // not hypothetical — it was observed on a generated dashboard the first time
  // this rule was written without it.
  const vocabularyRule = isCustom
    ? `- Use only the table and field names listed above. There are no others — a column that is not in that list does not exist in this dataset, however reasonable it would be for it to. This dashboard's own column names came from the user's own file, so naming one in your reply is fine where plain language wouldn't be clearer. The internal table and column names in the OTHER dashboards' descriptions below are NOT: never write one into anything the user reads — not your reply, not a redirect_to_dashboard reason, not an ask_with_options question or option. Describe what that dashboard covers in plain business language instead (say "payment records", not a table name; "days payable outstanding", not a column name).`
    : `- Use only the table and field names listed above. There are no others. But those exact names (fact_po_items, vendor_name, actual_dpo, and so on) are for YOUR use when calling query_dashboard_data — never write them, or any other internal table/column/schema name, into anything the user actually reads: not your reply, not a redirect_to_dashboard reason, not an ask_with_options question or option. Translate every one into plain business language instead (say "payment records", not "fact_payments"; "days payable outstanding", not "actual_dpo"; "suppliers", not "vendor_name").`;

  // The asymmetry is deliberate. Among the built-in dashboards, a same-topic
  // question usually DOES belong to a sibling, so redirecting is the right
  // default. From a generated dashboard it is the opposite: its own columns are
  // the reason the user is here, and a question that merely sounds like a
  // built-in dashboard's subject ("which suppliers are most profitable") is
  // almost always answerable from this dataset. Redirect is the last resort
  // there, never the reflex.
  const redirectRule = isCustom
    ? `- Answer from THIS dashboard's data whenever its columns can support the question, even when the topic resembles one of the other dashboards listed above. Use redirect_to_dashboard ONLY when the question is unmistakably about the app's built-in dashboards rather than this dataset — and never as a way to answer a question this dataset cannot: for that, say the information is not in this dashboard.`
    : `- If the user asks about something that belongs to one of the other dashboards listed above, do NOT answer it yourself — call redirect_to_dashboard with that dashboard's key, even if you could plausibly guess the answer.`;

  const othersBlock = isCustom
    ? `Other dashboards exist in this app, built on a DIFFERENT dataset from this one. You do NOT have their data, and their figures have nothing to do with this dashboard's — only their names and scope are listed, so that a question clearly about one of them can be pointed there with redirect_to_dashboard instead of guessed at. Answer from THIS dashboard whenever it can answer; a redirect is a last resort for a question this dataset genuinely has nothing to say about:
${dataContext.otherDashboards.map((d) => `- ${d.label} (${d.route}): ${d.description.slice(0, 200)}`).join("\n")}`
    : `Other dashboards exist in this app. You do NOT have their data — only their names and scope, so you can redirect the user there instead of guessing:
${dataContext.otherDashboards.map((d) => `- ${d.label} (${d.route}): ${d.description}`).join("\n")}`;

  return `You are the assistant embedded in the "${dataContext.label}" dashboard of a business analytics app.

${boundaryBlock}

What this dashboard is for — use this to judge whether a question belongs here at all, before reaching for a tool:
${dataContext.description}
${activeFiltersBlock}${memoryPromptBlock}
${buildDashboardSchemaBlock(dataContext)}
${dictionaryBlock}
${othersBlock}

Grounding rules — absolute:
- This is an ongoing conversation: a short message like "only Pune", "what about March", "compare with last year", or "just the top 3" is a follow-up, not a new question — keep whatever the CONVERSATION MEMORY / recent messages above already established (dashboard, metric, dimension, entity, filters) and change only the part the user actually mentioned. Resolve "them"/"that"/"the second one" the same way. Never ask the user to repeat something already known; if it genuinely can't be resolved, use ask_with_options instead of guessing.
- To state any real figure, first call query_dashboard_data and read the number off the result. Never estimate, never recall a number from an earlier turn as if it were fresh, never fabricate.
${vocabularyRule}
${redirectRule}
- If a query returns no rows, or the question needs a column that genuinely isn't listed above, say so plainly rather than softening it into an approximation. Never fill the gap from a different column, from an earlier answer, or from what you know about this subject in general.
- Ordinary conversation (greetings, thanks, what can you help with) doesn't need the tool — answer it directly and briefly.
- If the request is ambiguous among a small set of clear choices (which metric, which time range, this quarter vs. last), call ask_with_options with a short question and 2-5 concise options instead of guessing or asking an open-ended follow-up in prose.

Keep answers short and concrete — a few sentences, no preamble, no markdown headers, no raw JSON.`;
}

// Dev-only structured timing, per §17 of the AI-assistant audit: this is what
// answers "why is it slow" with the actual measured breakdown for a request
// instead of a guess — never logged in production, and never includes the
// user's message text or any query result value, only counts/durations.
const DEBUG_TIMING = process.env.NODE_ENV !== "production";

interface RequestTiming {
  requestId: string;
  /** "builtin:<key>" / "custom:<id>" — the dashboard this request was answered for, and nothing else could have been. */
  dashboard: string;
  model: string;
  contextCacheHit: boolean;
  hasActiveFilters: boolean;
  hasConversationMemory: boolean;
  dataVersion: string;
  promptConstructionMs: number;
  llmRounds: number;
  toolCalls: number;
  queryCacheHits: number;
  claudeLatencyMs: number;
  queryExecutionMs: number;
  rowsProcessed: number;
  rowsReturned: number;
  totalLatencyMs: number;
  outcome: "ok" | "redirect" | "options" | "error";
}

function logTiming(t: RequestTiming): void {
  if (!DEBUG_TIMING) return;
  console.debug("[dashboard-chat]", JSON.stringify(t));
}

export async function POST(request: Request): Promise<Response> {
  const requestStartedAt = performance.now();
  const requestId = randomUUID();

  let body: DashboardChatRequest;
  try {
    body = (await request.json()) as DashboardChatRequest;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  // ONE resolution step, before anything else happens. Everything downstream
  // reads `dataContext` and cannot widen it, which is what makes "answers only
  // from the dashboard the user is on" a property of the code rather than a
  // promise in a prompt.
  const dashboardContext: DashboardContext | null =
    parseDashboardContext(body.dashboard) ??
    parseDashboardContext(
      typeof body.dashboardKey === "string" ? { type: "builtin", dashboardKey: body.dashboardKey } : null
    );
  if (!dashboardContext) {
    return Response.json(
      {
        error: `dashboard must be { type: "builtin", dashboardKey: one of ${DASHBOARD_KEYS.join(" | ")} } or { type: "custom", dashboardId }`,
      },
      { status: 400 }
    );
  }

  const dataContext = resolveDashboardDataContext(dashboardContext);
  if (!dataContext) {
    // Only reachable for a generated dashboard this process holds no snapshot
    // for. Deliberately NOT a fallback to some other dashboard and not an empty
    // dataset — the client re-registers it (/api/dashboard-context) and retries.
    return Response.json(
      {
        error: "This dashboard's data isn't loaded on the server yet.",
        needsDashboardSync: true,
      },
      { status: 409 }
    );
  }

  const conversationId = sanitizeConversationId(body.conversationId, randomUUID);
  if (body.clearContext) clearConversationContext(conversationId);

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return Response.json({ error: "A non-empty `message` is required." }, { status: 400 });
  }

  const resolved = resolveAnthropicClient();
  if (!resolved) {
    return Response.json({ error: NO_KEY_ERROR }, { status: 503 });
  }
  const { client, model } = resolved;

  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const messages: Anthropic.MessageParam[] = [
    ...history
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  const activeFilters = sanitizeActiveFilters(body.activeFilters);
  const usedSuggestions = sanitizeUsedSuggestions(body.usedSuggestions);
  // suggestFollowUps() must never re-offer a question already asked (in this
  // turn or an earlier one) or already clicked as a suggestion — combines the
  // history this request already carries (so no extra payload for that part)
  // with the explicit usedSuggestions list, which covers a clicked suggestion
  // older than the last-10-turn history window would otherwise drop.
  const excludedFollowUps = [
    ...history.filter((m) => m.role === "user" && typeof m.content === "string").map((m) => m.content),
    message,
    ...usedSuggestions,
  ];

  // Both the tool schema and the schema block are memoized per dashboard+version
  // (lib/ai/dashboard-query.ts, lib/ai/dashboard-data-context.ts) — the check
  // here is only to report whether *this* request paid the describeSchema()
  // cost, for the debug line below; it has no effect on behavior.
  const contextCacheHitBeforeBuild = isDashboardSchemaBlockCached(dataContext);
  const promptStartedAt = performance.now();
  // Cheap in-memory lookup (lib/ai/conversation-context.ts) — not the
  // describeSchema() cost the cache check above is about, just folded into
  // the same "prompt construction" timing bucket since it happens at the
  // same phase of the request.
  let conversationContext = getConversationContext(conversationId);
  const memoryBlock = buildConversationMemoryBlock(conversationContext, dataContext.contextId);
  // Built ONCE per request, not once per tool-calling pass: neither the
  // dashboard nor activeFilters/memoryBlock changes mid-request, so
  // re-deriving byte-identical system prompt text on every pass (previously
  // up to MAX_TOOL_PASSES times) was pure waste even with the per-dashboard
  // memoization above. Note activeFilters/memoryBlock (unlike the memoized
  // parts of the prompt) do vary request-to-request — Anthropic's own
  // ephemeral prompt cache still hits across consecutive messages sent with
  // the same filters/memory, and only misses when either actually changed,
  // which is exactly when the model needs the fresh text anyway.
  const systemPrompt = buildSystemPrompt(dataContext, activeFilters, memoryBlock);
  const tools: Anthropic.Tool[] = [queryDashboardDataTool(dataContext), REDIRECT_TOOL, ASK_OPTIONS_TOOL];
  const promptConstructionMs = performance.now() - promptStartedAt;

  let claudeLatencyMs = 0;
  let queryExecutionMs = 0;
  let toolCallCount = 0;
  let queryCacheHitCount = 0;
  let lastSuccessfulQuery: QueryMemoryUpdate | null = null;
  let rowsProcessed = 0;
  let rowsReturned = 0;
  let llmRounds = 0;

  const finishTiming = (outcome: RequestTiming["outcome"]) =>
    logTiming({
      requestId,
      dashboard: dataContext.contextId,
      model,
      contextCacheHit: contextCacheHitBeforeBuild,
      hasActiveFilters: activeFilters !== null,
      hasConversationMemory: memoryBlock !== null,
      dataVersion: dataContext.dataVersion,
      promptConstructionMs: round2(promptConstructionMs),
      llmRounds,
      toolCalls: toolCallCount,
      queryCacheHits: queryCacheHitCount,
      claudeLatencyMs: round2(claudeLatencyMs),
      queryExecutionMs: round2(queryExecutionMs),
      rowsProcessed,
      rowsReturned,
      totalLatencyMs: round2(performance.now() - requestStartedAt),
      outcome,
    });

  try {
    let reply = "";
    let redirect: DashboardChatResponse["redirect"] = null;
    let options: DashboardChatResponse["options"] = null;

    // Up to MAX_TOOL_PASSES rounds: the model may query this dashboard's data
    // across several passes, but the last pass always forces a prose-only
    // reply so a query issued on an earlier pass is guaranteed to be read back
    // and answered instead of left stranded when the pass budget runs out.
    // Mirrors the loop app/api/assistant/route.ts uses for the warehouse.
    for (let pass = 0; pass < MAX_TOOL_PASSES; pass += 1) {
      llmRounds += 1;
      const forceProseOnly = pass === MAX_TOOL_PASSES - 1;
      const claudeCallStartedAt = performance.now();
      const response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        tool_choice: forceProseOnly ? { type: "none" } : { type: "auto" },
        messages,
      });
      claudeLatencyMs += performance.now() - claudeCallStartedAt;

      if (response.stop_reason === "refusal") {
        finishTiming("error");
        return Response.json({ error: "The assistant declined to answer that request." }, { status: 422 });
      }
      if (response.stop_reason === "max_tokens") {
        finishTiming("error");
        return Response.json(
          { error: "The response was too long to complete. Try a narrower or more specific question." },
          { status: 502 }
        );
      }

      // Reset per pass, not accumulated across passes: when a query comes
      // back empty or wrong, the model sometimes narrates its own
      // troubleshooting ("let me check the date range instead...") in a text
      // block on an intermediate pass. Concatenating that into the final
      // reply would show the user a debugging transcript instead of an
      // answer — only the pass that actually stops (no further query calls)
      // should be what they see.
      reply = "";
      const queryCalls: Anthropic.ToolUseBlock[] = [];
      for (const block of response.content) {
        if (block.type === "text") {
          reply += block.text;
        } else if (block.type === "tool_use" && block.name === "query_dashboard_data") {
          queryCalls.push(block);
        } else if (block.type === "tool_use" && block.name === "redirect_to_dashboard") {
          const input = block.input as { dashboardKey: string; reason: string };
          if (DASHBOARD_KEYS.includes(input.dashboardKey as DashboardKey)) {
            const meta = dashboardMeta(input.dashboardKey as DashboardKey);
            redirect = { key: meta.key, label: meta.label, route: meta.route };
            if (!reply.trim()) reply = `That's on the ${meta.label} dashboard — ${input.reason}`;
          }
        } else if (block.type === "tool_use" && block.name === "ask_with_options") {
          const input = block.input as { question: string; options: string[] };
          const choices = Array.isArray(input.options)
            ? input.options.filter((o): o is string => typeof o === "string" && o.trim() !== "").slice(0, 5)
            : [];
          if (choices.length >= 2) {
            options = choices;
            if (!reply.trim()) reply = input.question;
          }
        }
      }

      if (queryCalls.length === 0) break;

      toolCallCount += queryCalls.length;

      // Execute every query concurrently through the same engine that backs
      // it end to end, so a query the model composed is validated before it's
      // ever answered from. Promise.all preserves the input order in its
      // resolved array regardless of completion timing, which is required
      // here — each result must land on the tool_use_id of the call that
      // produced it.
      messages.push({ role: "assistant", content: response.content });
      const queryStartedAt = performance.now();
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        queryCalls.map(async (call) => {
          const outcome = runDashboardQuery(dataContext, call.input as Record<string, unknown>);
          if (outcome.cacheHit) queryCacheHitCount += 1;
          rowsProcessed += outcome.result.matchedRows;
          rowsReturned += outcome.result.groups?.length ?? outcome.result.rows?.length ?? (outcome.result.value !== undefined ? 1 : 0);
          // Tracks the LAST successful query across every pass in this
          // request (queryCalls is processed in order and this keeps
          // overwriting), so a failed attempt earlier in the same pass never
          // overwrites memory with something the model itself discarded —
          // folded into conversation memory once the whole loop finishes.
          if (!outcome.error) {
            lastSuccessfulQuery = { table: outcome.table, spec: outcome.spec, result: outcome.result };
          }
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            is_error: outcome.error !== undefined,
            content: renderDashboardQueryResult(outcome),
          };
        })
      );
      queryExecutionMs += performance.now() - queryStartedAt;
      messages.push({ role: "user", content: results });
    }

    // Fold this turn's query into the conversation's stored memory —
    // dashboard-scoped (see applyQueryToContext's doc comment on why a
    // redirect never carries a stale query shape into the destination
    // dashboard), entities global. Saved even when nothing new happened
    // this turn (a pure-conversation message, or a redirect with no query),
    // so the TTL refreshes and an active conversation's memory doesn't
    // expire out from under it.
    conversationContext = lastSuccessfulQuery
      ? applyQueryToContext(conversationContext, dataContext.contextId, lastSuccessfulQuery)
      : conversationContext;
    saveConversationContext(conversationContext);

    const payload: DashboardChatResponse = {
      reply: reply.trim() || "I don't have an answer for that.",
      redirect,
      options,
      conversationId,
      suggestedFollowUps: suggestFollowUps(conversationContext, dataContext.contextId, excludedFollowUps),
      contextSummary: buildContextSummaryForUI(conversationContext, dataContext.contextId),
    };
    finishTiming(redirect ? "redirect" : options ? "options" : "ok");
    return Response.json(payload);
  } catch (err) {
    finishTiming("error");
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Anthropic rejected the API key." }, { status: 401 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Rate limited by Anthropic — try again shortly." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return Response.json({ error: "Could not reach the Anthropic API." }, { status: 502 });
    }
    if (err instanceof Anthropic.APIError) {
      // The SDK's own message can carry raw upstream response detail — logged
      // for our own debugging (correlate with requestId), never forwarded
      // verbatim to the user. Same "no internal implementation detail in
      // user-facing text" rule the system prompt now enforces on the model's
      // own replies applies here too — an error message is user-facing text.
      console.error(`[dashboard-chat:${requestId}] Anthropic API error:`, err.message);
      return Response.json({ error: "The AI service returned an error. Please try again shortly." }, { status: 502 });
    }
    console.error(`[dashboard-chat:${requestId}] Unexpected error:`, err);
    return Response.json({ error: "Something went wrong answering that. Please try again." }, { status: 500 });
  }
}

function round2(ms: number): number {
  return Math.round(ms * 100) / 100;
}
