"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Dialog } from "@base-ui/react/dialog";
import { Camera, Download, Eye, History, Loader2, Trash2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { captureDashboardImage, DASHBOARD_CANVAS_ID, DASHBOARD_PAGE_BACKGROUND } from "@/lib/snapshot";
import {
  deleteLocalSnapshot,
  getLocalSnapshots,
  saveLocalSnapshot,
  MAX_SNAPSHOTS,
  type LocalSnapshot,
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

/** "Q1 Category Review" -> "q1-category-review"; empty/symbol-only names fall back to "snapshot". */
function slugify(value: string): string {
  const slug = value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return slug || "snapshot";
}

function downloadImage(snapshot: LocalSnapshot): void {
  const link = document.createElement("a");
  link.href = snapshot.imageDataUrl;
  link.download = `${slugify(snapshot.name)}.jpg`;
  link.click();
}

interface SnapshotHistoryDialogProps {
  /** Current route's display name (e.g. "Tail Spend") — stamped onto saves and shown per card. */
  dashboardTitle: string;
  className?: string;
}

/**
 * Global "Snapshot History" drawer, mounted once in the app's top bar
 * (components/layout/top-header.tsx) rather than per-page. Save captures
 * whatever dashboard is currently on screen (#dashboard-canvas) as a
 * compressed JPEG and stores it in localStorage (lib/local-snapshots.ts);
 * each entry can be viewed full-size or downloaded. Deliberately distinct
 * from ExportSnapshotButton (lib/snapshot.ts's PNG download) — that one is a
 * one-off export with no history; this one keeps the last few screenshots
 * around so you can flip back through them.
 */
export function SnapshotHistoryDialog({ dashboardTitle, className }: SnapshotHistoryDialogProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useHasMounted();
  const isDark = mounted && resolvedTheme === "dark";

  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<LocalSnapshot | null>(null);

  function refresh() {
    setSnapshots(getLocalSnapshots());
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) refresh();
    else setViewing(null);
  }

  async function handleSave() {
    setError(null);
    setBusy(true);
    try {
      const imageDataUrl = await captureDashboardImage(DASHBOARD_CANVAS_ID, {
        backgroundColor: isDark ? DASHBOARD_PAGE_BACKGROUND.dark : DASHBOARD_PAGE_BACKGROUND.light,
      });
      saveLocalSnapshot(name, dashboardTitle, imageDataUrl);
      setName("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this snapshot.");
    } finally {
      setBusy(false);
    }
  }

  function handleDelete(id: string) {
    deleteLocalSnapshot(id);
    if (viewing?.id === id) setViewing(null);
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
            Capture what {dashboardTitle} looks like right now, or come back to one you saved earlier. Saved on
            this device only.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <label
              htmlFor="snapshot-name"
              className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500"
            >
              Save current view
            </label>
            <div className="flex gap-2">
              <input
                id="snapshot-name"
                type="text"
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSave();
                }}
                placeholder="e.g. Q1 category review"
                className="h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                {busy ? "Capturing…" : "Save"}
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
                No snapshots yet. Save one to capture what a dashboard looks like right now.
              </p>
            ) : (
              <ul className="space-y-3">
                {snapshots.map((snapshot) => (
                  <li
                    key={snapshot.id}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <button
                      type="button"
                      onClick={() => setViewing(snapshot)}
                      aria-label={`View ${snapshot.name}`}
                      className="block w-full"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not a static/remote asset */}
                      <img
                        src={snapshot.imageDataUrl}
                        alt={snapshot.name}
                        className="aspect-video w-full border-b border-slate-100 object-cover object-top dark:border-slate-800"
                      />
                    </button>
                    <div className="flex items-start justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {snapshot.name}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {snapshot.dashboardTitle}
                          </span>
                          <span>{formatTimestamp(snapshot.timestamp)}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewing(snapshot)}
                          title="View full size"
                          aria-label={`View ${snapshot.name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadImage(snapshot)}
                          title="Download"
                          aria-label={`Download ${snapshot.name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          <Download className="h-3.5 w-3.5" />
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <SheetFooter className="border-t border-border">
          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
            Up to {MAX_SNAPSHOTS} screenshots are kept — the oldest is removed once that limit is reached.
          </p>
        </SheetFooter>

        <Dialog.Root open={viewing !== null} onOpenChange={(next) => !next && setViewing(null)}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
            <Dialog.Popup className="fixed top-1/2 left-1/2 z-[60] w-[min(92vw,64rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:border-slate-800 dark:bg-slate-900">
              {viewing && (
                <>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Dialog.Title className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                        {viewing.name}
                      </Dialog.Title>
                      <Dialog.Description className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        {viewing.dashboardTitle} · {formatTimestamp(viewing.timestamp)}
                      </Dialog.Description>
                    </div>
                    <Dialog.Close
                      className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </Dialog.Close>
                  </div>
                  <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not a static/remote asset */}
                    <img src={viewing.imageDataUrl} alt={viewing.name} className="w-full" />
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => downloadImage(viewing)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                </>
              )}
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </SheetContent>
    </Sheet>
  );
}
