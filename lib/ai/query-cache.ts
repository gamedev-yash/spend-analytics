import "server-only";

// Deterministic result cache for lib/ai/dashboard-query.ts's runDashboardQuery().
//
// KEYED BY TABLE + NORMALIZED SPEC, NOT dashboardKey. Deliberate: dashboard
// access validation (does THIS dashboard get to query this table/field at
// all) already happened before this module is ever consulted — a rejected
// query never reaches the cache. Once a query is valid, its RESULT depends
// only on which physical rows it ran against, and multiple dashboards share
// the exact same table rows today (spend-overview and compliance both read
// the identical fact_po_items array — proven by tests/dashboard-query.test.ts's
// "answer from the identical fact_po_items/fact_invoices tables" case). So an
// identical query from two different dashboards is genuinely the same
// computation, and caching by table instead of by dashboardKey lets one
// dashboard's query warm the cache for another's equivalent one — a real
// consequence of the unified-dataset architecture, not just an
// implementation shortcut.
//
// CORRECTNESS: the cache key includes datasetVersion (lib/server/
// sample-data-source.ts), so a dataset reload/process restart can never
// serve a result computed against the old data — old-version entries simply
// become unreachable, never actively served. Nothing here ever caches an
// ERROR outcome (an invalid table/field) or the final natural-language
// reply — only a successfully-executed QueryResult, per this feature's own
// "never cache only by natural-language question, never cache stale
// business results" constraint.

import type { QueryFilter, QueryResult, QuerySpec } from "@/lib/ai/query-engine";

const MAX_ENTRIES = 1000;
// Shorter than conversation-context's 30-minute TTL on purpose: this cache's
// correctness is already guaranteed by datasetVersion regardless of TTL —
// this bound exists only to reclaim memory for queries nobody repeats, not
// to protect against staleness.
const TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  result: QueryResult;
  cachedAt: number;
}

const store = new Map<string, CacheEntry>();

function isExpired(entry: CacheEntry, now: number): boolean {
  return now - entry.cachedAt > TTL_MS;
}

function evictIfNeeded(now: number): void {
  if (store.size < MAX_ENTRIES) return;
  for (const [key, entry] of store) {
    if (isExpired(entry, now)) store.delete(key);
  }
  if (store.size >= MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [key, entry] of store) {
      if (entry.cachedAt < oldestAt) {
        oldestAt = entry.cachedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }
}

/** Order-independent for filters/select/in-values — two specs that mean the same query must hash identically regardless of what order the model happened to emit fields in. */
function normalizeFilter(filter: QueryFilter): QueryFilter {
  const value = Array.isArray(filter.value) ? [...filter.value].sort() : filter.value;
  return { field: filter.field, op: filter.op, value };
}

function normalizeSpec(spec: QuerySpec): QuerySpec {
  return {
    ...spec,
    filters: spec.filters
      ? spec.filters.map(normalizeFilter).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : undefined,
    select: spec.select ? [...spec.select].sort() : undefined,
  };
}

/** Deterministic key material — stable regardless of object key insertion order (unlike plain JSON.stringify). */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * `spec.table` is expected to already be set (runDashboardQuery always sets
 * it) — that's what makes table part of the key without a separate
 * parameter. Exported for tests and for the route's debug logging, which
 * reports the key's existence (for correlating a cache hit with a request)
 * but never its content — the key can contain filter values, which count as
 * business data.
 */
export function buildQueryCacheKey(datasetVersion: string, spec: QuerySpec): string {
  return `${datasetVersion}::${stableStringify(normalizeSpec(spec))}`;
}

export function getCachedQueryResult(key: string): QueryResult | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (isExpired(entry, Date.now())) {
    store.delete(key);
    return null;
  }
  return entry.result;
}

export function setCachedQueryResult(key: string, result: QueryResult): void {
  const now = Date.now();
  evictIfNeeded(now);
  store.set(key, { result, cachedAt: now });
}

/** Test-only escape hatch — production code never needs to see the raw map. */
export function _clearQueryCacheForTests(): void {
  store.clear();
}

/** Test-only: how many entries are currently stored — used to assert eviction bounds without depending on TTL wall-clock timing. */
export function _sizeForTests(): number {
  return store.size;
}
