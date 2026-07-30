// Per-dashboard grounded assistant for the four real Vedanta dashboards
// (Spend Overview, Payment Terms, Tail Spend, Supplier Fragmentation).
//
// Unlike /api/assistant (which answers from a user-uploaded CSV), this
// endpoint is handed exactly one dashboard's own real, current data — never
// another dashboard's — and is told the names of the other three purely so
// it can redirect, never so it can answer from them. If the question needs
// data this dashboard doesn't have, the model calls redirect_to_dashboard
// instead of guessing; that tool call is structural, not prose, so the UI
// can render a real link rather than parsing free text for a dashboard name.

import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicClient, NO_KEY_ERROR } from "@/lib/ai/anthropic-client";
import { buildDashboardContext } from "@/lib/ai/dashboard-context";
import { DASHBOARD_REGISTRY, dashboardMeta, type DashboardKey } from "@/lib/ai/dashboard-registry";

export const runtime = "nodejs";

const MAX_TOKENS = 1_024;
const DASHBOARD_KEYS = DASHBOARD_REGISTRY.map((d) => d.key);

interface DashboardChatRequest {
  dashboardKey?: string;
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

interface DashboardChatResponse {
  reply: string;
  redirect: { key: DashboardKey; label: string; route: string } | null;
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

function buildSystemPrompt(currentKey: DashboardKey): string {
  const current = dashboardMeta(currentKey);
  const others = DASHBOARD_REGISTRY.filter((d) => d.key !== currentKey);

  return `You are the assistant embedded in the "${current.label}" dashboard of a Vedanta procurement analytics app.

You have DATA ACCESS ONLY for this dashboard. Its current real data:
${buildDashboardContext(currentKey)}

Other dashboards exist in this app. You do NOT have their data — only their names and scope, so you can redirect the user there instead of guessing:
${others.map((d) => `- ${d.label} (${d.route}): ${d.description}`).join("\n")}

Grounding rules — absolute:
- Answer ONLY from the "${current.label}" data given above. Never invent a number that isn't there.
- If the user asks about something that belongs to one of the other dashboards listed above, do NOT answer it yourself — call redirect_to_dashboard with that dashboard's key, even if you could plausibly guess the answer.
- If the question is about this dashboard but the specific figure isn't in the data provided, say what you don't have rather than estimating.
- Ordinary conversation (greetings, thanks, what can you help with) doesn't need the tool — answer it directly and briefly.

Keep answers short and concrete — a few sentences, no preamble, no markdown headers.`;
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

  try {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(dashboardKey as DashboardKey),
      tools: [REDIRECT_TOOL],
      tool_choice: { type: "auto" },
      messages,
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "The assistant declined to answer that request." }, { status: 422 });
    }

    let reply = "";
    let redirect: DashboardChatResponse["redirect"] = null;
    for (const block of response.content) {
      if (block.type === "text") {
        reply += block.text;
      } else if (block.type === "tool_use" && block.name === "redirect_to_dashboard") {
        const input = block.input as { dashboardKey: string; reason: string };
        if (DASHBOARD_KEYS.includes(input.dashboardKey as DashboardKey)) {
          const meta = dashboardMeta(input.dashboardKey as DashboardKey);
          redirect = { key: meta.key, label: meta.label, route: meta.route };
          if (!reply.trim()) reply = `That's on the ${meta.label} dashboard — ${input.reason}`;
        }
      }
    }

    const payload: DashboardChatResponse = { reply: reply.trim() || "I don't have an answer for that.", redirect };
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
