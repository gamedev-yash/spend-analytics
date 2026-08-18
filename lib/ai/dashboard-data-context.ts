import "server-only";

// THE ADAPTER — dashboard identity in, queryable data out.
//
// Everything downstream of this file (the tool schema, the query executor, the
// chat route's prompt, the report engine) operates on a DashboardDataContext and
// never on a DashboardKey or a dashboard id. That is the whole point: the two
// dashboard KINDS differ only in how their rows and their business description
// are obtained, and both differences are resolved here, once.
//
//   builtin: DashboardKey ─► dashboard-registry (label, business scope)
//                          └► dashboard-tables  (warehouse row tables)   ─┐
//   custom:  dashboardId  ─► custom-dashboard-registry (client snapshot)  ├─► DashboardDataContext
//                            └► plan/profile (business scope, schema)    ─┘
//
// From that point on there is one query path (lib/ai/dashboard-query.ts → the
// dashboard-agnostic engine in lib/ai/query-engine.ts), one conversation memory,
// one report pipeline. Nothing is duplicated per dashboard kind.
//
// WHAT NEVER APPEARS IN A PROMPT: rows. Both kinds contribute a SCHEMA block —
// column names, inferred types, a few example values for low-cardinality text
// columns — and a business-scope description. A 100,000-row custom dashboard and
// a six-row one produce prompt text of the same size. The figures reach the
// model only as the (hard-capped) result of a query it composed itself.

import { describeSchema } from "@/lib/ai/query-engine";
import { getDashboardTables, type DashboardTable } from "@/lib/ai/dashboard-tables";
import { getCustomDashboard, type CustomDashboardSnapshot } from "@/lib/ai/custom-dashboard-registry";
import { dashboardContextId, type DashboardContext, type DashboardContextId } from "@/lib/ai/dashboard-context";
import { DASHBOARD_REGISTRY, dashboardMeta, type DashboardMeta } from "@/lib/ai/dashboard-registry";
import { SEMANTIC_METRIC_DICTIONARY } from "@/lib/ai/semantic-metrics";
import { getDatasetVersion } from "@/lib/server/sample-data-source";
import type { ColumnProfile } from "@/types/dataset-profile";

/** The single table id a custom dashboard exposes. One dataset, one name, enum-of-one in the tool schema. */
export const CUSTOM_DASHBOARD_TABLE_ID = "dashboard_data";

export interface DashboardDataContext {
  /** Stable identity for memory, caches and logs — "builtin:tail-spend" / "custom:abc123". */
  contextId: DashboardContextId;
  context: DashboardContext;
  /** Human label, used in the UI and the prompt ("Tail Spend", "Supplier Profitability"). */
  label: string;
  /**
   * What this dashboard is FOR, in business language — the text the model reads
   * to judge whether a question belongs here at all before reaching for a tool.
   * Checked-in prose for a built-in dashboard; derived from the generated plan
   * for a custom one.
   */
  description: string;
  /** Everything queryable here, and nothing else. */
  tables: DashboardTable[];
  /**
   * Named-metric recipes for the warehouse the built-in dashboards read. NULL
   * for a custom dashboard on purpose: those recipes name warehouse tables and
   * columns that do not exist in an uploaded CSV, and handing them to the model
   * alongside a different schema is an invitation to invent a column.
   */
  semanticDictionary: string | null;
  /** Other dashboards in the app, for navigation only — never a data source. */
  otherDashboards: DashboardMeta[];
  /**
   * Leads every cache key derived from this dashboard's DATA — the query-result
   * cache and the report cache. Deliberately shared by the built-in dashboards
   * (they read the same warehouse at the same version), which is what lets one
   * dashboard's query warm the cache for another's identical one; see
   * lib/ai/query-cache.ts. For a generated dashboard it embeds the context id,
   * so no two datasets can ever collide.
   */
  dataVersion: string;
  /**
   * Cache key for anything derived from this dashboard's IDENTITY as well as its
   * data — the schema block and the query tool's own enum lists. It must not be
   * dataVersion alone: all six built-in dashboards share that string, so keying
   * the schema block by it handed every dashboard the first one's tables. This is
   * the one distinction between the two caches and it is load-bearing.
   */
  schemaCacheKey: string;
}

// ---------------------------------------------------------------------------
// Custom-dashboard description, derived from the generated plan
// ---------------------------------------------------------------------------

/**
 * The custom-dashboard equivalent of a registry description.
 *
 * A built-in dashboard's scope is written by hand once. A custom dashboard's has
 * to be assembled from what the generator already produced — and it already
 * produced exactly the right material: the plan states the domain, the grain,
 * the headline metrics, and for every section an intent plus why it matters,
 * along with caveats and the columns it deliberately excluded. That is a real
 * business brief, not a label, so the model can judge scope the same way it does
 * on a built-in dashboard.
 *
 * Bounded on purpose — a plan with twenty sections would otherwise grow the
 * prompt without adding routing signal.
 */
const MAX_SECTIONS_IN_DESCRIPTION = 8;
const MAX_CAVEATS_IN_DESCRIPTION = 6;
const MAX_EXCLUDED_COLUMNS_IN_DESCRIPTION = 8;

function describeCustomDashboard(snapshot: CustomDashboardSnapshot): string {
  const { plan, profile } = snapshot;
  const lines: string[] = [];

  lines.push(`"${snapshot.title}" — a dashboard generated from an uploaded data file${snapshot.sourceFileName ? ` (${snapshot.sourceFileName})` : ""}, holding ${snapshot.rows.length.toLocaleString("en-US")} records across ${snapshot.columns.length} columns.`);
  if (plan.subtitle) lines.push(plan.subtitle);
  if (plan.domain) lines.push(`Subject area: ${plan.domain}.`);
  if (plan.grain) lines.push(`One record represents: ${plan.grain}.`);
  if (plan.currencyOrUnit) lines.push(`Amounts/units: ${plan.currencyOrUnit}.`);
  if (plan.headlineMetrics?.length) {
    lines.push(`The metrics this dashboard leads with: ${plan.headlineMetrics.join("; ")}.`);
  }

  if (plan.sections?.length) {
    lines.push("What it covers, section by section (each with why it matters):");
    for (const section of plan.sections.slice(0, MAX_SECTIONS_IN_DESCRIPTION)) {
      lines.push(`- ${section.heading}: ${section.intent} Why it matters: ${section.whyItMatters}`);
    }
  }

  if (plan.caveats?.length) {
    lines.push(`Caveats about this data you must respect: ${plan.caveats.slice(0, MAX_CAVEATS_IN_DESCRIPTION).join(" ")}`);
  }

  if (plan.excludedColumns?.length) {
    const excluded = plan.excludedColumns
      .slice(0, MAX_EXCLUDED_COLUMNS_IN_DESCRIPTION)
      .map((c) => `${c.name} (${c.reason})`)
      .join("; ");
    lines.push(
      `Columns present in the source file but deliberately NOT charted here: ${excluded}. They are still queryable, but treat them with the same caution the reason describes.`
    );
  }

  if (profile?.shape?.isLongFormat) {
    lines.push(
      `Shape note: this data is one-metric-per-row rather than one-column-per-metric${profile.shape.metricNameColumn ? ` (metric name in "${profile.shape.metricNameColumn}", value in "${profile.shape.metricValueColumn ?? "?"}")` : ""} — filter to a metric before aggregating its value column.`
    );
  }
  if (profile?.parseWarnings?.length) {
    lines.push(`Parsing warnings from the source file: ${profile.parseWarnings.slice(0, 3).join(" ")}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Identity → data. Null means "this dashboard is not available to the
 * assistant" and is a normal, expected outcome for a custom dashboard whose
 * snapshot this process has not been given (a fresh server, a second tab, an id
 * that no longer exists in the browser's store). Callers turn it into a
 * re-register-and-retry or a plain "not available" message — never into a
 * fallback dashboard, which is the one behaviour that would break isolation.
 */
export function resolveDashboardDataContext(context: DashboardContext): DashboardDataContext | null {
  const contextId = dashboardContextId(context);

  if (context.type === "builtin") {
    const meta = dashboardMeta(context.dashboardKey);
    return {
      contextId,
      context,
      label: meta.label,
      description: meta.description,
      tables: getDashboardTables(context.dashboardKey),
      semanticDictionary: SEMANTIC_METRIC_DICTIONARY,
      otherDashboards: DASHBOARD_REGISTRY.filter((d) => d.key !== context.dashboardKey),
      dataVersion: getDatasetVersion(),
      schemaCacheKey: `${contextId}@${getDatasetVersion()}`,
    };
  }

  const snapshot = getCustomDashboard(context.dashboardId);
  if (!snapshot) return null;

  return {
    contextId,
    context,
    label: snapshot.title,
    description: describeCustomDashboard(snapshot),
    tables: [
      {
        id: CUSTOM_DASHBOARD_TABLE_ID,
        label: snapshot.title,
        description: `Every record behind this dashboard — ${snapshot.rows.length.toLocaleString("en-US")} rows, exactly the data its charts are drawn from.`,
        rows: snapshot.rows,
      },
    ],
    semanticDictionary: null,
    // The built-in dashboards exist and are reachable, so a genuinely
    // off-dataset question can still be pointed somewhere useful. They are
    // listed as NAVIGATION targets only; no branch anywhere can read their rows
    // while this context is the active one.
    otherDashboards: DASHBOARD_REGISTRY,
    // Prefixed with the context id, so two custom dashboards that happen to
    // share a column layout can never collide in the query or report cache.
    dataVersion: `${contextId}@${snapshot.version}`,
    schemaCacheKey: `${contextId}@${snapshot.version}`,
  };
}

// ---------------------------------------------------------------------------
// Schema block — the only thing the model is told about the DATA itself
// ---------------------------------------------------------------------------

// describeSchema() scans up to 200 rows per table to infer types and collect
// example values — real work, and the answer never changes for a given
// dataVersion (warehouse tables are parsed once per process; a custom
// dashboard's stored rows are immutable). Without this cache, the chat route
// recomputed byte-identical text on every tool-calling pass of every request.
// Keyed by schemaCacheKey — dashboard identity AND data version — so two
// built-in dashboards never share a block and a re-registered custom dashboard
// with new content gets a fresh one instead of a stale one.
const schemaBlockCache = new Map<string, string>();

const MAX_SCHEMA_CACHE_ENTRIES = 32;

/**
 * Which tables exist, what each column is called, its type, and (for
 * low-cardinality text columns) a few real example values. Never the rows
 * themselves and never another dashboard's tables — so the only way for the
 * model to state a real figure is to call query_dashboard_data against exactly
 * what is listed here.
 */
export function buildDashboardSchemaBlock(dataContext: DashboardDataContext): string {
  const cacheKey = dataContext.schemaCacheKey;
  const cached = schemaBlockCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Column roles the profiler already worked out (measure / dimension /
  // temporal / identifier), available for custom dashboards only — the
  // warehouse tables have no DatasetProfile. Where present it is genuinely
  // useful: it tells the model which columns are meant to be SUMMED and which
  // are meant to be GROUPED BY, which is most of what it needs to compose a
  // sensible query on a schema nobody wrote a description for.
  const roles = profileRoles(dataContext);

  const blocks = dataContext.tables.map((table) => {
    const fields = describeSchema(table.rows);
    const fieldLines = fields.map((field) => {
      const profile = roles.get(field.field);
      const roleNote = profile ? ` [${profile.role}]` : "";
      const examples = field.examples?.length ? ` — e.g. ${field.examples.slice(0, 5).join(", ")}` : "";
      const range =
        profile?.numeric && field.type === "number"
          ? ` — range ${formatCompact(profile.numeric.min)}..${formatCompact(profile.numeric.max)}`
          : "";
      const span = profile?.temporal ? ` — ${profile.temporal.minDate.slice(0, 10)} to ${profile.temporal.maxDate.slice(0, 10)}` : "";
      return `    - ${field.field} (${field.type})${roleNote}${range}${span}${examples}`;
    });
    return [`  TABLE "${table.id}" — ${table.label}. ${table.description}`, ...fieldLines].join("\n");
  });

  const block = [`Tables you can query on this dashboard:`, ...blocks].join("\n\n");

  if (schemaBlockCache.size >= MAX_SCHEMA_CACHE_ENTRIES) {
    const oldest = schemaBlockCache.keys().next();
    if (!oldest.done) schemaBlockCache.delete(oldest.value);
  }
  schemaBlockCache.set(cacheKey, block);
  return block;
}

function profileRoles(dataContext: DashboardDataContext): Map<string, ColumnProfile> {
  const roles = new Map<string, ColumnProfile>();
  if (dataContext.context.type !== "custom") return roles;
  const snapshot = getCustomDashboard(dataContext.context.dashboardId);
  for (const column of snapshot?.profile?.columns ?? []) roles.set(column.name, column);
  return roles;
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return Math.abs(value) >= 1000 ? Math.round(value).toLocaleString("en-US") : String(Math.round(value * 100) / 100);
}

/** Observability only — lets a route log whether this request paid the describeSchema() cost. */
export function isDashboardSchemaBlockCached(dataContext: DashboardDataContext): boolean {
  return schemaBlockCache.has(dataContext.schemaCacheKey);
}

/** Test-only escape hatch. */
export function _clearSchemaBlockCacheForTests(): void {
  schemaBlockCache.clear();
}
