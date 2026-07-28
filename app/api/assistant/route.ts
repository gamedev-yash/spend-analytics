// Procurement BI Assistant endpoint.
//
// Two modes over one Claude call:
//   "chat"  — answers questions about the active dataset, and may volunteer a
//             widget when the user actually asked for a chart.
//   "parse" — forces the create_widget tool so a natural-language request like
//             "bar chart of top 10 vendors by net spend" comes back as a
//             validated WidgetConfig.
//
// The model never sees raw rows — only the inferred ColumnMeta plus summary
// statistics the client computed. That keeps payloads small and answers
// grounded in the user's real uploaded data rather than invented numbers.

import Anthropic from "@anthropic-ai/sdk";
import { CHART_TYPE_LABELS } from "@/types/custom-dashboard";
import type { Aggregation, ChartType, WidgetConfig } from "@/types/custom-dashboard";
import type {
  AssistantRequest,
  AssistantResponse,
  DatasetContext,
} from "@/types/assistant";

export const runtime = "nodejs";

/** Claude model powering the assistant. */
const MODEL = "claude-opus-5";
const MAX_TOKENS = 8_000;

const SYSTEM_PROMPT = `You are the Procurement BI Assistant embedded in a Vedanta spend-analytics dashboard app.

You help procurement analysts understand their uploaded spend data and build dashboard widgets from it.

Grounding rules — these are absolute:
- Answer ONLY from the dataset context provided in the user message. It lists the real columns (with inferred types and distinct counts) and summary statistics for the user's currently active CSV.
- Never invent column names, row counts, or figures. If a number isn't in the provided statistics and can't be derived from them, say what you'd need instead of guessing.
- If no dataset is attached, say so plainly and tell the user to upload a CSV.
- Cite the actual column names when you reference them.

When the user asks for a chart, table, or KPI, call the create_widget tool with columns that exist in the dataset. Pick the aggregation that makes the metric meaningful: sum for money and countable quantities, avg for rates/percentages/durations (summing "paid days" across invoices is meaningless), count when no measure applies. Use limit for "top N" requests.

Keep prose answers short and concrete — a few sentences, no preamble, no markdown headers.`;

/** Tool schema mirrors WidgetConfig (minus the client-assigned id). */
const CREATE_WIDGET_TOOL: Anthropic.Tool = {
  name: "create_widget",
  description:
    "Create a dashboard widget from the active dataset. Call this whenever the user asks to see, add, plot, chart, or visualize something.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short human-readable widget title." },
      chartType: {
        type: "string",
        enum: Object.keys(CHART_TYPE_LABELS),
        description: "kpi for a single number; table for a detail list; otherwise the chart form.",
      },
      xAxisColumn: {
        type: ["string", "null"],
        description: "Grouping column id (a category or date column). Omit/null for kpi.",
      },
      yAxisColumn: {
        type: ["string", "null"],
        description: "Metric column id (a numeric column). Omit/null when aggregation is count.",
      },
      aggregation: {
        type: ["string", "null"],
        enum: ["sum", "avg", "count", "distinct", null],
        description: "How to aggregate the metric column.",
      },
      limit: {
        type: ["integer", "null"],
        description: "Top-N cap for grouped charts, e.g. 10 for 'top 10 vendors'.",
      },
      gridSpan: {
        type: ["integer", "null"],
        enum: [1, 2, null],
        description: "1 = half width (default), 2 = full width. Use 2 for line trends and tables.",
      },
    },
    required: ["title", "chartType", "xAxisColumn", "yAxisColumn", "aggregation", "limit", "gridSpan"],
    additionalProperties: false,
  },
};

/** Compact, token-cheap rendering of the dataset the model must reason over. */
function renderDatasetContext(dataset: DatasetContext | null | undefined): string {
  if (!dataset) {
    return "DATASET CONTEXT: none — the user has not uploaded/selected a CSV for this page yet.";
  }
  const statsById = new Map(dataset.stats.map((s) => [s.id, s]));
  const lines = dataset.columns.map((column) => {
    const stat = statsById.get(column.id);
    const parts = [`- ${column.id} (${column.type}, ${column.distinctCount} distinct`];
    if (stat?.min !== undefined && stat?.max !== undefined) {
      parts.push(`, min ${stat.min}, max ${stat.max}`);
    }
    if (stat?.sum !== undefined) parts.push(`, sum ${stat.sum}`);
    if (stat?.avg !== undefined) parts.push(`, avg ${Math.round(stat.avg * 100) / 100}`);
    parts.push(")");
    if (stat?.sampleValues?.length) parts.push(` e.g. ${stat.sampleValues.join(", ")}`);
    return parts.join("");
  });
  return [
    `DATASET CONTEXT — "${dataset.name}", ${dataset.rowCount.toLocaleString("en-IN")} rows.`,
    "Columns:",
    ...lines,
  ].join("\n");
}

function resolveClient(): Anthropic | null {
  const apiKey = process.env.AZURE_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  // AZURE_ENDPOINT lets the deployment route through an Azure-hosted gateway
  // that speaks the Anthropic Messages API; unset = Anthropic's own API.
  const baseURL = process.env.AZURE_ENDPOINT || undefined;
  return new Anthropic({ apiKey, baseURL });
}

const AGGREGATIONS: Aggregation[] = ["sum", "avg", "count", "distinct"];

/**
 * The one place a tool-call payload becomes a widget the app will accept.
 * `strict: true` already guarantees the shape, so this only normalizes the
 * nullable fields (the schema uses null rather than omission) and rejects an
 * unknown chart type.
 */
function toWidget(input: Record<string, unknown>): Omit<WidgetConfig, "id"> | null {
  const chartType = input.chartType;
  if (typeof chartType !== "string" || !(chartType in CHART_TYPE_LABELS)) return null;

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() !== "" ? v : undefined;

  return {
    title: str(input.title)?.trim() ?? "New widget",
    chartType: chartType as ChartType,
    xAxisColumn: str(input.xAxisColumn),
    yAxisColumn: str(input.yAxisColumn),
    aggregation: AGGREGATIONS.find((a) => a === input.aggregation),
    limit:
      typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
        ? Math.floor(input.limit)
        : undefined,
    gridSpan: input.gridSpan === 1 || input.gridSpan === 2 ? input.gridSpan : undefined,
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: AssistantRequest;
  try {
    body = (await request.json()) as AssistantRequest;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return Response.json({ error: "A non-empty `message` is required." }, { status: 400 });
  }
  const mode = body.mode === "parse" ? "parse" : "chat";

  const client = resolveClient();
  if (!client) {
    return Response.json(
      {
        error:
          "The AI Assistant needs an API key. Set AZURE_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY in the server environment (optionally AZURE_ENDPOINT for a gateway), then restart the dev server.",
      },
      { status: 503 }
    );
  }

  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const messages: Anthropic.MessageParam[] = [
    ...history
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user" as const,
      content: `${renderDatasetContext(body.dataset)}\n\n---\n\nUSER: ${message}`,
    },
  ];

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [CREATE_WIDGET_TOOL],
      // "parse" must produce a widget; "chat" decides for itself.
      tool_choice: mode === "parse" ? { type: "tool", name: "create_widget" } : { type: "auto" },
      messages,
    });

    if (response.stop_reason === "refusal") {
      return Response.json(
        { error: "The assistant declined to answer that request." },
        { status: 422 }
      );
    }

    let reply = "";
    let widget: AssistantResponse["widget"] = null;
    for (const block of response.content) {
      if (block.type === "text") {
        reply += block.text;
      } else if (block.type === "tool_use" && block.name === "create_widget") {
        widget = toWidget(block.input as Record<string, unknown>);
      }
    }

    if (mode === "parse" && !widget) {
      return Response.json(
        { error: "I couldn't turn that into a chart. Try naming a column and a chart type." },
        { status: 422 }
      );
    }

    const payload: AssistantResponse = {
      reply: reply.trim() || (widget ? `Added "${widget.title}".` : ""),
      widget,
    };
    return Response.json(payload);
  } catch (err) {
    // Typed SDK errors → useful status codes instead of a blanket 500.
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
