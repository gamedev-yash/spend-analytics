// Client half of the generated-dashboard handover (see
// app/api/dashboard-context/route.ts and lib/ai/custom-dashboard-registry.ts).
//
// A generated dashboard lives in this browser's localStorage, so the assistant's
// server side cannot load one by id — the tab that owns it has to register it.
// This module is the whole client contract for that: register once, remember
// that it worked, and re-register on demand when a request comes back saying the
// server no longer holds it.
//
// WHAT IT DELIBERATELY DOES NOT DO: no polling, no periodic refresh, no
// registration on page load. A dashboard is registered the first time the
// assistant actually needs it, because the payload is the dataset and most
// dashboard visits never open the panel.

import type { GeneratedDashboard } from "@/types/generated-dashboard";

const SYNC_URL = "/api/dashboard-context";

/**
 * Dashboard id → the version string the server acknowledged.
 *
 * Module-level rather than component state on purpose: the panel unmounts and
 * remounts (navigation, minimise, full-screen) far more often than the data
 * changes, and re-uploading a dataset on every remount would be the cost this
 * whole handshake exists to avoid. A page reload clears it, which is correct —
 * a new page load cannot know what the server still holds.
 */
const acknowledged = new Map<string, string>();

/**
 * The fingerprint the server derives, computed identically here so a rename or
 * a widget change re-registers while an unchanged dashboard does not. It must
 * stay in step with fingerprint() in lib/ai/custom-dashboard-registry.ts — the
 * only consequence of drift is a redundant upload (the server always stores what
 * it is sent), never a stale answer.
 */
function localVersion(dashboard: GeneratedDashboard): string {
  return [
    dashboard.id,
    dashboard.createdAt,
    dashboard.rows.length,
    dashboard.columns.length,
    dashboard.widgets.length,
    dashboard.title.length,
  ].join("~");
}

export class CustomDashboardSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomDashboardSyncError";
  }
}

/**
 * Registers this dashboard's data with the server if it isn't already known to
 * be there. `force` skips the local bookkeeping — used after a request comes
 * back with needsDashboardSync, which means the server has lost the snapshot
 * this map still claims it has.
 *
 * Throws CustomDashboardSyncError on a rejected/failed registration so the
 * caller can surface a real message instead of a chat turn that silently
 * answered nothing.
 */
export async function ensureCustomDashboardSynced(
  dashboard: GeneratedDashboard,
  options: { force?: boolean; signal?: AbortSignal } = {}
): Promise<void> {
  const version = localVersion(dashboard);
  if (!options.force && acknowledged.get(dashboard.id) === version) return;

  let response: Response;
  try {
    response = await fetch(SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Exactly the fields the assistant reads (see CustomDashboardSnapshot).
      // `library` — widgets the user has NOT placed — is deliberately omitted:
      // it describes what could be shown, not what this dashboard is about.
      body: JSON.stringify({
        dashboard: {
          id: dashboard.id,
          title: dashboard.title,
          createdAt: dashboard.createdAt,
          sourceFileName: dashboard.sourceFileName,
          profile: dashboard.profile,
          plan: dashboard.plan,
          widgets: dashboard.widgets,
          columns: dashboard.columns,
          rows: dashboard.rows,
        },
      }),
      signal: options.signal,
    });
  } catch (err) {
    // An abort is the user's own Stop/navigation — propagate it untouched so the
    // caller's existing AbortError handling still recognises it.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new CustomDashboardSyncError("Could not send this dashboard's data to the assistant.");
  }

  const data: { ok?: boolean; version?: string; error?: string } = await response
    .json()
    .catch(() => ({}) as { ok?: boolean });

  if (!response.ok || !data.ok) {
    // Forget any earlier acknowledgement: whatever the server holds for this id,
    // it is not what we just tried to send.
    acknowledged.delete(dashboard.id);
    throw new CustomDashboardSyncError(data.error ?? "The assistant could not load this dashboard's data.");
  }

  acknowledged.set(dashboard.id, data.version ?? version);
}

/** Test/reset hook — also what a "New chat" does not need to call, since the data hasn't changed. */
export function _forgetSyncedDashboards(): void {
  acknowledged.clear();
}
