"use client";

/**
 * Browser-localStorage dashboard snapshots — a visual screenshot of whatever
 * dashboard is on screen, captured via lib/snapshot.ts's captureDashboardImage
 * (html-to-image -> compressed JPEG data URL). Global across every dashboard
 * (not scoped per-page): the Snapshot History drawer lives in the app's top
 * bar, one shared timeline of "what this looked like" moments regardless of
 * which route they were taken on.
 */

export interface LocalSnapshot {
  id: string;
  name: string;
  dashboardTitle: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Compressed JPEG data URL (see lib/snapshot.ts's captureDashboardImage). */
  imageDataUrl: string;
}

const STORAGE_KEY = "app_dashboard_snapshots";
/** Total across all dashboards, not per-dashboard — these are full images, not lightweight state. */
export const MAX_SNAPSHOTS = 6;
const EMPTY: LocalSnapshot[] = [];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSnapshot(value: unknown): value is LocalSnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<LocalSnapshot>;
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.dashboardTitle === "string" &&
    typeof s.timestamp === "string" &&
    typeof s.imageDataUrl === "string"
  );
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

/** Returns whether the write succeeded — `false` covers both SSR (no window) and a thrown QuotaExceededError. */
function persistAll(snapshots: LocalSnapshot[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
    return true;
  } catch (err) {
    console.warn("local-snapshots: unable to persist snapshots", err);
    return false;
  }
}

/**
 * Saves a screenshot snapshot, keeping only the newest MAX_SNAPSHOTS overall.
 *
 * A handful of compressed JPEGs should comfortably fit under localStorage's
 * ~5MB quota, but a single dense/large-viewport capture still can push it
 * over — if persisting fails, this evicts the oldest surviving snapshot(s)
 * and retries rather than losing the save outright. Only throws if even the
 * new snapshot alone can't fit (storage is cleared in that case, rather than
 * left holding a stale, now-untrustworthy value).
 */
export function saveLocalSnapshot(name: string, dashboardTitle: string, imageDataUrl: string): LocalSnapshot {
  const snapshot: LocalSnapshot = {
    id: newId(),
    name: name.trim() || "Untitled snapshot",
    dashboardTitle,
    timestamp: new Date().toISOString(),
    imageDataUrl,
  };

  // Oldest-first, so slicing off the front evicts the oldest once over the cap.
  let kept = [...loadAll(), snapshot].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-MAX_SNAPSHOTS);

  let persisted = persistAll(kept);
  while (!persisted && kept.length > 1) {
    kept = kept.slice(1);
    persisted = persistAll(kept);
  }
  if (!persisted) {
    persistAll([]);
    throw new Error(
      "This screenshot is too large to store in the browser. Try closing other tabs and retrying, or use Export Snapshot to download it instead."
    );
  }

  return snapshot;
}

/** Newest first. */
export function getLocalSnapshots(): LocalSnapshot[] {
  return [...loadAll()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function deleteLocalSnapshot(id: string): void {
  persistAll(loadAll().filter((s) => s.id !== id));
}
