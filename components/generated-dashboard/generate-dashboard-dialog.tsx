"use client";

// "Generate Custom Dashboard" entry point for the NEW, independent AI
// dashboard-generation feature. Written fresh: picks a single CSV off disk,
// builds a statistical profile of it client-side (lib/ai/profile/build-profile),
// POSTs that profile to /api/generate-dashboard for a two-call Claude plan +
// widget-spec pipeline, validates the returned widgets against the profile,
// and stores the whole self-contained result in the generated-dashboard
// localStorage store before routing to /generated/[id]. This does not import
// from, or reuse any logic belonging to, the older manual custom-dashboard
// builder or floating AI assistant.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Dialog } from "@base-ui/react/dialog";
import { AlertCircle, Loader2, Sparkles, Upload, X } from "lucide-react";
import { buildDatasetProfile } from "@/lib/ai/profile/build-profile";
import { validateWidgets } from "@/lib/generated-dashboard/validate";
import { createGeneratedDashboard } from "@/lib/generated-dashboard/store";
import type { DashboardPlan, WidgetSpec } from "@/types/generated-dashboard";
import { cn } from "@/lib/utils";

interface GenerateDashboardResponse {
  plan: DashboardPlan;
  widgets: WidgetSpec[];
  error?: string;
}

function parseCsvFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const fatal = result.errors.find(
          (e) => e.type === "Delimiter" || e.code === "UndetectableDelimiter"
        );
        if (fatal) {
          reject(new Error(`Could not parse "${file.name}": ${fatal.message}`));
          return;
        }
        if (result.data.length === 0) {
          reject(new Error(`"${file.name}" contains no data rows.`));
          return;
        }
        resolve(result.data);
      },
      error: (err) => reject(new Error(`Could not read "${file.name}": ${err.message}`)),
    });
  });
}

/** Form body — remounted per open, so file/error state always starts fresh. */
function GenerateDashboardForm({
  onDone,
  onBusyChange,
}: {
  onDone: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function setBusyState(next: boolean) {
    setBusy(next);
    onBusyChange(next);
  }

  function pickFile(next: File | null) {
    setError(null);
    setFile(next);
  }

  async function generate() {
    if (!file || busy) return;
    setError(null);
    setBusyState(true);
    try {
      setStatusText("Reading and profiling your CSV...");
      const rows = await parseCsvFile(file);
      const profile = buildDatasetProfile(rows);

      setStatusText(
        "Generating your dashboard — this can take a minute or two while Claude analyzes your data..."
      );
      const response = await fetch("/api/generate-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, sourceFileName: file.name }),
      });

      let payload: GenerateDashboardResponse | null = null;
      try {
        payload = (await response.json()) as GenerateDashboardResponse;
      } catch {
        payload = null;
      }

      if (!response.ok || !payload) {
        const message =
          payload?.error ??
          `Dashboard generation failed (HTTP ${response.status}). Please try again.`;
        throw new Error(message);
      }

      const validatedWidgets = validateWidgets(payload.widgets ?? [], profile);
      if (validatedWidgets.length === 0) {
        throw new Error(
          "The model's dashboard plan didn't produce any widgets that match this dataset's columns. Try a different CSV, or try again."
        );
      }

      const dashboard = createGeneratedDashboard({
        title: payload.plan.title,
        sourceFileName: file.name,
        profile,
        plan: payload.plan,
        widgets: validatedWidgets,
        rows,
        columns: Object.keys(rows[0] ?? {}),
      });

      onDone();
      router.push(`/generated/${dashboard.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a dashboard for this file.");
      setStatusText(null);
      setBusyState(false);
    }
  }

  return (
    <>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Pick a CSV from your computer — Claude will analyze its shape and propose a full
        dashboard of charts and KPIs for it.
      </p>

      <div className="mt-4 space-y-3">
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center transition-colors hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500",
            busy && "pointer-events-none opacity-60"
          )}
        >
          <Upload className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {file ? file.name : "Choose a CSV file"}
          </span>
          {!file && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Single file, .csv only
            </span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </label>
      </div>

      {busy && statusText && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
          <span>{statusText}</span>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="shrink-0 rounded p-0.5 text-rose-500 transition-colors hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-900/50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Dialog.Close
          disabled={busy}
          title={busy ? "Please wait for generation to finish" : undefined}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancel
        </Dialog.Close>
        <button
          type="button"
          onClick={generate}
          disabled={!file || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? "Generating..." : "Generate"}
        </button>
      </div>
    </>
  );
}

interface GenerateDashboardButtonProps {
  label?: string;
  /** Renders as a full-width, sidebar-styled row instead of a pill button. */
  variant?: "button" | "nav";
  collapsed?: boolean;
  className?: string;
}

/**
 * "Generate Custom Dashboard" entry point: upload a CSV, let Claude plan and
 * spec a dashboard for it, and land on /generated/[uuid]. Fully independent
 * of the manual "New Custom Dashboard" builder — its own dialog, its own
 * store, its own route.
 */
export function GenerateDashboardButton({
  label = "Generate Custom Dashboard",
  variant = "button",
  collapsed = false,
  className,
}: GenerateDashboardButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function handleOpenChange(next: boolean) {
    // Disable closing (backdrop click, Esc, trigger toggle) while a
    // generation request is in flight, so we never orphan a request the
    // user can no longer see the result of.
    if (!next && busy) return;
    setOpen(next);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        title={collapsed ? label : undefined}
        className={cn(
          variant === "nav"
            ? "flex w-full items-center gap-3 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-100"
            : "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300",
          variant === "nav" && collapsed && "justify-center px-0",
          className
        )}
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        {!(variant === "nav" && collapsed) && <span className="truncate">{label}</span>}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100vh-3rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Generate custom dashboard
            </Dialog.Title>
            <Dialog.Close
              disabled={busy}
              title={busy ? "Please wait for generation to finish" : "Close"}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Close generate dashboard dialog"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {open && <GenerateDashboardForm onDone={() => setOpen(false)} onBusyChange={setBusy} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
