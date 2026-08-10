// Per-dashboard grounded assistant for the real Vedanta dashboards registered
// in lib/ai/dashboard-registry.ts (Spend Overview, Compliance, Payment Terms,
// Tail Spend, Supplier Fragmentation, Single Source Risk, and any dashboard
// added there later).
//
// Unlike /api/assistant (which answers from a user-uploaded CSV), this
// endpoint is handed exactly one dashboard's own real, current data — never
// another dashboard's — and is told the names of the others purely so it
// can redirect, never so it can answer from them. If the question needs data
// this dashboard doesn't have, the model calls redirect_to_dashboard instead
// of guessing; that tool call is structural, not prose, so the UI can render
// a real link rather than parsing free text for a dashboard name.
//
// The model does not answer from a hardcoded summary. It is shown this
// dashboard's real column/table schema (buildDashboardContext) and must call
// query_dashboard_data to get an actual number back before stating one —
// the same two-pass "query, then answer" loop app/api/assistant/route.ts
// uses for the warehouse, just scoped to one dashboard's own tables
// (lib/ai/dashboard-tables.ts, lib/ai/dashboard-query.ts).

import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicClient, NO_KEY_ERROR } from "@/lib/ai/anthropic-client";
import { buildDashboardContext } from "@/lib/ai/dashboard-context";
import { queryDashboardDataTool, runDashboardQuery, renderDashboardQueryResult } from "@/lib/ai/dashboard-query";
import { DASHBOARD_REGISTRY, dashboardMeta, type DashboardKey } from "@/lib/ai/dashboard-registry";

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
  dashboardKey?: string;
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

interface DashboardChatResponse {
  reply: string;
  redirect: { key: DashboardKey; label: string; route: string } | null;
  /** Set when the model called ask_with_options — clickable choices instead of free text. */
  options: string[] | null;
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

// Named business metrics with their exact computation recipe, so the model
// looks a term up instead of inventing its own interpretation of it. Every
// entry names the table it needs — "you have DATA ACCESS ONLY for this
// dashboard" below still governs whether that table is actually in reach
// here; a metric that needs a table this dashboard doesn't carry is a signal
// to redirect, not to approximate from whatever tables are available.
const SEMANTIC_METRIC_DICTIONARY = `SEMANTIC METRIC DICTIONARY — how to compute named business metrics, when the tables above carry what they need:
- Off-contract / off-PO spend: fact_po_items rows where is_contract_backed = 0 (committed spend not against a standing agreement), or fact_invoices rows where po_number is blank ("maverick" spend — not tied to any purchase order).
- Maverick spend %: count(fact_invoices where po_number is blank) ÷ count(fact_invoices) × 100.
- DPO (Days Payable Outstanding): fact_payments.actual_dpo — already computed per document as clearing_date − baseline_date. Never recompute it from other date fields.
- Discount capture rate: fact_payments.discount_captured_inr ÷ discount_available_inr × 100 — only meaningful where discount_available_inr > 0.
- Tail spend: agg_vendor_annual rows where is_tail = true (equivalently cumulative_spend_pct > 80 for that vendor's year) — vendors past the 80th percentile of cumulative spend.
- Pareto / 80-20 concentration: agg_vendor_annual.spend_rank and cumulative_spend_pct are precomputed per vendor per year — read them directly rather than re-ranking vendors yourself from fact_po_items when this table is available.
- Single-source / concentration risk for a category: count DISTINCT vendor_id in fact_po_items grouped by category — a category at or below the user's stated supplier-count threshold is "at risk."
- Contract coverage: dim_contract rows where is_active = true, grouped by vendor/category/plant — contract_value_inr is the committed value, not actual spend against it.
- Supplier fragmentation for a category: count DISTINCT vendor_id in fact_po_items per category — a high count relative to spend suggests consolidation potential.

Amounts in columns ending _inr are Indian rupees — report them in Cr (10,000,000) or L (100,000), matching how the dashboards themselves display money. "top N" means sort descending on the aggregated value and cap at N.

For context, the full warehouse behind this app has seven tables total (fact_po_items, fact_invoices, fact_payments, agg_vendor_annual, dim_contract, dim_material, dim_payment_terms) — this dashboard's own tables, listed above, are the slice of that warehouse actually in reach here.`;

function buildSystemPrompt(currentKey: DashboardKey): string {
  const current = dashboardMeta(currentKey);
  const others = DASHBOARD_REGISTRY.filter((d) => d.key !== currentKey);

  return `You are the assistant embedded in the "${current.label}" dashboard of a Vedanta procurement analytics app.

You have DATA ACCESS ONLY for this dashboard, via the query_dashboard_data tool.

${buildDashboardContext(currentKey)}

${SEMANTIC_METRIC_DICTIONARY}

Other dashboards exist in this app. You do NOT have their data — only their names and scope, so you can redirect the user there instead of guessing:
${others.map((d) => `- ${d.label} (${d.route}): ${d.description}`).join("\n")}

Grounding rules — absolute:
- To state any real figure, first call query_dashboard_data and read the number off the result. Never estimate, never recall a number from an earlier turn as if it were fresh, never fabricate.
- Use only the table and field names listed above. There are no others.
- If the user asks about something that belongs to one of the other dashboards listed above, do NOT answer it yourself — call redirect_to_dashboard with that dashboard's key, even if you could plausibly guess the answer.
- If a query returns no rows, or the question needs a column that genuinely isn't listed above, say so plainly rather than softening it into an approximation.
- Ordinary conversation (greetings, thanks, what can you help with) doesn't need the tool — answer it directly and briefly.
- If the request is ambiguous among a small set of clear choices (which metric, which time range, this quarter vs. last), call ask_with_options with a short question and 2-5 concise options instead of guessing or asking an open-ended follow-up in prose.

Keep answers short and concrete — a few sentences, no preamble, no markdown headers, no raw JSON.`;
}

export async function POST(request: Request): Promise<Response> {
  let body: DashboardChatRequest;
  try {
    body = (await request.json()) as DashboardChatRequest;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const dashboardKey = body.dashboardKey;
  if (!dashboardKey || !DASHBOARD_KEYS.includes(dashboardKey as DashboardKey)) {
    return Response.json(
      { error: `dashboardKey must be one of: ${DASHBOARD_KEYS.join(", ")}` },
      { status: 400 }
    );
  }

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

  const tools: Anthropic.Tool[] = [
    queryDashboardDataTool(dashboardKey as DashboardKey),
    REDIRECT_TOOL,
    ASK_OPTIONS_TOOL,
  ];

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
      const forceProseOnly = pass === MAX_TOOL_PASSES - 1;
      const response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: "text",
            text: buildSystemPrompt(dashboardKey as DashboardKey),
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        tool_choice: forceProseOnly ? { type: "none" } : { type: "auto" },
        messages,
      });

      if (response.stop_reason === "refusal") {
        return Response.json({ error: "The assistant declined to answer that request." }, { status: 422 });
      }
      if (response.stop_reason === "max_tokens") {
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

      // Execute every query concurrently through the same engine that backs
      // it end to end, so a query the model composed is validated before it's
      // ever answered from. Promise.all preserves the input order in its
      // resolved array regardless of completion timing, which is required
      // here — each result must land on the tool_use_id of the call that
      // produced it.
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        queryCalls.map(async (call) => {
          const outcome = runDashboardQuery(dashboardKey as DashboardKey, call.input as Record<string, unknown>);
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

    const payload: DashboardChatResponse = {
      reply: reply.trim() || "I don't have an answer for that.",
      redirect,
      options,
    };
    return Response.json(payload);
  } catch (err) {
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
      return Response.json({ error: `Anthropic API error: ${err.message}` }, { status: 502 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "Unexpected assistant error." },
      { status: 500 }
    );
  }
}
