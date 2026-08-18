// Anthropic Messages API "structured outputs" JSON Schema for the widget
// planning call. This is passed as `output_config: { format: { type:
// "json_schema", schema: WIDGET_SCHEMA } }` — NOT a tool-calling schema. Field
// shapes must match types/generated-dashboard.ts's `WidgetSpecDraft` exactly
// (WidgetSpec minus `colSpan`, which validate.ts derives afterward rather
// than asking the model to lay out its own grid). Root is an object wrapping
// the widget array (structured outputs require an object at the top level,
// not a bare array).

const MEASURE_REF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    column: {
      type: "string",
      description: "Source column name this measure is computed from.",
    },
    aggregation: {
      type: "string",
      enum: ["sum", "avg", "count", "distinct", "min", "max"],
      description: "Aggregation function applied to the column.",
    },
    label: {
      type: "string",
      description: "Human-readable label for this measure, shown in legends/tooltips.",
    },
    formatHint: {
      type: ["string", "null"],
      enum: ["currency", "percent", "count", "number", null],
      description:
        "This measure's OWN formatting hint, independent of the widget's formatHint. Set this whenever a widget " +
        "combines measures of genuinely different units — most importantly a multi-measure heatmap scorecard " +
        "(e.g. spend, an on-time %, and a defect count as separate columns) — so each one renders in its own " +
        "unit. Null to fall back to the widget-level formatHint, which is enough for a single-measure widget.",
    },
  },
  required: ["column", "aggregation", "label", "formatHint"],
} as const;

const SERIES_SCHEMA = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", const: "measures" },
        items: {
          type: "array",
          description: "One or more measures to plot, e.g. a KPI row or a multi-measure bar chart.",
          items: MEASURE_REF_SCHEMA,
        },
      },
      required: ["type", "items"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", const: "pivot" },
        dimension: {
          type: "string",
          description: "Column whose distinct values become the pivoted series (e.g. one line/bar per value).",
        },
        values: {
          type: "array",
          description: "The specific distinct values of `dimension` to pivot into series.",
          items: { type: "string" },
        },
        measure: MEASURE_REF_SCHEMA,
      },
      required: ["type", "dimension", "values", "measure"],
    },
  ],
} as const;

const WIDGET_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description: "Stable, unique, kebab-case identifier for this widget.",
    },
    sectionId: {
      type: "string",
      description: "Id of the DashboardPlan section this widget belongs to.",
    },
    title: {
      type: "string",
      description: "Widget title shown in its card header.",
    },
    kind: {
      type: "string",
      enum: [
        "kpi",
        "bar",
        "stackedBar",
        "groupedBar",
        "line",
        "area",
        "stackedArea",
        "stackedBarWithTotalLine",
        "pareto",
        "donut",
        "heatmap",
        "waterfall",
        "table",
      ],
      description: "Chart kind to render.",
    },
    dimension: {
      type: ["string", "null"],
      description: "Grouping column along the category/x axis. Null for 'kpi' and any widget with no grouping axis.",
    },
    series: SERIES_SCHEMA,
    sort: {
      type: ["string", "null"],
      enum: ["value-desc", "value-asc", "label-asc", "temporal", null],
      description: "How to sort the widget's categories/rows, or null for no explicit sort.",
    },
    limit: {
      type: ["integer", "null"],
      description: "Maximum number of categories/rows to show, or null for no limit.",
    },
    formatHint: {
      type: ["string", "null"],
      enum: ["currency", "percent", "count", "number", null],
      description: "Value formatting hint for axes/labels/tooltips, or null to infer.",
    },
    essential: {
      type: "boolean",
      description:
        "True if this widget is core to the dashboard's story and must be visible immediately; false if it is a worthwhile-but-secondary view, which the user can add later from the Add Widget catalog. Not a quality judgement — a false widget must still be fully valid and renderable.",
    },
  },
  required: [
    "id",
    "sectionId",
    "title",
    "kind",
    "dimension",
    "series",
    "sort",
    "limit",
    "formatHint",
    "essential",
  ],
} as const;

export const WIDGET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    widgets: {
      type: "array",
      description: "The concrete widget specs that realize the dashboard plan's sections.",
      items: WIDGET_ITEM_SCHEMA,
    },
  },
  required: ["widgets"],
} as const;

export type { WidgetSpecDraft } from "@/types/generated-dashboard";
