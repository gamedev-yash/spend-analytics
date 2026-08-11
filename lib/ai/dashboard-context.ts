import "server-only";

import { describeSchema } from "@/lib/ai/query-engine";
import { getDashboardTables } from "@/lib/ai/dashboard-tables";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";

// describeSchema() scans up to 200 rows per table to infer types and collect
// example values — real work, and one every dashboard's underlying tables
// never change for the lifetime of the process (getSampleDataset() itself
// caches the parsed rows once; see lib/server/sample-data-source.ts). Without
// this cache, buildSystemPrompt() in app/api/dashboard-chat/route.ts recomputed
// this on every tool-calling pass of every request — up to MAX_TOOL_PASSES
// times for a single user message, for a string that is byte-identical each
// time. Keyed by DashboardKey, not invalidated: a process restart is what
// picks up a genuinely new dataset today, same as getSampleDataset()'s own cache.
const contextCache = new Map<DashboardKey, string>();

/**
 * The Dashboard Context Manager: the one thing the model is told about THIS
 * dashboard's data — which tables exist, what each column is called, its
 * type, and (for low-cardinality text columns) a few real example values.
 * Never the rows themselves, and never another dashboard's tables, so the
 * model can only ground a real figure by calling query_dashboard_data
 * (lib/ai/dashboard-query.ts) against exactly what's listed here.
 */
export function buildDashboardContext(key: DashboardKey): string {
  const cached = contextCache.get(key);
  if (cached !== undefined) return cached;

  const tables = getDashboardTables(key);
  const blocks = tables.map((table) => {
    const fields = describeSchema(table.rows);
    const fieldLines = fields.map((f) => {
      const examples = f.examples?.length ? ` — e.g. ${f.examples.slice(0, 5).join(", ")}` : "";
      return `    - ${f.field} (${f.type})${examples}`;
    });
    return [`  TABLE "${table.id}" — ${table.label}. ${table.description}`, ...fieldLines].join("\n");
  });
  const context = [`Tables you can query on this dashboard:`, ...blocks].join("\n\n");
  contextCache.set(key, context);
  return context;
}

/** Observability only — lets the route log whether this request paid the describeSchema() cost. */
export function isDashboardContextCached(key: DashboardKey): boolean {
  return contextCache.has(key);
}
