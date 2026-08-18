"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

// Drag-and-drop (or click-to-browse) CSV picker.
//
// Deliberately presentational: it hands the parent a File and nothing else.
// Validation and parsing live with the parent because the same checks have to
// apply to a dropped file and a browsed one, and the parent is the only place
// that sees both.

interface CsvDropzoneProps {
  onFile: (file: File) => void;
  /** True while the parent is parsing — swaps the prompt for a spinner and locks the zone. */
  busy?: boolean;
  /** Name of the file currently being parsed, shown while `busy`. */
  busyFileName?: string;
}

export function CsvDropzone({ onFile, busy = false, busyFileName }: CsvDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    // Without preventDefault the browser navigates to the dropped file
    // instead of firing onDrop.
    event.preventDefault();
    if (!busy) setDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  function handleBrowse(file: File | undefined) {
    if (file) onFile(file);
    // Reset, so re-picking the same file after an error still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "mt-4 rounded-lg border border-dashed transition-colors",
        dragging
          ? "border-slate-500 bg-slate-50 dark:border-slate-400 dark:bg-slate-800/60"
          : "border-slate-300 dark:border-slate-700",
        busy && "opacity-70"
      )}
    >
      {/*
        pointer-events-none on the contents, so dragleave only fires when the
        cursor leaves the zone itself — dragging across the icon and label
        would otherwise flicker the highlight off and on.
      */}
      <div className="pointer-events-none flex flex-col items-center gap-2 px-4 py-8 text-center">
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Reading {busyFileName ?? "your file"}…
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Parsing rows and detecting column types.
            </span>
          </>
        ) : (
          <>
            {dragging ? (
              <FileSpreadsheet className="h-5 w-5 text-slate-500 dark:text-slate-300" />
            ) : (
              <Upload className="h-5 w-5 text-slate-400 dark:text-slate-500" />
            )}
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {dragging ? "Drop to upload" : "Drag a CSV here"}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Single file, .csv only
            </span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="pointer-events-auto mt-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Browse files
            </button>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => handleBrowse(e.target.files?.[0])}
        className="sr-only"
        aria-label="Choose a CSV file"
      />
    </div>
  );
}
