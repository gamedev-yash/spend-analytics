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
import { resolveAnthropicClient, NO_KEY_ERROR } from "@/lib/ai/anthropic-client";
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
  OtherDashboardInfo,
} from "@/types/assistant";

export const runtime = "nodejs";

const MAX_TOKENS = 8_000;

// The model id comes from resolveAnthropicClient(), which honours
// AZURE_FOUNDRY_MODEL so a Foundry deployment name routes correctly.

// Mirrors .claude/skills/chart-generation/SKILL.md — keep both in sync. That
// skill governs how *we* (Claude Code) hand-build dashboard charts for this
// repo; this constant is the same rules loaded into the live create_widget
// tool call so end users' generated widgets follow the identical form,
// aggregation, column, limit, and title rules.
//
// Used for an uploaded CSV, where the model answers from column statistics.
// WAREHOUSE_SYSTEM_PROMPT below replaces it when the question is about a
// registry dataset, whose rows are only reachable by querying.
const CSV_SYSTEM_PROMPT = `You are the Procurement BI Assistant embedded in a Vedanta spend-analytics dashboard app.

You help procurement analysts understand their uploaded spend data and build dashboard widgets from it.

Grounding rules — these are absolute:
- Answer ONLY from the dataset context provided in the user message. It lists the real columns (with inferred types and distinct counts) and summary statistics for the user's currently active CSV.
- Never invent column names, row counts, or figures. If a number isn't in the provided statistics and can't be derived from them, say what you'd need instead of guessing.
- If no dataset is attached, say so plainly and tell the user to upload a CSV.
- Cite the actual column names when you reference them, using the exact \`id\` shown in the dataset context — never a display label or a guessed variant.

Call create_widget when the request is to SEE something (show/plot/chart/graph/add/visualize/break down/compare/rank/trend/top N). Answer in prose when it's a QUESTION about the data (how many rows, which columns are numeric, what's the total). Don't do both for one intent.

Chart form — first match wins:
- Single number, no breakdown → kpi (no xAxisColumn).
- A measure over time AND a real date column exists → line (no limit unless a window is requested).
- Composition/share of total AND the dimension has ≤12 distinct values → donut (prefer donut over pie; only use pie if the user says "pie").
- Ranked comparison across one category → bar (the default when ambiguous). limit 10 by default.
- One measure broken down by TWO category/date dimensions at once ("by X, split by Y") → stackedBar, with xAxisColumn as the outer grouping (usually the date, or the dimension with more distinct values) and seriesColumn as the stack-by dimension (usually the lower-cardinality one, ideally ≤8 distinct values). xAxisColumn and seriesColumn must be different columns. Only use stackedBar when the request genuinely names two groupings — never guess a second column for a single-dimension request. gridSpan 2, limit 10 on a category axis (omit on a date axis unless a window is requested).
- Row-level detail ("list", "show the records", "which ones") → table, limit 25, gridSpan 2.
- "Trend" with no date column → emit bar instead and say why in your reply.

Aggregation: sum for money/countable quantities. avg for rates, percentages, ratios, scores, AND durations (any *_days/*_age/*_cycle/*_rate/*_pct/*_percent/*_ratio/*_share/*_score/*_margin column) — summing "paid days" across invoices is meaningless, never optional. count when no measure applies (leave yAxisColumn null). distinct for "how many different X".

Columns: yAxisColumn must be a number column that is a real quantity — never an identifier/code column (id/no/nr/num/number/code/key/zip/pin/year/gjahr/belnr/ebeln/ebelp/lifnr/matnr; summing those is always a bug). xAxisColumn/seriesColumn must be category or date columns with roughly 2–200 distinct values; prefer a name-reading column over a code-reading one, and lower cardinality when both are names.

Title: "{Top N} {Dimension} by {Aggregation} {Measure}", title case, humanized column names — not the raw id. Two identical requests must produce the same title; no commentary, dates, or dataset name in it.

gridSpan: 2 for line, table, and stackedBar (trends, tables, and a stack's legend need horizontal room); 1 for kpi, bar, donut, pie.

Every create_widget field is required by the schema — seriesColumn is null on every chart type except stackedBar, the same way xAxisColumn is null on kpi.

You have DATA ACCESS ONLY for the dashboard whose dataset is in DATASET CONTEXT below. Other dashboards exist in this app — OTHER DASHBOARDS lists their names and scope only, never their data, so you can redirect the user there instead of guessing. If the request needs data that belongs to one of those instead, call redirect_to_dashboard with its id — even if you could plausibly guess the answer. Never answer using data you don't have.

If the request is ambiguous among a small set of clear choices (which column, which chart type, which time window, sum vs. average), call ask_with_options with a short question and 2-5 concise options instead of guessing or asking an open-ended follow-up in prose.

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

If the request is ambiguous among a small set of clear choices (which column, which chart type, which time window, sum vs. average), call ask_with_options with a short question and 2-5 concise options instead of guessing or asking an open-ended follow-up in prose.

Keep prose answers short and concrete — a few sentences, no preamble, no markdown headers.`;

const REDIRECT_TOOL: Anthropic.Tool = {
  name: "redirect_to_dashboard",
  description:
    "Call this INSTEAD of create_widget or a prose answer when the request needs data that belongs to a different dashboard than the one whose dataset you were given in DATASET CONTEXT. Never guess using data you don't have.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      dashboardId: {
        type: "string",
        description: "The id of the dashboard (from the OTHER DASHBOARDS list) that actually covers this request.",
      },
      reason: {
        type: "string",
        description: "One short, specific sentence on why that dashboard covers it.",
      },
    },
    required: ["dashboardId", "reason"],
    additionalProperties: false,
  },
};

const ASK_OPTIONS_TOOL: Anthropic.Tool = {
  name: "ask_with_options",
  description:
    "Call this INSTEAD of a prose question when the request is ambiguous among a small set of clear choices (which column, which chart type, which time range, sum vs. average, etc.). Gives the user clickable choices instead of making them type a follow-up. Do not use it for yes/no confirmations or when the right next step is free text.",
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

/** Compact, token-cheap rendering of the other dashboards the model may redirect to, never answer from. */
function renderOtherDashboards(others: OtherDashboardInfo[] | undefined): string {
  if (!others || others.length === 0) return "OTHER DASHBOARDS: none — this is the only dashboard that exists right now.";
  return [
    "OTHER DASHBOARDS (you do NOT have their data — redirect there with redirect_to_dashboard, never answer from them):",
    ...others.map((d) => `- id: ${d.id} — "${d.title}" (${d.route}): ${d.summary}`),
  ].join("\n");
}

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

// Credential resolution (including the AZURE_FOUNDRY_* fallbacks) lives in
// lib/ai/anthropic-client.ts, shared with the dashboard-chat route so both
// resolve the same key, endpoint, and model.

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
    seriesColumn: str(input.seriesColumn),
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

  const resolved = resolveAnthropicClient();
  if (!resolved) {
    return Response.json(
      { error: NO_KEY_ERROR },
      { status: 503 }
    );
  }
  const { client, model } = resolved;

  const otherDashboards = Array.isArray(body.otherDashboards) ? body.otherDashboards : [];

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
      // `context` is the warehouse schema in Azure SQL mode and the uploaded
      // CSV's column statistics otherwise; the redirect list applies to both.
      content: `${context}\n\n${renderOtherDashboards(otherDashboards)}\n\n---\n\nUSER: ${message}`,
    },
  ];

  const widgetTool = createWidgetTool(registryDatasetId);
  // "parse" must produce a widget, so it never sees the redirect escape hatch;
  // "chat" also gets redirect_to_dashboard, and in warehouse mode query_warehouse.
  const tools: Anthropic.Tool[] =
    mode === "parse"
      ? [widgetTool]
      : warehouseMode
        ? [queryWarehouseTool(), widgetTool, REDIRECT_TOOL, ASK_OPTIONS_TOOL]
        : [widgetTool, REDIRECT_TOOL, ASK_OPTIONS_TOOL];

  try {
    let reply = "";
    let widget: AssistantResponse["widget"] = null;
    let redirect: AssistantResponse["redirect"] = null;
    let options: AssistantResponse["options"] = null;
    let query: AssistantQuery | null = null;

    // Two passes at most: one where the model may query, one where it reads the
    // rows back and answers. A single extra round trip is enough because every
    // question here resolves to one aggregate.
    for (let pass = 0; pass < 2; pass += 1) {
      const response = await client.messages.create({
        model,
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
        } else if (block.type === "tool_use" && block.name === "redirect_to_dashboard") {
          const input = block.input as { dashboardId: string; reason: string };
          const target = otherDashboards.find((d) => d.id === input.dashboardId);
          if (target) {
            redirect = { id: target.id, title: target.title, route: target.route };
            if (!reply.trim()) reply = `That's on the "${target.title}" dashboard — ${input.reason}`;
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
      redirect,
      options,
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
