// Generated-report cache, modelled directly on lib/ai/query-cache.ts.
//
// STALENESS IS HANDLED THE SAME WAY THE QUERY CACHE ALREADY HANDLES IT: the
// key leads with getDatasetVersion() (lib/server/sample-data-source.ts), so a
// dataset reload or process restart makes every prior entry unreachable rather
// than servable. This is the §18 requirement that a stale report must never be
// reused after the data changes — and it reuses the app's existing version
// identifier instead of inventing a second one.
//
// WHAT ELSE IS IN THE KEY, AND WHY EACH MATTERS:
//   datasetVersion  the data changed → the report's figures are wrong
//   dashboardKey    a different dashboard is a different report entirely
//   action          future actions (executive summary, comparison) must not collide
//   activeFilters   "MRO & Spares only" and unfiltered are different reports
//   objective       the user's own question is what the report answers
// Objective is normalized (lowercased, whitespace-collapsed) so trivial
// retyping still hits, but it is otherwise matched exactly — near-miss
// semantic matching would serve someone a report answering a question they
// did not ask, which is worse than regenerating.
//
// WHAT IS CACHED: the validated ActionPlanResult and the two artifact ids
// together, as one unit. Caching the plan without the artifacts would mean a
// cache hit still had to re-render both documents; caching them separately
// would risk a plan whose artifact ids had already been evicted. Because the
// artifact store has its own shorter lifecycle, `getCachedReport` verifies
// both ids are still resolvable and treats a half-expired entry as a miss.

import "server-only";

import type { ActionPlanResult, AssistantActionId } from "@/lib/ai/actions/action-plan-types";
import { getArtifact } from "@/lib/ai/reports/artifact-store";

const MAX_ENTRIES = 100;
const TTL_MS = 30 * 60 * 1000;

export interface CachedReport {
  plan: ActionPlanResult;
  generator: "demo" | "dynamic";
  wordArtifactId: string | null;
  excelArtifactId: string | null;
}

interface CacheEntry extends CachedReport {
  cachedAt: number;
}

const store = new Map<string, CacheEntry>();

export interface ReportCacheKeyParts {
  datasetVersion: string;
  dashboardKey: string;
  action: AssistantActionId;
  activeFilters: string | null;
  objective: string;
}

function normalizeObjective(objective: string): string {
  return objective.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildReportCacheKey(parts: ReportCacheKeyParts): string {
  return [
    parts.datasetVersion,
    parts.dashboardKey,
    parts.action,
    (parts.activeFilters ?? "").trim().toLowerCase(),
    normalizeObjective(parts.objective),
  ].join("::");
}

function evictIfNeeded(now: number): void {
  if (store.size < MAX_ENTRIES) return;
  for (const [key, entry] of store) {
    if (now - entry.cachedAt > TTL_MS) store.delete(key);
  }
  if (store.size >= MAX_ENTRIES) {
    // Insertion-ordered and never re-inserted, so the first key is the oldest.
    const oldest = store.keys().next();
    if (!oldest.done) store.delete(oldest.value);
  }
}

/**
 * Null on expiry, absence, OR an artifact that has already aged out of
 * lib/ai/reports/artifact-store.ts. The last case is the important one: a
 * cached plan whose download links 404 is worse than no cache hit at all, so
 * the entry is dropped and the report regenerated.
 */
export function getCachedReport(key: string): CachedReport | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  const wordAlive = entry.wordArtifactId === null || getArtifact(entry.wordArtifactId) !== null;
  const excelAlive = entry.excelArtifactId === null || getArtifact(entry.excelArtifactId) !== null;
  if (!wordAlive || !excelAlive) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function setCachedReport(key: string, report: CachedReport): void {
  const now = Date.now();
  evictIfNeeded(now);
  store.set(key, { ...report, cachedAt: now });
}

/** Test-only escape hatch — production code never needs to see the raw map. */
export function _clearReportCacheForTests(): void {
  store.clear();
}
