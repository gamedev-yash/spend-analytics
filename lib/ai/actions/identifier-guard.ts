// Keeps internal table and column names out of the report a business user
// reads.
//
// WHY A GUARD AND NOT JUST A PROMPT RULE: the engine's system prompt already
// forbids this ("never write a table or column name into any field"), and it
// mostly complies — but observed live output included facts whose source read
// "PO lines where is_contract_backed = 0", an assumption citing "the is_tail
// flag and tail_tier field", and a next step saying "pull invoice-level data
// (fact_invoices)". Two other dashboards in the same batch were clean, which is
// the signature of an instruction the model follows most of the time. A rule
// that matters every time needs a mechanism, not a sentence.
//
// GENERIC BY DERIVATION: the forbidden vocabulary is not a list anyone
// maintains. It is read at runtime from the dashboard's OWN tables via the same
// getDashboardTables()/describeSchema() the tool schema is built from, so it is
// automatically correct for every dashboard, including any added later.
//
// HOW A LEAK IS HANDLED: detection feeds the engine's existing repair channel
// (lib/ai/actions/action-plan-engine.ts), so the model rephrases into business
// language itself — far better than a mechanical substitution. Only if the
// repair budget is exhausted does scrubIdentifiers() rewrite what is left, and
// that path deliberately never fails the report: a vocabulary slip is a
// presentation defect, and destroying an otherwise valid, correctly-grounded
// report over one would be the wrong trade.

import "server-only";

import { describeSchema } from "@/lib/ai/query-engine";
import { getDashboardTables } from "@/lib/ai/dashboard-tables";
import { humanizeFieldName } from "@/lib/ai/conversation-context";
import { DASHBOARD_REGISTRY } from "@/lib/ai/dashboard-registry";
import type { ActionPlanResult } from "@/lib/ai/actions/action-plan-types";

/**
 * ONLY snake_case identifiers are treated as internal.
 *
 * This is the whole false-positive defence. Every real table id and the great
 * majority of column names in this warehouse contain an underscore
 * (fact_po_items, is_contract_backed, actual_dpo, tail_tier). The handful of
 * single-word columns that do not — "region", "year", "currency" — are ordinary
 * business English, and flagging them would reject sentences that are perfectly
 * appropriate for a report. So the rule keys off the shape of the token, not a
 * hand-kept vocabulary.
 */
function isInternalLookingIdentifier(name: string): boolean {
  return name.includes("_");
}

// Same rationale as lib/ai/dashboard-context.ts's contextCache: describeSchema()
// re-scans rows to derive names, and the schemas are stable for the process
// lifetime, so this is computed once rather than per report.
let identifierCache: string[] | null = null;

/**
 * Every internal-looking table id and field name across the WHOLE registry, not
 * just the dashboard being reported on.
 *
 * The narrower version (this dashboard's own schema) was the first
 * implementation and it left a hole: a name belonging to another dashboard's
 * tables is just as internal, just as meaningless to a business reader, and
 * would have passed unnoticed. The engine only ever sees one dashboard's schema
 * so it has little reason to produce a foreign name — but "little reason" is not
 * a guarantee, and widening the check costs one extra pass over a memoized list.
 *
 * Still zero-maintenance and still generic: it reads the registry, so a
 * dashboard added later is covered without touching this file.
 */
export function internalIdentifiers(): string[] {
  if (identifierCache) return identifierCache;

  const names = new Set<string>();
  for (const { key } of DASHBOARD_REGISTRY) {
    for (const table of getDashboardTables(key)) {
      if (isInternalLookingIdentifier(table.id)) names.add(table.id);
      for (const field of describeSchema(table.rows)) {
        if (isInternalLookingIdentifier(field.field)) names.add(field.field);
      }
    }
  }
  // Longest first, so scrubbing replaces `category_l1_name` before a shorter
  // identifier that happens to be a prefix of it.
  identifierCache = [...names].sort((a, b) => b.length - a.length);
  return identifierCache;
}

/** Every string in the plan, flattened — the guard must see nested fields (facts[].source, benefits[].assumption, ...), not just top-level prose. */
function allStrings(plan: ActionPlanResult): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(plan);
  return out;
}

/**
 * Which internal identifiers appear anywhere in the plan's text. Empty is the
 * expected result — the prompt gets this right most of the time, and this
 * returning empty is what keeps the common path free of an extra round trip.
 */
export function findLeakedIdentifiers(plan: ActionPlanResult): string[] {
  const haystack = allStrings(plan).join("\n");
  return internalIdentifiers().filter((name) => haystack.includes(name));
}

/**
 * Last-resort rewrite, used only after the model has been given its chances to
 * rephrase. Replaces each internal identifier with the plain-language label
 * lib/ai/conversation-context.ts already maintains for exactly this purpose —
 * the one place in the app that had to solve "show a field name to a human"
 * before this feature existed.
 *
 * The result is stiffer than what the model would have written
 * ("is_contract_backed" becomes "Contract Backed"), which is the point: it is a
 * backstop that guarantees the rule, not a substitute for the model getting it
 * right.
 */
export function scrubIdentifiers(plan: ActionPlanResult): ActionPlanResult {
  const names = internalIdentifiers();
  const replace = (text: string): string =>
    names.reduce((acc, name) => acc.split(name).join(humanizeFieldName(name)), text);

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return replace(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };

  return walk(plan) as ActionPlanResult;
}
