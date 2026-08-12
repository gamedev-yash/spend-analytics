// Generated report files, held in memory behind an opaque id.
//
// NOTHING IS EVER WRITTEN TO DISK. That is the simplest possible answer to
// §20's "do not expose internal server file paths to the browser" — there is
// no path to expose, no temp directory to clean up, no traversal surface on
// the download route, and no orphaned files after a crash. The download URL
// carries a server-issued UUID and nothing else, and the route can only look
// that UUID up in this map.
//
// Lifecycle matches every other server-side store in this app
// (lib/ai/query-cache.ts, lib/ai/conversation-context.ts): per-process,
// TTL-bounded, size-bounded, cleared by a restart. A user who leaves a report
// open for hours and then clicks Download gets a clean 404 telling them to
// regenerate, which is correct — by then the underlying data may have moved on
// anyway.
//
// SIZING: MAX_BYTES bounds total retained bytes, not just entry count, because
// entries here are documents rather than small JSON blobs — 200 tiny reports
// and 200 large ones are very different memory footprints, and only the byte
// bound catches the second case.

import "server-only";

import { randomUUID } from "node:crypto";

export type ArtifactFormat = "word" | "excel";

export const ARTIFACT_CONTENT_TYPES: Record<ArtifactFormat, string> = {
  word: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export interface StoredArtifact {
  id: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  createdAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 200;
const MAX_BYTES = 128 * 1024 * 1024;

const store = new Map<string, StoredArtifact>();
let totalBytes = 0;

function drop(id: string): void {
  const entry = store.get(id);
  if (!entry) return;
  totalBytes -= entry.bytes.byteLength;
  store.delete(id);
}

/** Expired first, then oldest-first until both bounds are satisfied. Called on every write. */
function evict(now: number, incoming: number): void {
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) drop(id);
  }
  // Map preserves insertion order and entries are never re-inserted, so the
  // first key is always the oldest — no scan needed to find the eviction
  // candidate, unlike the other caches in this app whose entries can be
  // refreshed in place.
  while (store.size >= MAX_ENTRIES || totalBytes + incoming > MAX_BYTES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    drop(oldest.value);
  }
}

/**
 * Filenames are built server-side from a slugged report title (see
 * safeFilename) — the client never supplies one, so it can never influence
 * the Content-Disposition header.
 */
export function putArtifact(format: ArtifactFormat, filename: string, bytes: Uint8Array): StoredArtifact {
  const now = Date.now();
  evict(now, bytes.byteLength);
  const artifact: StoredArtifact = {
    id: randomUUID(),
    filename,
    contentType: ARTIFACT_CONTENT_TYPES[format],
    bytes,
    createdAt: now,
  };
  store.set(artifact.id, artifact);
  totalBytes += bytes.byteLength;
  return artifact;
}

/** Null for unknown OR expired — the download route turns both into the same 404, so an id can't be probed for prior existence. */
export function getArtifact(id: string): StoredArtifact | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    drop(id);
    return null;
  }
  return entry;
}

/**
 * ASCII-safe, extension-fixed, length-bounded. Runs on the report TITLE, which
 * on the dynamic path is model-generated text — so it is treated as untrusted
 * input even though it never came from the browser. Guarantees no path
 * separator, no traversal sequence, and no header-injection character can
 * reach Content-Disposition.
 */
export function safeFilename(title: string, extension: "docx" | "xlsx"): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  return `${slug || "action-plan"}.${extension}`;
}

/** Test-only escape hatch — production code never needs to see the raw map. */
export function _clearArtifactsForTests(): void {
  store.clear();
  totalBytes = 0;
}

/** Test-only: current entry count, for asserting eviction bounds without wall-clock waits. */
export function _sizeForTests(): number {
  return store.size;
}
