import "server-only";

import { describeSchema } from "@/lib/ai/query-engine";
import { getDashboardTables } from "@/lib/ai/dashboard-tables";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";

/**
 * The Dashboard Context Manager: the one thing the model is told about THIS
 * dashboard's data — which tables exist, what each column is called, its
 * type, and (for low-cardinality text columns) a few real example values.
 * Never the rows themselves, and never another dashboard's tables, so the
 * model can only ground a real figure by calling query_dashboard_data
 * (lib/ai/dashboard-query.ts) against exactly what's listed here.
 */
export function buildDashboardContext(key: DashboardKey): string {
  const tables = getDashboardTables(key);
  const blocks = tables.map((table) => {
    const fields = describeSchema(table.rows);
    const fieldLines = fields.map((f) => {
      const examples = f.examples?.length ? ` — e.g. ${f.examples.slice(0, 5).join(", ")}` : "";
      return `    - ${f.field} (${f.type})${examples}`;
    });
    return [`  TABLE "${table.id}" — ${table.label}. ${table.description}`, ...fieldLines].join("\n");
  });
  return [`Tables you can query on this dashboard:`, ...blocks].join("\n\n");
}
