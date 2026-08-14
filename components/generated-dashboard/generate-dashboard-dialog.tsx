"use client";

// "Generate Custom Dashboard" entry point.
//
// A three-step flow behind one dialog:
//
//   source ─┬─ spend ──────────────→ configure ─→ generate → /generated/[id]
//           └─ csv ──→ upload ─────→ configure ─┘
//
// Both branches converge on the same configure step and the same generation
// pipeline (lib/generated-dashboard/generate.ts). They differ only in how
// rows are obtained — GET /api/spend-datasets for a platform spend table,
// Papa.parse for an uploaded file — so the field picker, the preview, the
// profiling and the widget planning are written once and shared.
//
// This does not import from, or reuse any logic belonging to, the older manual
// custom-dashboard builder or the floating AI assistant.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import {
  AlertCircle,
  ArrowLeft,
  Database,
  FileSpreadsheet,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { CsvDropzone } from "@/components/generated-dashboard/csv-dropzone";
import { DataSourceStep } from "@/components/generated-dashboard/data-source-step";
import { DataPreview, FieldSelection } from "@/components/generated-dashboard/field-selection";
import { GenerationProgress } from "@/components/generated-dashboard/generation-progress";
import { buildDatasetProfile } from "@/lib/ai/profile/build-profile";
import {
  checkFieldSelection,
  defaultFieldSelection,
  describeFields,
  type FieldOption,
} from "@/lib/generated-dashboard/fields";
import { generateDashboard, type GenerationStage } from "@/lib/generated-dashboard/generate";
import { parseCsvFile } from "@/lib/generated-dashboard/parse-csv";
import {
  DEFAULT_SPEND_SOURCE_ID,
  SPEND_SOURCES,
  findSpendSource,
} from "@/lib/generated-dashboard/spend-sources";
import type { DatasetProfile } from "@/types/dataset-profile";
import type { GeneratedDashboardSourceKind } from "@/types/generated-dashboard";
import { cn } from "@/lib/utils";

type Step = "source" | "upload" | "configure";

/** Response shape of GET /api/spend-datasets — see that route for the sampling rule. */
interface SpendRowsPayload {
  rows?: Record<string, unknown>[];
  totalRows?: number;
  sampled?: boolean;
  error?: string;
}

/** A source that has been read and profiled, and is ready to pick fields from. */
interface LoadedSource {
  kind: GeneratedDashboardSourceKind;
  /** File name, or the spend table's product label. */
  label: string;
  rows: Record<string, unknown>[];
  profile: DatasetProfile;
  fields: FieldOption[];
  /** Rows in the underlying spend table when `rows` is a sample of it. */
  totalRows?: number;
}

/**
 * How long to show "Planning the dashboard" before moving on to "Designing
 * the widgets". Both happen inside one POST that reports nothing until it's
 * finished, so this is an estimate of the first Claude call's share of the
 * wait, not a signal — see generation-progress.tsx. If the response lands
 * first, the real completion supersedes it.
 */
const PLAN_STAGE_MS = 35_000;

const STEP_TITLES: Record<Step, string> = {
  source: "Generate custom dashboard",
  upload: "Upload a CSV",
  configure: "Choose the fields to build from",
};

// Static strings, not interpolated: Tailwind can't resolve a class it doesn't
// see written out. The configure step earns the extra room — it carries a
// two-column field list and a preview table.
const STEP_WIDTHS: Record<Step, string> = {
  source: "w-[min(38rem,calc(100vw-2rem))]",
  upload: "w-[min(32rem,calc(100vw-2rem))]",
  configure: "w-[min(50rem,calc(100vw-2rem))]",
};

const rowCount = (n: number) => n.toLocaleString("en-IN");

function ErrorNote({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 rounded p-0.5 text-rose-500 transition-colors hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-900/50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Placeholder for the field list while a spend table is being fetched and profiled. */
function LoadingFields({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
      <Loader2 className="h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Loading {label}…</p>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Reading the rows and detecting which columns are measures and dimensions.
      </p>
    </div>
  );
}

/**
 * Flow body — remounted per open (see the `open &&` guard below), so step,
 * file and selection state always start fresh.
 */
function GenerateDashboardFlow({
  onStepChange,
  onBusyChange,
  onDone,
}: {
  onStepChange: (step: Step) => void;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();

  const [step, setStep] = useState<Step>("source");
  const [sourceKind, setSourceKind] = useState<GeneratedDashboardSourceKind | null>(null);
  const [spendDatasetId, setSpendDatasetId] = useState(DEFAULT_SPEND_SOURCE_ID);

  const [loaded, setLoaded] = useState<LoadedSource | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<GenerationStage>("profile");
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Guards against a stale load landing last — switching spend tables quickly
  // can leave an earlier, slower response in flight.
  const loadToken = useRef(0);

  // The one simulated transition: nothing observable separates the two Claude
  // calls, so step off "plan" on a timer. Self-cancelling, so a response that
  // lands first (which moves `stage` on for real) wins.
  useEffect(() => {
    if (stage !== "plan") return;
    const timer = setTimeout(() => setStage("widgets"), PLAN_STAGE_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  function goTo(next: Step) {
    setStep(next);
    onStepChange(next);
  }

  function setBusyState(next: boolean) {
    setBusy(next);
    onBusyChange(next);
  }

  function applyLoaded(next: Omit<LoadedSource, "fields">) {
    const fields = describeFields(next.profile);
    setLoaded({ ...next, fields });
    setSelected(defaultFieldSelection(fields));
  }

  // -------------------------------------------------------------------------
  // Loading a source
  // -------------------------------------------------------------------------

  async function loadSpendDataset(datasetId: string) {
    const source = findSpendSource(datasetId);
    if (!source) return;

    const token = ++loadToken.current;
    setLoadError(null);
    setLoaded(null);
    setSelected([]);
    setLoadingLabel(source.label);
    setLoading(true);

    try {
      const response = await fetch(
        `/api/spend-datasets?datasetId=${encodeURIComponent(datasetId)}`
      );
      let payload: SpendRowsPayload | null = null;
      try {
        payload = (await response.json()) as SpendRowsPayload;
      } catch {
        payload = null;
      }
      if (token !== loadToken.current) return;

      if (!response.ok || !payload) {
        throw new Error(
          payload?.error ?? `Could not load ${source.label} (HTTP ${response.status}).`
        );
      }
      const rows = payload.rows ?? [];
      if (rows.length === 0) {
        throw new Error(`${source.label} came back with no rows.`);
      }

      const profile = buildDatasetProfile(rows);
      if (token !== loadToken.current) return;

      applyLoaded({
        kind: "spend",
        label: source.label,
        rows,
        profile,
        totalRows: payload.sampled ? payload.totalRows : undefined,
      });
    } catch (err) {
      if (token !== loadToken.current) return;
      setLoadError(
        err instanceof Error ? err.message : `Could not load ${source.label}.`
      );
    } finally {
      if (token === loadToken.current) setLoading(false);
    }
  }

  async function loadCsvFile(file: File) {
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setLoadError(`"${file.name}" isn't a CSV. Pick a .csv file instead.`);
      return;
    }

    const token = ++loadToken.current;
    setLoadError(null);
    setLoadingLabel(file.name);
    setLoading(true);

    try {
      const rows = await parseCsvFile(file);
      if (token !== loadToken.current) return;

      const profile = buildDatasetProfile(rows);
      if (token !== loadToken.current) return;

      applyLoaded({ kind: "csv", label: file.name, rows, profile });
      goTo("configure");
    } catch (err) {
      if (token !== loadToken.current) return;
      setLoadError(
        err instanceof Error ? err.message : `Could not read "${file.name}".`
      );
    } finally {
      if (token === loadToken.current) setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  function chooseSource(kind: GeneratedDashboardSourceKind) {
    setSourceKind(kind);
    setLoadError(null);
    if (kind === "csv") {
      goTo("upload");
      return;
    }
    // Spend tables need no upload step, so the picker and the field list share
    // one screen — the dataset choice is just the first control on it.
    goTo("configure");
    void loadSpendDataset(spendDatasetId);
  }

  function changeSpendDataset(datasetId: string) {
    setSpendDatasetId(datasetId);
    void loadSpendDataset(datasetId);
  }

  /** Abandons whatever's loaded — every step back changes which source is in play. */
  function goBack() {
    loadToken.current += 1;
    setLoading(false);
    setLoadError(null);
    setGenerateError(null);
    setLoaded(null);
    setSelected([]);

    if (step === "configure" && sourceKind === "csv") {
      goTo("upload");
      return;
    }
    setSourceKind(null);
    goTo("source");
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  const status = loaded
    ? checkFieldSelection(loaded.fields, selected)
    : { error: null, hint: null };

  async function generate() {
    if (!loaded || busy || status.error) return;
    setGenerateError(null);
    setStage("profile");
    setBusyState(true);
    try {
      const dashboard = await generateDashboard({
        rows: loaded.rows,
        fields: selected,
        sourceLabel: loaded.label,
        sourceKind: loaded.kind,
        onStage: setStage,
      });
      onDone();
      router.push(`/generated/${dashboard.id}`);
    } catch (err) {
      setGenerateError(
        err instanceof Error
          ? err.message
          : "Could not generate a dashboard from these fields."
      );
      setBusyState(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (step === "source") {
    return (
      <>
        <DataSourceStep onSelect={chooseSource} />
        <div className="mt-5 flex justify-end">
          <Dialog.Close className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            Cancel
          </Dialog.Close>
        </div>
      </>
    );
  }

  if (step === "upload") {
    return (
      <>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pick a CSV from your computer. It&apos;s parsed here in the browser — you&apos;ll choose
          which of its columns to build from on the next step.
        </p>

        <CsvDropzone onFile={loadCsvFile} busy={loading} busyFileName={loadingLabel} />

        {loadError && <ErrorNote message={loadError} onDismiss={() => setLoadError(null)} />}

        <div className="mt-5 flex justify-between gap-2">
          <button
            type="button"
            onClick={goBack}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <Dialog.Close className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            Cancel
          </Dialog.Close>
        </div>
      </>
    );
  }

  // step === "configure"
  const isSpend = sourceKind === "spend";

  return (
    <>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {busy ? (
          <>
            Building a dashboard from <span className="font-medium">{loaded?.label}</span>. Leave
            this open — it&apos;ll open automatically when it&apos;s ready.
          </>
        ) : (
          <>
            Measures and dimensions were detected from the data. Keep the ones this dashboard
            should be about — Claude plans its charts around exactly these.
          </>
        )}
      </p>

      {/* Which source is in play. A picker for spend tables (switching is a
          reload, not a new step), a static chip for an uploaded file. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isSpend ? (
          <>
            <Database className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
            <label className="sr-only" htmlFor="spend-dataset">
              Spend dataset
            </label>
            <select
              id="spend-dataset"
              value={spendDatasetId}
              disabled={busy || loading}
              onChange={(e) => changeSpendDataset(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 outline-none focus:ring-1 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-slate-500"
            >
              {SPEND_SOURCES.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-400 dark:text-slate-500">
              {findSpendSource(spendDatasetId)?.description}
            </span>
          </>
        ) : (
          <>
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
            <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
              {loaded?.label}
            </span>
            {!busy && (
              <button
                type="button"
                onClick={goBack}
                className="rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                Choose a different file
              </button>
            )}
          </>
        )}
      </div>

      {loaded && !busy && (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {rowCount(loaded.rows.length)} rows · {loaded.fields.length} columns
          {loaded.totalRows !== undefined &&
            ` · an even sample of this table's ${rowCount(loaded.totalRows)} rows, so a dashboard stays small enough to store`}
        </p>
      )}

      <div className="mt-4">
        {busy ? (
          <GenerationProgress stage={stage} />
        ) : loading ? (
          <LoadingFields label={loadingLabel} />
        ) : loaded ? (
          <div className="space-y-4">
            <FieldSelection fields={loaded.fields} selected={selected} onChange={setSelected} />
            <DataPreview rows={loaded.rows} columns={selected} />
          </div>
        ) : (
          // Nothing loaded and nothing in flight — a failed fetch, possibly with
          // its error already dismissed. Re-picking the same entry in the select
          // fires no change event, so retrying needs its own control or the step
          // is a dead end.
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {loadError ? "Nothing was loaded." : "No data loaded yet."}
            </p>
            {isSpend && (
              <button
                type="button"
                onClick={() => loadSpendDataset(spendDatasetId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Load {findSpendSource(spendDatasetId)?.label ?? "dataset"}
              </button>
            )}
          </div>
        )}
      </div>

      {!busy && status.error && (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {status.error}
        </p>
      )}
      {!busy && !status.error && status.hint && (
        <p className="mt-3 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {status.hint}
        </p>
      )}

      {loadError && (
        <ErrorNote
          message={
            isSpend
              ? `${loadError} Pick another dataset, or try again.`
              : loadError
          }
          onDismiss={() => setLoadError(null)}
        />
      )}
      {generateError && (
        <ErrorNote message={generateError} onDismiss={() => setGenerateError(null)} />
      )}

      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <button
          type="button"
          onClick={goBack}
          disabled={busy}
          title={busy ? "Please wait for generation to finish" : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex flex-wrap gap-2">
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
            disabled={!loaded || busy || loading || status.error !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Generating..." : "Generate"}
          </button>
        </div>
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
 * "Generate Custom Dashboard" entry point: choose a data source, pick the
 * fields, and land on /generated/[uuid]. Fully independent of the manual
 * "New Custom Dashboard" builder — its own dialog, its own store, its own
 * route.
 *
 * `step` is mirrored up here purely so the popup can size and title itself;
 * the flow below owns it. Nothing up here drives navigation, which keeps the
 * flow's own state (loaded rows, selection) the only thing a step change has
 * to stay consistent with.
 */
export function GenerateDashboardButton({
  label = "Generate Custom Dashboard",
  variant = "button",
  collapsed = false,
  className,
}: GenerateDashboardButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>("source");

  function handleOpenChange(next: boolean) {
    // Disable closing (backdrop click, Esc, trigger toggle) while a
    // generation request is in flight, so we never orphan a request the
    // user can no longer see the result of.
    if (!next && busy) return;
    // The flow remounts per open and starts at "source"; reset here so the
    // popup's width and title never open a frame behind it.
    if (next) setStep("source");
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
        <Dialog.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 max-h-[calc(100vh-3rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl outline-none transition-[width] duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:border-slate-800 dark:bg-slate-900",
            STEP_WIDTHS[step]
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {STEP_TITLES[step]}
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
          {open && (
            <GenerateDashboardFlow
              onStepChange={setStep}
              onBusyChange={setBusy}
              onDone={() => setOpen(false)}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
