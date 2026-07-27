"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, GitMerge, Loader2, Upload, X } from "lucide-react";
import { useDatasets } from "@/context/DatasetsContext";
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

/**
 * Dataset controls shown on each core dashboard page: upload CSVs (more than
 * one per page is fine), switch between the page's datasets — raw uploads or
 * materialized joins — and open the merge dialog. Widgets fall back to the
 * page's static mock data whenever no usable dataset is selected.
 */
export function DatasetUpload({ pageKey, usingFallback, className }: DatasetUploadProps) {
  const { datasets, uploadCsv, getDatasetForPage, removeDataset, setActiveDatasetId } = useDatasets();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);

  const dataset = getDatasetForPage(pageKey);
  const pageDatasets = datasets.filter((d) => d.pageKey === pageKey);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadCsv(file, pageKey);
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
              ? `Joined: ${dataset.joinInfo.leftName} (${dataset.joinInfo.leftKey}) ${dataset.joinInfo.joinType} join ${dataset.joinInfo.rightName} (${dataset.joinInfo.rightKey})`
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
    </div>
  );
}
