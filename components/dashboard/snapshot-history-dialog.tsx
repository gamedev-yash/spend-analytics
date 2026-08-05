"use client";

// Cloud snapshots: save the current dashboard view state to dbo.snapshots and
// browse the timeline of earlier saves.
//
// Generic on purpose — a page hands in how to CAPTURE its state
// (buildSnapshotData) and, optionally, how to APPLY one (onRestore). Pages
// without a safe way to re-apply state omit onRestore and get a view-only
// timeline. Restore is armed-then-confirmed in place: a snapshot overwrites
// whatever is currently on screen, and on custom dashboards that includes the
// persisted widget list.

import { useCallback, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Camera, ChevronDown, ChevronUp, History, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SnapshotEntry {
  id: string;
  name: string;
  dashboardId: string;
  createdAt: string;
  createdBy: string;
  data: unknown;
}

interface SnapshotHistoryDialogProps {
  /** Stable key the timeline is filed under — a core route ("tail-spend") or a custom dashboard id. */
  dashboardId: string;
  /** Seeds the default snapshot name. */
  dashboardTitle: string;
  /** Capture the state a snapshot should preserve. Called at save time. */
  buildSnapshotData: () => Record<string, unknown>;
  /** Apply a saved state. Omit for a view-only timeline. */
  onRestore?: (data: Record<string, unknown>) => void;
  className?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function readEnvelope<T>(response: Response): Promise<T> {
  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    // fall through to the status-based error below
  }
  if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
    throw new Error(envelope?.error ?? `Request failed (${response.status}).`);
  }
  return envelope.data;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function defaultName(title: string): string {
  return `${title} — ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`;
}

export function SnapshotHistoryDialog({
  dashboardId,
  dashboardTitle,
  buildSnapshotData,
  onRestore,
  className,
}: SnapshotHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Snapshot id currently expanded (View) or armed for restore. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const response = await fetch(
        `/api/v1/snapshots?dashboardId=${encodeURIComponent(dashboardId)}`
      );
      setSnapshots(await readEnvelope<SnapshotEntry[]>(response));
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load snapshots.");
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  // Fresh timeline and a fresh default name every time the dialog opens —
  // done in the open-change event rather than an effect, so no render-time
  // setState cascade.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setName(defaultName(dashboardTitle));
    setSaveError(null);
    setArmedId(null);
    void loadTimeline();
  }

  async function saveSnapshot() {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/v1/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || defaultName(dashboardTitle),
          dashboardId,
          data: buildSnapshotData(),
        }),
      });
      const created = await readEnvelope<SnapshotEntry>(response);
      setSnapshots((prev) => [created, ...prev]);
      setName(defaultName(dashboardTitle));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save the snapshot.");
    } finally {
      setSaving(false);
    }
  }

  function restore(entry: SnapshotEntry) {
    if (!onRestore) return;
    if (armedId !== entry.id) {
      setArmedId(entry.id);
      return;
    }
    const data =
      typeof entry.data === "object" && entry.data !== null
        ? (entry.data as Record<string, unknown>)
        : {};
    onRestore(data);
    setArmedId(null);
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
          className
        )}
      >
        <Camera className="h-3.5 w-3.5" />
        Snapshots
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Cloud Snapshots
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Save this dashboard&apos;s current view to Azure SQL, or restore an earlier one.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close snapshots"
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Save current view */}
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Snapshot name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={255}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveSnapshot()}
              disabled={saving}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {saving ? "Saving…" : "Save Snapshot"}
            </button>
            {saveError && (
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                {saveError}
              </p>
            )}
          </div>

          {/* Timeline */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <History className="h-3.5 w-3.5" />
              History
            </p>

            {loading && (
              <p className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading snapshots…
              </p>
            )}
            {!loading && listError && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                {listError}
              </div>
            )}
            {!loading && !listError && snapshots.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No snapshots yet — save the current view above.
              </p>
            )}

            <ol className="flex flex-col gap-2">
              {snapshots.map((entry) => {
                const expanded = expandedId === entry.id;
                const armed = armedId === entry.id;
                return (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {entry.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {formatTimestamp(entry.createdAt)} · {entry.createdBy}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : entry.id)}
                          aria-label={expanded ? `Collapse ${entry.name}` : `View ${entry.name}`}
                          title="View saved state"
                          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        {onRestore && (
                          <button
                            type="button"
                            onClick={() => restore(entry)}
                            title={armed ? "Click again to confirm" : "Restore this view"}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                              armed
                                ? "bg-amber-500 text-white hover:bg-amber-600"
                                : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
                            )}
                          >
                            <RotateCcw className="h-3 w-3" />
                            {armed ? "Confirm restore" : "Restore"}
                          </button>
                        )}
                      </div>
                    </div>
                    {expanded && (
                      <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-slate-200 bg-white p-2 text-[11px] leading-snug text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                        {JSON.stringify(entry.data, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
