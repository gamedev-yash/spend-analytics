// Anthropic Messages API "structured outputs" JSON Schema for the dashboard
// planning call. This is passed as `output_config: { format: { type:
// "json_schema", schema: PLAN_SCHEMA } }` — NOT a tool-calling schema. Field
// shapes must match types/generated-dashboard.ts's `DashboardPlan` exactly.

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: {
      type: "string",
      description: "Short, human-readable dashboard title (e.g. 'Facilities Maintenance Spend Overview').",
    },
    subtitle: {
      type: "string",
      description: "One-sentence subtitle elaborating on the title's scope.",
    },
    domain: {
      type: "string",
      description: "The business domain this data represents, e.g. 'IT hardware procurement' or 'facilities maintenance spend'.",
    },
    grain: {
      type: "string",
      description: "What a single row in the dataset represents, e.g. 'one purchase order line item'.",
    },
    currencyOrUnit: {
      type: ["string", "null"],
      description: "Currency code/symbol or unit of measure for the headline monetary values, or null if not applicable/determinable.",
    },
    headlineMetrics: {
      type: "array",
      description: "Names of the most important metrics for this dataset, in priority order.",
      items: { type: "string" },
    },
    sections: {
      type: "array",
      description: "The narrative sections the dashboard should be organized into.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            description: "Stable, unique, kebab-case identifier for this section (e.g. 'spend-by-supplier').",
          },
          heading: {
            type: "string",
            description: "Short section heading shown to the user.",
          },
          intent: {
            type: "string",
            description: "What this section is meant to show, in plain language.",
          },
          whyItMatters: {
            type: "string",
            description: "Why this section is relevant to the business domain identified above.",
          },
          priority: {
            type: "integer",
            description: "Display order, lower numbers first.",
          },
        },
        required: ["id", "heading", "intent", "whyItMatters", "priority"],
      },
    },
    caveats: {
      type: "array",
      description: "Data-quality caveats or limitations the analyst should be aware of (e.g. missing values, sampling).",
      items: { type: "string" },
    },
    excludedColumns: {
      type: "array",
      description: "Columns from the source dataset that were deliberately left out of the plan, with the reason why.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          reason: { type: "string" },
        },
        required: ["name", "reason"],
      },
    },
  },
  required: [
    "title",
    "subtitle",
    "domain",
    "grain",
    "currencyOrUnit",
    "headlineMetrics",
    "sections",
    "caveats",
    "excludedColumns",
  ],
} as const;

export type { DashboardPlan } from "@/types/generated-dashboard";
