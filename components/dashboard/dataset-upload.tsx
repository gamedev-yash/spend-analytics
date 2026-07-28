"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileSpreadsheet, GitMerge, Loader2, Sparkles, Upload, X } from "lucide-react";
import { useDatasets, type Dataset } from "@/context/DatasetsContext";
import { resolveAutoJoin } from "@/lib/auto-join-rules";
import { joinKeysLabel } from "@/lib/join";
import { JoinDialog } from "@/components/dataset/JoinDialog";
import { cn } from "@/lib/utils";

interface DatasetUploadProps {
  /** Dashboard route key this upload feeds, e.g. "tail-spend". */
  pageKey: string;
  /**
   * Set by the page when a dataset is selected but its columns couldn't be
   * mapped to this dashboard (adapter returned null) — shows an amber note
   * explaining that the static sample data is being displayed instead.
   */
  usingFallback?: boolean;
  className?: string;
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** Success toast for auto-joins — bottom-right, auto-dismissing. */
function AutoJoinToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return createPortal(
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[60] flex max-w-md items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="leading-snug">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>,
    document.body
  );
}

/**
 * Dataset controls shown on each core dashboard page: upload CSVs (more than
 * one per page is fine), switch between the page's datasets — raw uploads or
 * materialized joins — and open the merge dialog. Uploading a second dataset
 * runs the SAP auto-join engine; a high-confidence match (e.g. fact_invoices
 * + dim_vendor on vendor_id, or EKKO + EKPO on EBELN) merges automatically
 * with a toast. Widgets fall back to the page's static mock data whenever no
 * usable dataset is selected.
 */
export function DatasetUpload({ pageKey, usingFallback, className }: DatasetUploadProps) {
  const { datasets, uploadCsv, createJoinedDataset, getDatasetForPage, removeDataset, setActiveDatasetId } =
    useDatasets();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const dataset = getDatasetForPage(pageKey);
  const pageDatasets = datasets.filter((d) => d.pageKey === pageKey);

  /**
   * After an upload, look for a high-confidence pre-configured join between
   * the new dataset and this page's other raw datasets (newest first) and
   * execute it. Returns the toast message, or null when nothing auto-merged.
   */
  function attemptAutoJoin(newDataset: Dataset): string | null {
    // `datasets` is the pre-upload snapshot from this render, so the new
    // dataset is never in it — every entry is a candidate partner.
    const candidates = datasets
      .filter((d) => !d.isJoined && d.pageKey === pageKey)
      .reverse();
    const pairAlreadyJoined = (a: string, b: string) =>
      datasets.some(
        (d) =>
          d.isJoined &&
          d.joinInfo &&
          ((d.joinInfo.leftId === a && d.joinInfo.rightId === b) ||
            (d.joinInfo.leftId === b && d.joinInfo.rightId === a))
      );

    for (const candidate of candidates) {
      if (pairAlreadyJoined(candidate.id, newDataset.id)) continue;
      const resolved = resolveAutoJoin(candidate, newDataset);
      if (!resolved || resolved.suggestion.confidence !== "high") continue;
      try {
        const joined = createJoinedDataset({
          name: `${baseName(resolved.left.name)} + ${baseName(resolved.right.name)}`,
          leftId: resolved.left.id,
          rightId: resolved.right.id,
          leftKey: resolved.suggestion.leftKeys,
          rightKey: resolved.suggestion.rightKeys,
          joinType: resolved.suggestion.joinType,
          pageTarget: pageKey,
          auto: true,
        });
        const matched = joined.joinInfo?.matchedLeftRows ?? 0;
        return `Auto-merged ${resolved.left.name} with ${resolved.right.name} via ${joinKeysLabel(
          resolved.suggestion.leftKeys
        )} (${matched.toLocaleString()} rows matched)`;
      } catch {
        // e.g. the keys share no values after all — try the next candidate.
        continue;
      }
    }
    return null;
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const newDataset = await uploadCsv(file, pageKey);
      const toastMessage = attemptAutoJoin(newDataset);
      if (toastMessage) setToast(toastMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {/* Active dataset: picker when several exist for this page, chip when one. */}
      {dataset && pageDatasets.length > 1 && (
        <select
          value={dataset.id}
          onChange={(e) => setActiveDatasetId(e.target.value)}
          aria-label="Select dataset for this page"
          className="max-w-56 appearance-none rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          {pageDatasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.isJoined ? "⋈ " : ""}{d.name} · {d.rows.length.toLocaleString()} rows
            </option>
          ))}
        </select>
      )}

      {dataset && (
        <span
          className="inline-flex max-w-full items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
          title={
            dataset.isJoined && dataset.joinInfo
              ? `${dataset.joinInfo.auto ? "Auto-joined" : "Joined"}: ${dataset.joinInfo.leftName} (${dataset.joinInfo.leftKey}) ${dataset.joinInfo.joinType} join ${dataset.joinInfo.rightName} (${dataset.joinInfo.rightKey})`
              : dataset.name
          }
        >
          {dataset.isJoined ? (
            <GitMerge className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
          )}
          {pageDatasets.length <= 1 && <span className="truncate">{dataset.name}</span>}
          <span className="shrink-0 text-emerald-600 dark:text-emerald-400">
            {dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} cols
          </span>
          <button
            type="button"
            onClick={() => removeDataset(dataset.id)}
            className="shrink-0 rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900"
            aria-label="Remove this dataset"
            title="Remove this dataset"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {busy ? "Parsing…" : "Upload CSV"}
      </button>

      <button
        type="button"
        onClick={() => setJoinOpen(true)}
        disabled={datasets.length < 2}
        title={
          datasets.length < 2
            ? "Upload at least two CSVs to merge them"
            : "Join two uploaded datasets on a shared key"
        }
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <GitMerge className="h-3.5 w-3.5" />
        Merge Datasets
      </button>

      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      {!error && usingFallback && dataset && (
        <span className="text-xs text-amber-600 dark:text-amber-400">
          Columns not recognized for this dashboard — showing sample data. Try merging in the
          missing fields (e.g. supplier names).
        </span>
      )}

      <JoinDialog open={joinOpen} onOpenChange={setJoinOpen} pageTarget={pageKey} />
      {toast && <AutoJoinToast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}
