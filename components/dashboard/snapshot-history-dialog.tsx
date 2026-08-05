"use client";

import { useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  deleteLocalSnapshot,
  getLocalSnapshots,
  saveLocalSnapshot,
  type LocalSnapshot,
  type SnapshotState,
} from "@/lib/local-snapshots";
import { cn } from "@/lib/utils";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface SnapshotHistoryDialogProps {
  /** Page/route id snapshots are scoped to (e.g. "tail-spend") — matches LocalSnapshot.dashboardId. */
  dashboardId: string;
  /** Display name for this dashboard, shown in the drawer's description text. */
  dashboardLabel: string;
  /** Captures the page's CURRENT filter/view state into the lightweight snapshot shape — called only when the user clicks Save, never eagerly. */
  buildSnapshot: () => SnapshotState;
  /** Re-applies a restored snapshot's state back onto the page's own store/URL. Restoring re-runs the page's normal filter-change path, so widgets re-query/re-render exactly as if the user had picked those filters by hand. */
  onRestore: (state: SnapshotState) => void;
  className?: string;
}

/**
 * Right-side slide-out drawer for saving/restoring/deleting lightweight,
 * localStorage-backed snapshots of a dashboard's filter/view state (see
 * lib/local-snapshots.ts). Deliberately named/labeled apart from the
 * existing per-page "Export Snapshot" button (lib/snapshot.ts) — that one
 * downloads a PNG of the canvas; this one remembers filter selections so
 * you can come back to them later. Nothing here ever touches table data:
 * `buildSnapshot` is expected to return configuration only, and the preview
 * shown per entry is a handful of label/value summary lines, not rows.
 */
export function SnapshotHistoryDialog({
  dashboardId,
  dashboardLabel,
  buildSnapshot,
  onRestore,
  className,
}: SnapshotHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setSnapshots(getLocalSnapshots(dashboardId));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) refresh();
  }

  function handleSave() {
    setError(null);
    try {
      saveLocalSnapshot(name, dashboardId, buildSnapshot());
      setName("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this snapshot.");
    }
  }

  function handleRestore(snapshot: LocalSnapshot) {
    onRestore(snapshot.state);
    setOpen(false);
  }

  function handleDelete(id: string) {
    deleteLocalSnapshot(id);
    refresh();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
          className
        )}
      >
        <History className="h-3.5 w-3.5" />
        Snapshot History
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Snapshot History</SheetTitle>
          <SheetDescription>
            Save the current filters and view options for {dashboardLabel} so you can come back to them later.
            Saved on this device only.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <label htmlFor="snapshot-name" className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Save current view
            </label>
            <div className="flex gap-2">
              <input
                id="snapshot-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSave();
                }}
                placeholder="e.g. Q1 category review"
                className="h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              />
              <button
                type="button"
                onClick={handleSave}
                className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                Save
              </button>
            </div>
            {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Saved snapshots
            </p>
            {snapshots.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
                No snapshots yet for this dashboard.
              </p>
            ) : (
              <ul className="space-y-2">
                {snapshots.map((snapshot) => (
                  <li
                    key={snapshot.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {snapshot.name}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {snapshot.dashboardId}
                          </span>
                          <span>{formatTimestamp(snapshot.createdAt)}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleRestore(snapshot)}
                          title="Restore this snapshot"
                          aria-label={`Restore ${snapshot.name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(snapshot.id)}
                          title="Delete this snapshot"
                          aria-label={`Delete ${snapshot.name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {snapshot.state.preview && snapshot.state.preview.length > 0 && (
                      <dl className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                        {snapshot.state.preview.map((row) => (
                          <div key={row.label} className="flex gap-1.5 text-[11px]">
                            <dt className="shrink-0 text-slate-400 dark:text-slate-500">{row.label}:</dt>
                            <dd className="min-w-0 truncate text-slate-600 dark:text-slate-300">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <SheetFooter className="border-t border-border">
          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
            Up to 20 snapshots are kept per dashboard — the oldest is removed once that limit is reached.
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
