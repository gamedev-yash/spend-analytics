// Procurement BI Assistant endpoint.
//
// Two modes over one Claude call:
//   "chat"  — answers questions about the active dataset, and may volunteer a
//             widget when the user actually asked for a chart.
//   "parse" — forces the create_widget tool so a natural-language request like
//             "bar chart of top 10 vendors by net spend" comes back as a
//             validated WidgetConfig.
//
// Two grounding strategies, picked by which dataset is in play:
//
//   Uploaded CSV — the model never sees raw rows, only inferred ColumnMeta plus
//   summary statistics the client computed. Cheap, and enough to answer from.
//
//   Warehouse (registryDatasetId set) — statistics would be useless, since the
//   rows are not in the browser. Instead the model composes a QueryPayload with
//   query_warehouse, the route executes it through the same engine
//   /api/v1/query uses, and the resulting rows are fed back for it to answer
//   from. Its prose is therefore grounded in a query that actually ran.

import Anthropic from "@anthropic-ai/sdk";
import { CHART_TYPE_LABELS } from "@/types/custom-dashboard";
import { getDataset } from "@/lib/server/metadata-registry";
import { buildAndExecuteQuery } from "@/lib/server/query-engine";
import { QueryValidationError } from "@/lib/server/query-builder";
import {
  createWidgetTool,
  queryWarehouseTool,
  renderQueryResult,
  renderRegistryContext,
  toQueryPayload,
} from "@/lib/server/assistant-tools";
import type { Aggregation, ChartType, WidgetConfig } from "@/types/custom-dashboard";
import type {
  AssistantQuery,
  AssistantRequest,
  AssistantResponse,
  DatasetContext,
} from "@/types/assistant";

export const runtime = "nodejs";

/**
 * Claude model powering the assistant. Overridable so an Azure AI Foundry
 * deployment (identified by a deployment name, not an Anthropic model id) can
 * point at itself without a code change.
 */
const MODEL = process.env.AZURE_FOUNDRY_MODEL || "claude-opus-5";
const MAX_TOKENS = 8_000;

const CSV_SYSTEM_PROMPT = `You are the Procurement BI Assistant embedded in a Vedanta spend-analytics dashboard app.

You help procurement analysts understand their uploaded spend data and build dashboard widgets from it.

Grounding rules — these are absolute:
- Answer ONLY from the dataset context provided in the user message. It lists the real columns (with inferred types and distinct counts) and summary statistics for the user's currently active CSV.
- Never invent column names, row counts, or figures. If a number isn't in the provided statistics and can't be derived from them, say what you'd need instead of guessing.
- If no dataset is attached, say so plainly and tell the user to upload a CSV.
- Cite the actual column names when you reference them.

When the user asks for a chart, table, or KPI, call the create_widget tool with columns that exist in the dataset. Pick the aggregation that makes the metric meaningful: sum for money and countable quantities, avg for rates/percentages/durations (summing "paid days" across invoices is meaningless), count when no measure applies. Use limit for "top N" requests.

Keep prose answers short and concrete — a few sentences, no preamble, no markdown headers.`;

const WAREHOUSE_SYSTEM_PROMPT = `You are the Procurement BI Assistant embedded in a Vedanta spend-analytics dashboard app, connected to a spend data warehouse.

Grounding rules — these are absolute:
- To state any figure, first call query_warehouse and read the number off the result. Never estimate, never recall a figure from a previous turn as if it were fresh, never fabricate.
- Use only the column names in the schema block below. There are no others.
- If a question needs data the schema does not carry, say exactly which column is missing instead of substituting a proxy.
- If a query returns no rows, say so — do not soften it into an approximation.
- The warehouse holds a fixed window of history. If the user asks about a period the data does not cover, query it, report that it is empty, and say which periods do have data.

Choosing the query:
- fact_po_items is committed spend (purchase orders). fact_invoices is actual spend (supplier invoices). Pick the one the question is about; say which you used.
- Amounts in columns ending _inr are Indian rupees. Report them in Cr (10,000,000) or L (100,000) as the dashboards do.
- "top N" means a descending sort on the measure alias plus limit N.
- timeGrain "year" buckets by the Indian fiscal year (April-March), so FY2025-26 covers April 2025 to March 2026.

When the user asks to see, add, plot, chart, or visualize something, also call create_widget so it lands on their canvas. Query first, so your prose matches the widget.

Keep prose answers short and concrete — a few sentences, no preamble, no markdown headers.`;

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

/**
 * Credentials, in priority order: an Azure-hosted Anthropic gateway, direct
 * Anthropic, then Azure AI Foundry — so an existing AZURE_ANTHROPIC_API_KEY or
 * ANTHROPIC_API_KEY deployment is untouched by adding Foundry variables
 * alongside it, and a Foundry-only environment still works.
 *
 * AZURE_FOUNDRY_API_VERSION is assumed to be a REST query parameter, the same
 * contract Azure OpenAI uses — appended as `?api-version=...` on every request.
 * If your Foundry deployment expects it somewhere else (a header, the URL
 * path), adjust the `defaultQuery` line below accordingly.
 */
function resolveClient(): Anthropic | null {
  const apiKey =
    process.env.AZURE_ANTHROPIC_API_KEY ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.AZURE_FOUNDRY_API_KEY;
  if (!apiKey) return null;

  // AZURE_ENDPOINT / AZURE_FOUNDRY_ENDPOINT route through an Azure-hosted
  // gateway that speaks the Anthropic Messages API; unset = Anthropic's own API.
  const baseURL = process.env.AZURE_ENDPOINT || process.env.AZURE_FOUNDRY_ENDPOINT || undefined;

  const apiVersion = process.env.AZURE_FOUNDRY_API_VERSION;
  const defaultQuery = apiVersion ? { "api-version": apiVersion } : undefined;

  return new Anthropic({ apiKey, baseURL, defaultQuery });
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

/**
 * Run one query_warehouse call. A rejected payload is not an error to the caller
 * — it is fed back to the model as a tool_result so it can correct itself, which
 * is why the failure is captured rather than thrown.
 */
async function runAssistantQuery(input: Record<string, unknown>): Promise<AssistantQuery> {
  const payload = toQueryPayload(input);
  try {
    const { source, ...result } = await buildAndExecuteQuery(payload);
    return { payload, result, source };
  } catch (err) {
    const error =
      err instanceof QueryValidationError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Query failed.";
    return { payload, result: { rows: [] }, source: "none", error };
  }
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

  // Warehouse mode when the client names a registry dataset; otherwise the
  // original uploaded-CSV behaviour, unchanged.
  const registryDatasetId =
    typeof body.registryDatasetId === "string" && getDataset(body.registryDatasetId)
      ? body.registryDatasetId
      : null;
  const warehouseMode = registryDatasetId !== null;

  const context = warehouseMode
    ? renderRegistryContext(registryDatasetId)
    : renderDatasetContext(body.dataset);

  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const messages: Anthropic.MessageParam[] = [
    ...history
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user" as const,
      content: `${context}\n\n---\n\nUSER: ${message}`,
    },
  ];

  const widgetTool = createWidgetTool(registryDatasetId);
  const tools = warehouseMode ? [queryWarehouseTool(), widgetTool] : [widgetTool];

  try {
    let reply = "";
    let widget: AssistantResponse["widget"] = null;
    let query: AssistantQuery | null = null;

    // Two passes at most: one where the model may query, one where it reads the
    // rows back and answers. A single extra round trip is enough because every
    // question here resolves to one aggregate.
    for (let pass = 0; pass < 2; pass += 1) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: warehouseMode ? WAREHOUSE_SYSTEM_PROMPT : CSV_SYSTEM_PROMPT,
        tools,
        // "parse" must produce a widget; "chat" decides for itself. Forcing the
        // tool on the second pass would stop the model from answering in prose.
        tool_choice:
          mode === "parse" && pass === 0 && !warehouseMode
            ? { type: "tool", name: "create_widget" }
            : { type: "auto" },
        messages,
      });

      if (response.stop_reason === "refusal") {
        return Response.json(
          { error: "The assistant declined to answer that request." },
          { status: 422 }
        );
      }

      const queryCalls: Anthropic.ToolUseBlock[] = [];
      for (const block of response.content) {
        if (block.type === "text") {
          reply += block.text;
        } else if (block.type === "tool_use" && block.name === "create_widget") {
          widget = toWidget(block.input as Record<string, unknown>);
        } else if (block.type === "tool_use" && block.name === "query_warehouse") {
          queryCalls.push(block);
        }
      }

      if (queryCalls.length === 0) break;

      // Execute each query through the same engine /api/v1/query uses, so a
      // payload the model composed is validated identically to a widget's.
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of queryCalls) {
        const executed = await runAssistantQuery(call.input as Record<string, unknown>);
        query = executed;
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: executed.error !== undefined,
          content: renderQueryResult(executed),
        });
      }
      messages.push({ role: "user", content: results });
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
      query,
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
