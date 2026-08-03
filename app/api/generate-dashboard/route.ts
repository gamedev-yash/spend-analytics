// Generate Custom Dashboard — planning endpoint.
//
// Stateless, two-call pipeline over a client-computed DatasetProfile (never
// raw rows): a "dashboard planning" call reasons about the business meaning
// of the data and produces a narrative DashboardPlan, then a "widget
// planning" call turns that plan into concrete WidgetSpec[] chart specs.
//
// This is a brand-new feature route — it does not import from, and is not
// wired into, the older "custom dashboard generation" builder/assistant
// feature that already exists in this codebase.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { renderDatasetProfile } from "@/lib/ai/profile/render-profile";
import { PLAN_SCHEMA } from "@/lib/ai/schemas/plan-schema";
import { WIDGET_SCHEMA } from "@/lib/ai/schemas/widget-schema";
import type { DatasetProfile } from "@/types/dataset-profile";
import type { DashboardPlan, WidgetSpec } from "@/types/generated-dashboard";

export const runtime = "nodejs";

const MAX_TOKENS = 8_000;

// The installed @anthropic-ai/sdk (^0.115.0) exposes both `output_config`
// (json_schema format) AND a `client.messages.parse()` helper that JSON-parses
// the returned structured-output text block into `parsed_output` for us — so
// we use `.parse()` with `jsonSchemaOutputFormat()` rather than the strict
// forced-tool-call fallback described in the task (that fallback is only
// needed on older SDK versions that lack structured outputs entirely).
const PLAN_OUTPUT_FORMAT = jsonSchemaOutputFormat(PLAN_SCHEMA);
const WIDGET_OUTPUT_FORMAT = jsonSchemaOutputFormat(WIDGET_SCHEMA);

// Skill markdown is read from disk at request time (not imported) and cached
// in module scope so warm invocations don't re-hit the filesystem.
let dashboardPlanningSkill: string | null = null;
let widgetPlanningSkill: string | null = null;

function readSkill(fileName: string): string {
  const filePath = path.join(process.cwd(), "lib/ai/skills", fileName);
  return fs.readFileSync(filePath, "utf-8");
}

function getDashboardPlanningSkill(): string {
  if (dashboardPlanningSkill === null) {
    dashboardPlanningSkill = readSkill("dashboard-planning.md");
  }
  return dashboardPlanningSkill;
}

function getWidgetPlanningSkill(): string {
  if (widgetPlanningSkill === null) {
    widgetPlanningSkill = readSkill("widget-planning.md");
  }
  return widgetPlanningSkill;
}

interface ResolvedClient {
  client: Anthropic;
  model: string;
}

/**
 * This deployment routes through Azure AI Foundry (AZURE_FOUNDRY_* in .env),
 * which addresses models by deployment name, not the public Anthropic model
 * id — so the deployment name (AZURE_FOUNDRY_MODEL) is required, and
 * AZURE_FOUNDRY_API_VERSION (Azure-style routing) goes on every request as a
 * query param. Falls back to a direct Anthropic API key for local/non-Azure use.
 */
function resolveClient(): ResolvedClient | null {
  const foundryKey = process.env.AZURE_FOUNDRY_API_KEY;
  const foundryEndpoint = process.env.AZURE_FOUNDRY_ENDPOINT;
  if (foundryKey && foundryEndpoint) {
    const model = process.env.AZURE_FOUNDRY_MODEL;
    if (!model) return null;
    const apiVersion = process.env.AZURE_FOUNDRY_API_VERSION;
    const client = new Anthropic({
      apiKey: foundryKey,
      baseURL: foundryEndpoint,
      defaultQuery: apiVersion ? { "api-version": apiVersion } : undefined,
    });
    return { client, model };
  }

  const directKey = process.env.ANTHROPIC_API_KEY;
  if (directKey) {
    return { client: new Anthropic({ apiKey: directKey }), model: "claude-opus-5" };
  }

  return null;
}

interface GenerateDashboardRequest {
  profile: DatasetProfile;
  sourceFileName?: string;
}

function isValidRequestBody(body: unknown): body is GenerateDashboardRequest {
  if (!body || typeof body !== "object") return false;
  const profile = (body as Record<string, unknown>).profile;
  if (!profile || typeof profile !== "object") return false;
  const columns = (profile as Record<string, unknown>).columns;
  return Array.isArray(columns);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (!isValidRequestBody(body)) {
    return Response.json(
      { error: "Request body must be `{ profile: DatasetProfile }` with a `profile.columns` array." },
      { status: 400 }
    );
  }
  const { profile } = body;

  const resolved = resolveClient();
  if (!resolved) {
    return Response.json(
      {
        error:
          "Dashboard generation needs an API key. Set AZURE_FOUNDRY_API_KEY, AZURE_FOUNDRY_ENDPOINT, and AZURE_FOUNDRY_MODEL (optionally AZURE_FOUNDRY_API_VERSION) for Azure AI Foundry, or ANTHROPIC_API_KEY for the direct Anthropic API, then restart the dev server.",
      },
      { status: 503 }
    );
  }
  const { client, model } = resolved;

  const renderedProfile = renderDatasetProfile(profile);

  try {
    // CALL 1 — dashboard planning: narrative plan, no chart/column choices.
    const planResponse = await client.messages.parse({
      model,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: getDashboardPlanningSkill(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: renderedProfile }],
      output_config: { format: PLAN_OUTPUT_FORMAT },
    });

    if (planResponse.stop_reason === "refusal") {
      return Response.json(
        { error: "The model declined to plan a dashboard for this dataset." },
        { status: 422 }
      );
    }

    const plan = planResponse.parsed_output as unknown as DashboardPlan | null;
    if (!plan) {
      return Response.json(
        { error: "The dashboard planning call returned no structured output." },
        { status: 502 }
      );
    }

    // CALL 2 — widget planning: same profile + call 1's plan -> concrete specs.
    const widgetUserMessage = `DATASET PROFILE:\n${renderedProfile}\n\nPLAN:\n${JSON.stringify(plan)}`;

    const widgetResponse = await client.messages.parse({
      model,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: getWidgetPlanningSkill(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: widgetUserMessage }],
      output_config: { format: WIDGET_OUTPUT_FORMAT },
    });

    if (widgetResponse.stop_reason === "refusal") {
      return Response.json(
        { error: "The model declined to turn the plan into dashboard widgets." },
        { status: 422 }
      );
    }

    const widgetOutput = widgetResponse.parsed_output as unknown as { widgets: WidgetSpec[] } | null;
    if (!widgetOutput) {
      return Response.json(
        { error: "The widget planning call returned no structured output." },
        { status: 502 }
      );
    }

    return Response.json({ plan, widgets: widgetOutput.widgets });
  } catch (err) {
    // Typed SDK errors -> useful status codes instead of a blanket 500.
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
      { error: err instanceof Error ? err.message : "Unexpected dashboard generation error." },
      { status: 500 }
    );
  }
}
