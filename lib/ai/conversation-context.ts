import "server-only";

// Structured, per-conversation memory for the dashboard-chat follow-up
// feature — deliberately separate from the raw {role, content} message
// history app/api/dashboard-chat/route.ts already threads to Claude.
//
// WHY THIS EXISTS ALONGSIDE RAW HISTORY, NOT INSTEAD OF IT: Claude already
// resolves plain-language references ("them", "that category") correctly
// from raw prior turns — that's proven working (see docs/ARCHITECTURE.md's
// follow-up test notes). What raw text history can't give the model is a
// crisp, deterministic anchor: exactly which table/filters/groupBy/measure
// produced the LAST answer, and exactly which named entities (a specific
// vendor, category, plant) were actually in play — as opposed to whatever a
// prose reply happened to phrase them as. This module captures that
// anchor directly from the same QuerySpec/QueryResult runDashboardQuery()
// already produces — no separate NLU/entity-extraction model, no semantic
// interpretation the backend is worse at than Claude. It's bookkeeping
// around data that already exists in the tool loop, not a new brain.
//
// SECURITY: everything here is advisory TEXT injected into the system
// prompt, exactly like the raw history and activeFilters already are. It
// never bypasses runDashboardQuery's enum+field validation — the model still
// must emit a fresh, validated query_dashboard_data call every turn. A
// previous conversation can never make an unpermitted field queryable.
//
// PERSISTENCE: session-only, in-memory, per-process — this repo has no
// existing session/DB layer for chat (see the audit in this feature's
// implementation report), and introducing one for a demo-scale app would be
// the over-engineering the rest of this codebase's AI work has deliberately
// avoided. A process restart (or, in dev, a Turbopack module reload) clears
// it — the same lifecycle lib/server/sample-data-source.ts's dataset cache
// already has, so this isn't a new failure mode, just the same one in a new
// place.

import type { QueryFilter, QueryResult, QuerySpec } from "@/lib/ai/query-engine";
import type { DashboardContextId } from "@/lib/ai/dashboard-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Exactly the shape runDashboardQuery() already validates and executes
 * (lib/ai/dashboard-query.ts) — deliberately not a redesigned "memory" shape,
 * so if a query-result cache is ever added later (none exists today — see
 * this feature's report on why not), this is already the right cache-key
 * material: the dashboard context id + this spec + dataVersion, never the
 * natural-language sentence that produced it.
 */
export interface DashboardQueryMemory extends QuerySpec {
  table: string;
}

export interface DashboardResultMemory {
  /** Group labels (or, for a row-level lookup, a short per-row label) from the last result — enough to resolve "the second one" without re-sending raw rows. */
  topEntities: string[];
  rowCount: number;
}

/** Cross-dashboard, so "its payment delays?" still knows which supplier after a redirect. Each list: most-recent-first, small and capped. */
export interface EntityMemory {
  suppliers: string[];
  categories: string[];
  plants: string[];
}

export interface ConversationContext {
  conversationId: string;
  updatedAt: number;
  entities: EntityMemory;
  /**
   * Dashboard-specific — never carried across a redirect, so a stale query
   * shape from one dashboard can't contaminate another (see module comment on
   * containment).
   *
   * Keyed by DashboardContextId ("builtin:tail-spend", "custom:abc123") rather
   * than by DashboardKey, which is what extends this memory to custom
   * dashboards without changing how it behaves for built-in ones: a built-in
   * dashboard's slot is simply named "builtin:<key>" now. Two custom dashboards
   * get two slots for the same structural reason two built-ins do — their
   * schemas are unrelated, so one's last query is meaningless (and would be
   * invalid) against the other.
   */
  perDashboard: Partial<
    Record<DashboardContextId, { lastQuery?: DashboardQueryMemory; lastResult?: DashboardResultMemory }>
  >;
}

// ---------------------------------------------------------------------------
// Store — in-memory, TTL + size bounded (see module comment on persistence)
// ---------------------------------------------------------------------------

const MAX_CONVERSATIONS = 500;
const TTL_MS = 30 * 60 * 1000; // 30 minutes of inactivity

const store = new Map<string, ConversationContext>();

function isStale(context: ConversationContext, now: number): boolean {
  return now - context.updatedAt > TTL_MS;
}

/** Evicts stale entries and, failing that, the single oldest one — called on every write, so the map never grows unbounded even under sustained traffic. */
function evictIfNeeded(now: number): void {
  if (store.size < MAX_CONVERSATIONS) return;
  for (const [id, context] of store) {
    if (isStale(context, now)) store.delete(id);
  }
  if (store.size >= MAX_CONVERSATIONS) {
    let oldestId: string | null = null;
    let oldestAt = Infinity;
    for (const [id, context] of store) {
      if (context.updatedAt < oldestAt) {
        oldestAt = context.updatedAt;
        oldestId = id;
      }
    }
    if (oldestId) store.delete(oldestId);
  }
}

const EMPTY_ENTITIES: EntityMemory = { suppliers: [], categories: [], plants: [] };

/** Never throws, never returns undefined — a missing/expired/malformed id just means "no memory yet," the same as a brand-new conversation. */
export function getConversationContext(conversationId: string): ConversationContext {
  const existing = store.get(conversationId);
  if (existing && !isStale(existing, Date.now())) return existing;
  if (existing) store.delete(existing.conversationId); // stale — drop it rather than serve expired memory
  return { conversationId, updatedAt: Date.now(), entities: EMPTY_ENTITIES, perDashboard: {} };
}

export function saveConversationContext(context: ConversationContext): void {
  const now = Date.now();
  evictIfNeeded(now);
  store.set(context.conversationId, { ...context, updatedAt: now });
}

/** "New chat" / "Clear context" — explicit reset, per the follow-up feature's reset rules. */
export function clearConversationContext(conversationId: string): void {
  store.delete(conversationId);
}

/** Test-only escape hatch — production code never needs to see the raw map. */
export function _clearAllConversationsForTests(): void {
  store.clear();
}

/** Test-only: backdates a stored entry past the TTL without waiting real minutes, to exercise eviction deterministically. No-op if the id isn't stored. */
export function _forceStaleForTests(conversationId: string): void {
  const existing = store.get(conversationId);
  if (existing) store.set(conversationId, { ...existing, updatedAt: Date.now() - TTL_MS - 1 });
}

// ---------------------------------------------------------------------------
// Entity extraction — deterministic, from the query the model already ran
// ---------------------------------------------------------------------------

const SUPPLIER_FIELD_HINTS = ["vendor_name", "vendor_id", "parent_company_name"];
const CATEGORY_FIELD_HINTS = ["category_l1_name", "category_l2_name", "material_group_id"];
const PLANT_FIELD_HINTS = ["plant_name", "plant_code", "company_name", "region"];

const MAX_ENTITIES_PER_BUCKET = 3;

function bucketFor(field: string): keyof EntityMemory | null {
  if (SUPPLIER_FIELD_HINTS.includes(field)) return "suppliers";
  if (CATEGORY_FIELD_HINTS.includes(field)) return "categories";
  if (PLANT_FIELD_HINTS.includes(field)) return "plants";
  return null;
}

/** Most-recent-first, deduped, capped — a filter's eq/in value is a real named entity; every other operator (gt/lt/contains/...) isn't naming a specific thing, so it's ignored here. */
function valuesOf(filter: QueryFilter): string[] {
  if (filter.op === "eq") return [String(filter.value)];
  if (filter.op === "in" && Array.isArray(filter.value)) return filter.value.map(String);
  return [];
}

function pushMostRecentFirst(existing: string[], fresh: string[]): string[] {
  const deduped = [...fresh, ...existing.filter((v) => !fresh.includes(v))];
  return deduped.slice(0, MAX_ENTITIES_PER_BUCKET);
}

/** Folds a just-executed query's filters into the entity memory — called once per successful query, not per field, so a query naming two suppliers doesn't crowd out everything else. */
export function extractEntities(current: EntityMemory, filters: QueryFilter[] | undefined): EntityMemory {
  if (!filters || filters.length === 0) return current;
  const fresh: Record<keyof EntityMemory, string[]> = { suppliers: [], categories: [], plants: [] };
  for (const filter of filters) {
    const bucket = bucketFor(filter.field);
    if (!bucket) continue;
    fresh[bucket].push(...valuesOf(filter));
  }
  return {
    suppliers: pushMostRecentFirst(current.suppliers, fresh.suppliers),
    categories: pushMostRecentFirst(current.categories, fresh.categories),
    plants: pushMostRecentFirst(current.plants, fresh.plants),
  };
}

// ---------------------------------------------------------------------------
// Result summary — compact, never raw rows
// ---------------------------------------------------------------------------

const MAX_TOP_ENTITIES = 5;

export function summarizeResult(result: QueryResult): DashboardResultMemory {
  if (result.groups) {
    return { topEntities: result.groups.slice(0, MAX_TOP_ENTITIES).map((g) => g.group), rowCount: result.matchedRows };
  }
  if (result.rows) {
    // Row-level lookup — no group label, so use whatever the first selected field's value is per row as a short handle.
    const firstField = result.rows[0] ? Object.keys(result.rows[0])[0] : undefined;
    const topEntities = firstField
      ? result.rows.slice(0, MAX_TOP_ENTITIES).map((r) => String(r[firstField] ?? "")).filter(Boolean)
      : [];
    return { topEntities, rowCount: result.matchedRows };
  }
  return { topEntities: [], rowCount: result.matchedRows };
}

// ---------------------------------------------------------------------------
// System-prompt block — only rendered when there's actually something to say
// ---------------------------------------------------------------------------

function describeQuery(q: DashboardQueryMemory): string {
  const parts = [`table ${q.table}`];
  if (q.filters?.length) parts.push(`filters ${q.filters.map((f) => `${f.field} ${f.op} ${JSON.stringify(f.value)}`).join(", ")}`);
  if (q.groupBy) parts.push(`grouped by ${q.groupBy}`);
  if (q.measure) parts.push(`measuring ${q.measure}`);
  if (q.aggregation) parts.push(`aggregated as ${q.aggregation}`);
  if (q.sort) parts.push(`sorted ${q.sort}`);
  if (q.limit) parts.push(`limited to ${q.limit}`);
  return parts.join(", ");
}

/**
 * Injected into buildSystemPrompt() only when non-empty, so a fresh
 * conversation (or one with nothing memorable yet) costs the prompt nothing
 * extra — same "don't pad every request" rule activeFilters already follows.
 */
export function buildConversationMemoryBlock(
  context: ConversationContext,
  contextId: DashboardContextId
): string | null {
  const perDashboard = context.perDashboard[contextId];
  const lines: string[] = [];

  if (perDashboard?.lastQuery) {
    lines.push(`- Your last query here: ${describeQuery(perDashboard.lastQuery)}.`);
  }
  if (perDashboard?.lastResult && perDashboard.lastResult.topEntities.length > 0) {
    lines.push(
      `- Its top results were: ${perDashboard.lastResult.topEntities.join(", ")} (${perDashboard.lastResult.rowCount} row${perDashboard.lastResult.rowCount === 1 ? "" : "s"} matched).`
    );
  }
  const entityParts = (["suppliers", "categories", "plants"] as const)
    .map((bucket) => (context.entities[bucket].length > 0 ? `${bucket}: ${context.entities[bucket].join(", ")}` : null))
    .filter((p): p is string => p !== null);
  if (entityParts.length > 0) {
    lines.push(`- Recently discussed — ${entityParts.join(" · ")}.`);
  }

  if (lines.length === 0) return null;

  return [
    "CONVERSATION MEMORY (from earlier in this chat — carry it forward unless the user's new message clearly changes it):",
    ...lines,
    'Resolve words like "them", "that", "the second one", or "only X" against this memory rather than asking the user to repeat themselves. If the follow-up genuinely can\'t be resolved this way, use ask_with_options. If it needs a different dashboard, still use redirect_to_dashboard — memory here never overrides that.',
  ].join("\n");
}

// Raw column ids (lib/server/metadata-registry.ts, lib/ai/dashboard-tables.ts)
// are fine for Claude to see — buildConversationMemoryBlock above is
// server-to-model only, never rendered. This map is specifically for the
// ONE place a field id reaches the user: the "Remembering: …" UI strip
// (buildContextSummaryForUI). Not exhaustive on purpose — the fallback below
// still produces something readable for a field not listed here, it just
// isn't as polished as an explicit label.
const FIELD_DISPLAY_LABELS: Record<string, string> = {
  vendor_name: "Supplier",
  vendor_id: "Supplier",
  parent_company_name: "Supplier Group",
  category_l1_name: "Category",
  category_l2_name: "Sub-category",
  material_group_id: "Material Group",
  plant_name: "Plant",
  plant_code: "Plant",
  region: "Region",
  company_name: "Business Unit",
  company_code: "Business Unit",
  po_date: "PO Date",
  invoice_date: "Invoice Date",
  posting_date: "Posting Date",
  baseline_date: "Baseline Date",
  clearing_date: "Clearing Date",
  fiscal_year: "Year",
  year: "Year",
  payment_term_description: "Payment Term",
  payment_term_code: "Payment Term",
  payment_term_key: "Payment Term",
  currency_code: "Currency",
  doc_type: "Document Type",
  payment_status: "Payment Status",
  tail_tier: "Tail Tier",
};

/**
 * Never shows a raw column id to the user — an explicit label when known,
 * otherwise a plain-word fallback (still no underscores/snake_case) rather than
 * the literal identifier.
 *
 * Exported since lib/ai/actions/identifier-guard.ts needs the same mapping as a
 * last-resort scrub for report text. Shared rather than copied: two independent
 * "field id → human label" tables would drift, and this one is already the
 * app's answer to that question.
 */
// Tokens that are acronyms or units, not words. Title-casing alone turned
// these into "Actual Dpo", "Net Order Value Inr", "Cumulative Spend Pct" —
// readable but visibly machine-generated, which defeats the point of a
// human-facing label. Handled as a rule rather than as more entries in
// FIELD_DISPLAY_LABELS above, because the same suffixes recur across a dozen
// columns and will recur again on any column added later.
const TOKEN_REPLACEMENTS: Record<string, string> = {
  po: "PO",
  dpo: "DPO",
  id: "ID",
  uom: "UoM",
  qty: "Quantity",
  avg: "Average",
  pct: "%",
  inr: "(₹)",
  l1: "L1",
  l2: "L2",
};

// Warehouse table prefixes. A table name has no business appearing in
// user-facing text at all, but if one does reach the scrub, "PO Items records"
// reads far better than "Fact PO Items".
const TABLE_PREFIXES = /^(fact|dim|agg)_/;

export function humanizeFieldName(field: string): string {
  const explicit = FIELD_DISPLAY_LABELS[field];
  if (explicit) return explicit;

  const isTable = TABLE_PREFIXES.test(field);
  const words = field
    .replace(TABLE_PREFIXES, "")
    .split("_")
    .map((token) => TOKEN_REPLACEMENTS[token] ?? token.charAt(0).toUpperCase() + token.slice(1));

  const label = words.join(" ").replace(/ (\(₹\)|%)$/, " $1").trim();
  return isTable ? `${label} records` : label;
}

/**
 * Compact "what I remember" string for the frontend's context indicator —
 * built from the same data as the prompt block above, but phrased for a
 * human reading a small UI strip, not for the model. Deliberately never
 * shows a raw internal field id here — see humanizeFieldName.
 */
export function buildContextSummaryForUI(
  context: ConversationContext,
  contextId: DashboardContextId
): string | null {
  const perDashboard = context.perDashboard[contextId];
  const parts: string[] = [];
  if (perDashboard?.lastQuery?.groupBy) parts.push(`By ${humanizeFieldName(perDashboard.lastQuery.groupBy)}`);
  if (perDashboard?.lastQuery?.limit) parts.push(`Top ${perDashboard.lastQuery.limit}`);
  const namedEntity =
    context.entities.suppliers[0] ?? context.entities.categories[0] ?? context.entities.plants[0] ?? null;
  if (namedEntity) parts.push(namedEntity);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Deterministic follow-up suggestions — no extra LLM call (see this
// feature's report on why: an extra Claude round trip per message would cost
// real latency for something a few cheap rules already cover).
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT_TOGGLE = 10;

export function suggestFollowUps(context: ConversationContext, contextId: DashboardContextId): string[] | null {
  const perDashboard = context.perDashboard[contextId];
  const lastQuery = perDashboard?.lastQuery;
  if (!lastQuery) return null;

  const suggestions: string[] = [];
  // A row-level lookup (specific fields per matching row, e.g. "show me
  // supplier ABC's contract rows") isn't a metric — "compare with last
  // year" or "break down by category" don't mean anything against it, so
  // both are gated on this rather than firing for every query shape.
  const isRowLevelLookup = Boolean(lastQuery.select && lastQuery.select.length > 0);
  const hasDateFilter = lastQuery.filters?.some((f) => /date|_date$/i.test(f.field)) ?? false;

  if (lastQuery.limit) {
    const toggled = lastQuery.limit <= 5 ? DEFAULT_LIMIT_TOGGLE : Math.max(3, Math.floor(lastQuery.limit / 2));
    suggestions.push(`Show top ${toggled}`);
  } else if (!lastQuery.groupBy && !isRowLevelLookup) {
    // The single most common shape this used to miss entirely: a plain
    // scalar answer ("What is our total spend?") has no limit to toggle and
    // nothing broken down yet — the most useful next step is seeing where
    // that number actually comes from. "category" is a safe universal
    // phrase here (not a real column name the model has to match) since
    // every dashboard's tables carry SOME category field — Claude resolves
    // it to the right one the same way it resolves anything typed by hand.
    suggestions.push("Break down by category");
  }

  const namedEntity =
    context.entities.plants[0] ?? context.entities.categories[0] ?? context.entities.suppliers[0] ?? null;
  const alreadyFiltered = lastQuery.filters?.some((f) => String(f.value) === namedEntity) ?? false;
  if (namedEntity && !alreadyFiltered) {
    suggestions.push(`Only for ${namedEntity}`);
  }

  if (!isRowLevelLookup && !hasDateFilter) {
    suggestions.push("Compare with last year");
  }

  return suggestions.length > 0 ? suggestions.slice(0, 3) : null;
}

// ---------------------------------------------------------------------------
// Request-scoped helpers used by the route — folds a tool-loop outcome into
// the conversation's stored memory.
// ---------------------------------------------------------------------------

export interface QueryMemoryUpdate {
  table: string;
  spec: QuerySpec;
  result: QueryResult;
}

/**
 * Applied once per request, after the tool loop finishes, using whichever
 * query actually fed the final reply (the last successful, non-error call —
 * an earlier failed attempt in the same pass shouldn't overwrite memory with
 * something the model itself discarded). Dashboard-scoped by design: a
 * redirect starts the destination dashboard's perDashboard entry empty, so a
 * query shape from one dashboard's tables never leaks into another's
 * validation (see module comment on containment).
 */
export function applyQueryToContext(
  context: ConversationContext,
  contextId: DashboardContextId,
  update: QueryMemoryUpdate
): ConversationContext {
  return {
    ...context,
    entities: extractEntities(context.entities, update.spec.filters),
    perDashboard: {
      ...context.perDashboard,
      [contextId]: {
        lastQuery: { table: update.table, ...update.spec },
        lastResult: summarizeResult(update.result),
      },
    },
  };
}

const MAX_CONVERSATION_ID_LENGTH = 128;

/** Never trusts a client-supplied id blindly — bounds its length so a hostile/buggy client can't use it as an unbounded memory key, and generates a fresh one when absent or malformed. */
export function sanitizeConversationId(value: unknown, generate: () => string): string {
  if (typeof value === "string" && value.trim().length > 0 && value.length <= MAX_CONVERSATION_ID_LENGTH) {
    return value.trim();
  }
  return generate();
}
