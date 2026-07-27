"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useDatasets } from "@/context/DatasetsContext";
import { cn } from "@/lib/utils";

interface DatasetUploadProps {
  /** Dashboard route key this upload feeds, e.g. "tail-spend". */
  pageKey: string;
  className?: string;
}

/**
 * Compact CSV upload control shown on each core dashboard page. While a
 * dataset is active for the page, shows its name + shape with a remove
 * button; otherwise offers an "Upload CSV" action. Widgets fall back to the
 * page's static mock data whenever no dataset is present.
 */
export function DatasetUpload({ pageKey, className }: DatasetUploadProps) {
  const { uploadCsv, getDatasetForPage, removeDataset } = useDatasets();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataset = getDatasetForPage(pageKey);

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

      {dataset ? (
        <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate" title={dataset.name}>
            {dataset.name}
          </span>
          <span className="shrink-0 text-emerald-600 dark:text-emerald-400">
            {dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} cols
          </span>
          <button
            type="button"
            onClick={() => removeDataset(dataset.id)}
            className="shrink-0 rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900"
            aria-label="Remove uploaded dataset and revert to sample data"
            title="Remove uploaded dataset and revert to sample data"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {busy ? "Parsing…" : "Upload CSV"}
        </button>
      )}

      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
