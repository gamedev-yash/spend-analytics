"use client";

/**
 * Browser-localStorage dashboard snapshots — a lightweight capture of a
 * page's FILTER/VIEW STATE (what the user had selected), never its rendered
 * data. This is deliberately unrelated to lib/snapshot.ts (PNG image export
 * via html-to-image) — same English word, different feature: this one lets
 * a user come back to "what I was looking at," not download a picture of it.
 *
 * Restoring a snapshot re-applies its stored filters/view options onto the
 * page's own store (or URL params), which then re-queries/re-renders through
 * the normal data path — a snapshot never carries query results itself.
 */

/** Common cross-page filter shape. `extra` carries page-specific scalars/arrays that don't fit the common fields (e.g. a pareto split, a supplier-count threshold, selected invoice-value buckets) — never a row array. */
export interface SnapshotFilterState {
  dateFrom?: string;
  dateTo?: string;
  categories?: string[];
  plants?: string[];
  suppliers?: string[];
  sourceSystems?: string[];
  extra?: Record<string, string | number | boolean | string[]>;
}

export interface SnapshotSortState {
  column: string;
  direction: "asc" | "desc";
}

/** One line of the drawer's human-readable summary — a label/value pair, never a full data row. */
export interface SnapshotPreviewRow {
  label: string;
  value: string;
}

/** The lightweight, page-agnostic state a snapshot captures. Never holds calculated/rendered table rows — only the configuration that produces them. */
export interface SnapshotState {
  /** Which page this snapshot was taken on (e.g. "tail-spend") — kept on the payload itself, not just on the wrapping LocalSnapshot, so a restored/exported state is self-describing. */
  pageId: string;
  filters: SnapshotFilterState;
  viewPreset?: string;
  sort?: SnapshotSortState;
  columnVisibility?: Record<string, boolean>;
  activeFocusParameters?: string[];
  widgetLayout?: string[];
  /** Capped to MAX_PREVIEW_ROWS by saveLocalSnapshot regardless of what's passed in here. */
  preview?: SnapshotPreviewRow[];
}

export interface LocalSnapshot {
  id: string;
  name: string;
  dashboardId: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  state: SnapshotState;
}

const STORAGE_KEY = "app_dashboard_snapshots";
const MAX_SNAPSHOTS_PER_DASHBOARD = 20;
const MAX_PREVIEW_ROWS = 5;
const MAX_PAYLOAD_BYTES = 10 * 1024;
const EMPTY: LocalSnapshot[] = [];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function isPreviewRow(value: unknown): value is SnapshotPreviewRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SnapshotPreviewRow>;
  return typeof row.label === "string" && typeof row.value === "string";
}

function isFilterState(value: unknown): value is SnapshotFilterState {
  return typeof value === "object" && value !== null;
}

function isSnapshotState(value: unknown): value is SnapshotState {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<SnapshotState>;
  return typeof s.pageId === "string" && isFilterState(s.filters);
}

function isSnapshot(value: unknown): value is LocalSnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<LocalSnapshot>;
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.dashboardId === "string" &&
    typeof s.createdAt === "string" &&
    isSnapshotState(s.state)
  );
}

/** Caps `preview` to MAX_PREVIEW_ROWS and drops any malformed entries — the one place row-count enforcement happens, so every save (not just well-behaved callers) is protected. */
function sanitizeState(state: SnapshotState): SnapshotState {
  const preview = Array.isArray(state.preview) ? state.preview.filter(isPreviewRow).slice(0, MAX_PREVIEW_ROWS) : undefined;
  return { ...state, preview };
}

function loadAll(): LocalSnapshot[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSnapshot) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function persistAll(snapshots: LocalSnapshot[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  } catch (err) {
    console.warn("local-snapshots: unable to persist snapshots", err);
  }
}

/**
 * Saves a lightweight snapshot of a dashboard's current filter/view state.
 *
 * `preview` is capped to 5 rows regardless of what's passed in, and the
 * resulting payload is rejected outright if it's still over 10 KB — table
 * data doesn't have a field to live in to begin with (`SnapshotState` has no
 * row-array slot), so hitting this ceiling almost always means a caller
 * passed something it shouldn't have (e.g. a full row array via `extra`)
 * rather than a snapshot that's merely "a bit large."
 *
 * Keeps only the newest MAX_SNAPSHOTS_PER_DASHBOARD snapshots for this
 * `dashboardId`, evicting the oldest first, so localStorage's overall quota
 * is never approached regardless of save frequency.
 */
export function saveLocalSnapshot(name: string, dashboardId: string, statePayload: SnapshotState): LocalSnapshot {
  const sanitized = sanitizeState(statePayload);
  const size = byteSize(sanitized);
  if (size > MAX_PAYLOAD_BYTES) {
    throw new Error(
      `Snapshot payload is ${(size / 1024).toFixed(1)} KB, over the ${(MAX_PAYLOAD_BYTES / 1024).toFixed(0)} KB limit. ` +
        "Snapshots store filter/view configuration, not table data — check that no row arrays are being included."
    );
  }

  const snapshot: LocalSnapshot = {
    id: newId(),
    name: name.trim() || "Untitled snapshot",
    dashboardId,
    createdAt: new Date().toISOString(),
    state: sanitized,
  };

  const all = loadAll();
  const forThisDashboard = all.filter((s) => s.dashboardId === dashboardId);
  const others = all.filter((s) => s.dashboardId !== dashboardId);
  // Oldest-first, so slicing off the front evicts the oldest once the cap is exceeded.
  const kept = [...forThisDashboard, snapshot]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-MAX_SNAPSHOTS_PER_DASHBOARD);

  persistAll([...others, ...kept]);
  return snapshot;
}

/** Newest first. Pass `dashboardId` to scope to one page; omit it to list every snapshot across all dashboards. */
export function getLocalSnapshots(dashboardId?: string): LocalSnapshot[] {
  const all = loadAll();
  const scoped = dashboardId ? all.filter((s) => s.dashboardId === dashboardId) : all;
  return [...scoped].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteLocalSnapshot(id: string): void {
  persistAll(loadAll().filter((s) => s.id !== id));
}
