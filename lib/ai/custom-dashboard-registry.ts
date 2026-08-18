import "server-only";

// THE DATA PROVIDER FOR CUSTOM DASHBOARDS — the custom-dashboard counterpart of
// lib/ai/dashboard-tables.ts, and the answer to a problem the built-in
// dashboards do not have: a GeneratedDashboard lives in the BROWSER.
//
// lib/generated-dashboard/store.ts persists generated dashboards to
// localStorage — rows included — and is the only store there is. The server has
// never seen them. So "load GeneratedDashboard using its ID" cannot be a
// database read; the record has to arrive from the client that owns it. This
// module is where it lands: a process-lifetime, TTL- and size-bounded cache of
// snapshots the client has registered, keyed by dashboard id.
//
// WHY THIS IS NOT A SECOND DATA STORE: nothing here is authoritative and
// nothing here is written by a user action. localStorage remains the single
// source of truth; a snapshot is a derived, replaceable copy with exactly the
// same lifecycle the warehouse sample data already has (parsed once, held in
// module scope, gone on restart — lib/server/sample-data-source.ts). A cache
// miss is never an error state: the client re-registers and retries, which is
// also what makes this correct across a server restart, a second browser tab,
// and a redeploy.
//
// WHAT IS SENT, AND WHAT THAT COSTS: the rows are sent to OUR server once per
// dashboard per process — not to Claude, and not per message. Claude only ever
// sees the schema block and the (capped) result of a query it composed, exactly
// as on a built-in dashboard. See lib/ai/dashboard-data-context.ts.

import { isValidCustomDashboardId } from "@/lib/ai/dashboard-context";
import type { Row } from "@/lib/ai/query-engine";
import type { DatasetProfile } from "@/types/dataset-profile";
import type { DashboardPlan, WidgetSpec } from "@/types/generated-dashboard";

/**
 * The subset of GeneratedDashboard (types/generated-dashboard.ts) the assistant
 * needs. Deliberately not the whole record: `library` (widgets the user has NOT
 * put on the dashboard) is left out because it describes what could be shown,
 * not what the dashboard is about.
 */
export interface CustomDashboardSnapshot {
  id: string;
  title: string;
  createdAt: string;
  sourceFileName: string;
  profile: DatasetProfile;
  plan: DashboardPlan;
  widgets: WidgetSpec[];
  columns: string[];
  rows: Row[];
  /**
   * Content fingerprint, and the `dataVersion` every cache key downstream leads
   * with. Derived, never client-supplied — see fingerprint() for what it covers
   * and why that is enough.
   */
  version: string;
  registeredAt: number;
}

// Bounds mirror the app's other in-memory stores (lib/ai/conversation-context.ts,
// lib/ai/query-cache.ts), with one extra dimension they don't need: these entries
// hold ROWS, so a count alone is the wrong bound — eight 100,000-row dashboards
// and eight 50-row ones are not comparable amounts of memory. Both are capped.
const MAX_DASHBOARDS = 8;
// Total rows held across all registered dashboards. Oldest are evicted until the
// new one fits, so a large dataset costs several small ones rather than being
// refused; a single dashboard over MAX_SNAPSHOT_ROWS is refused outright.
const MAX_TOTAL_ROWS = 400_000;
const TTL_MS = 60 * 60 * 1000; // 1 hour since last touch

/** Above this, a registration is rejected rather than silently truncated — a partial dataset would produce confidently wrong answers. */
export const MAX_SNAPSHOT_ROWS = 100_000;
export const MAX_SNAPSHOT_COLUMNS = 300;

const store = new Map<string, CustomDashboardSnapshot>();

function isExpired(snapshot: CustomDashboardSnapshot, now: number): boolean {
  return now - snapshot.registeredAt > TTL_MS;
}

function totalRows(): number {
  let total = 0;
  for (const snapshot of store.values()) total += snapshot.rows.length;
  return total;
}

/** Drops the least-recently-registered entry. Insertion-ordered, and a re-registration deletes before setting (see putCustomDashboard), so the first key really is the oldest. */
function evictOldest(): boolean {
  const oldest = store.keys().next();
  if (oldest.done) return false;
  store.delete(oldest.value);
  return true;
}

/** Called with the incoming dashboard's row count, so the budget is checked against what the store is about to hold rather than what it already holds. */
function evictIfNeeded(now: number, incomingRows: number): void {
  for (const [id, snapshot] of store) {
    if (isExpired(snapshot, now)) store.delete(id);
  }
  while (store.size >= MAX_DASHBOARDS) {
    if (!evictOldest()) return;
  }
  while (totalRows() + incomingRows > MAX_TOTAL_ROWS) {
    if (!evictOldest()) return;
  }
}

/**
 * What the version has to cover: anything that changes an ANSWER. The rows
 * (query results) and the columns (what is queryable) are the substance; title
 * and widget count are in because they reach the model as metadata and are the
 * only parts of a stored dashboard the UI can still mutate (rename, add/remove
 * widget). `createdAt` disambiguates two dashboards built from the same file.
 *
 * Not a hash of the rows themselves: hashing 100k rows on every registration to
 * detect a change that cannot happen (stored rows are immutable once generated)
 * would be real cost for no correctness gain.
 */
function fingerprint(input: {
  id: string;
  createdAt: string;
  title: string;
  rowCount: number;
  columns: string[];
  widgetCount: number;
}): string {
  return [
    input.id,
    input.createdAt,
    input.rowCount,
    input.columns.length,
    input.widgetCount,
    // Length rather than the text itself keeps the key short; combined with the
    // rest this is enough to make a rename produce a different version.
    input.title.length,
  ].join("~");
}

export interface RegisterCustomDashboardResult {
  ok: boolean;
  /** Set when ok — the snapshot's data version, echoed to the client so it can skip a redundant re-registration. */
  version?: string;
  /** Set when !ok — a specific, user-safe reason. */
  error?: string;
}

/** Row-shaped: a plain object, not an array and not null. */
function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates and stores one client-supplied snapshot.
 *
 * Everything is checked here rather than trusted, because this payload arrives
 * over HTTP from a client: the id shape (so it can never be used to reach
 * another dashboard's slot or forge a context id), the row/column bounds, and
 * the presence of the plan/profile objects the metadata block reads. Anything
 * malformed is rejected with a reason — never stored half-valid, since a
 * half-valid dashboard is exactly what would produce an answer grounded in
 * nothing.
 */
export function putCustomDashboard(raw: unknown): RegisterCustomDashboardResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Dashboard payload must be an object." };
  const d = raw as Record<string, unknown>;

  if (!isValidCustomDashboardId(d.id)) return { ok: false, error: "Invalid dashboard id." };
  if (typeof d.title !== "string" || d.title.trim() === "") return { ok: false, error: "Dashboard title is required." };
  if (!Array.isArray(d.rows)) return { ok: false, error: "Dashboard rows must be an array." };
  if (!Array.isArray(d.columns)) return { ok: false, error: "Dashboard columns must be an array." };
  if (d.rows.length === 0) return { ok: false, error: "This dashboard has no rows to analyse." };
  if (d.rows.length > MAX_SNAPSHOT_ROWS) {
    return { ok: false, error: `This dashboard has more rows than the assistant can hold (limit ${MAX_SNAPSHOT_ROWS}).` };
  }
  if (d.columns.length === 0 || d.columns.length > MAX_SNAPSHOT_COLUMNS) {
    return { ok: false, error: "This dashboard's column list is empty or too wide to analyse." };
  }
  if (!d.rows.every(isRow)) return { ok: false, error: "Dashboard rows must each be an object." };
  const columns = d.columns.filter((c): c is string => typeof c === "string" && c !== "");
  if (columns.length === 0) return { ok: false, error: "Dashboard columns must be strings." };
  if (!d.profile || typeof d.profile !== "object") return { ok: false, error: "Dashboard profile is required." };
  if (!d.plan || typeof d.plan !== "object") return { ok: false, error: "Dashboard plan is required." };

  const widgets = Array.isArray(d.widgets) ? (d.widgets as WidgetSpec[]) : [];
  const createdAt = typeof d.createdAt === "string" ? d.createdAt : "";
  const title = d.title.trim();
  const now = Date.now();

  const snapshot: CustomDashboardSnapshot = {
    id: d.id,
    title,
    createdAt,
    sourceFileName: typeof d.sourceFileName === "string" ? d.sourceFileName : "",
    profile: d.profile as DatasetProfile,
    plan: d.plan as DashboardPlan,
    widgets,
    columns,
    rows: d.rows as Row[],
    version: fingerprint({
      id: d.id,
      createdAt,
      title,
      rowCount: d.rows.length,
      columns,
      widgetCount: widgets.length,
    }),
    registeredAt: now,
  };

  // Delete-then-set so re-registering an existing dashboard moves it to the end
  // of the insertion order — otherwise the eviction above would treat a
  // frequently-used dashboard as the oldest.
  store.delete(snapshot.id);
  evictIfNeeded(now, snapshot.rows.length);
  store.set(snapshot.id, snapshot);
  return { ok: true, version: snapshot.version };
}

/**
 * Null for an unknown, malformed, or expired id — never a different dashboard's
 * snapshot, and never a partially-built one. This is the load step §4 asks for,
 * and its null is what the assistant turns into "this dashboard isn't
 * available" instead of an answer from somewhere else.
 */
export function getCustomDashboard(id: string): CustomDashboardSnapshot | null {
  if (!isValidCustomDashboardId(id)) return null;
  const snapshot = store.get(id);
  if (!snapshot) return null;
  if (isExpired(snapshot, Date.now())) {
    store.delete(id);
    return null;
  }
  // Touch: a dashboard being actively chatted with should not age out from
  // under the conversation.
  snapshot.registeredAt = Date.now();
  return snapshot;
}

export function hasCustomDashboard(id: string): boolean {
  return getCustomDashboard(id) !== null;
}

/** Test-only escape hatch — production code never needs the raw map. */
export function _clearCustomDashboardsForTests(): void {
  store.clear();
}
