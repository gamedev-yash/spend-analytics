"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Dialog } from "@base-ui/react/dialog";
import { Download, FileImage, FileText, Loader2, Presentation, X } from "lucide-react";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { runDashboardExport, type ExportFormat, type PdfLayoutMode, type PptxLayoutMode } from "@/lib/export/snapshot-exporter";
import { useSetExportCapturing } from "@/context/ExportCaptureContext";
import { cn } from "@/lib/utils";

interface ExportSnapshotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** id of the element to capture — every dashboard page wraps its canvas in this id. */
  targetId: string;
  dashboardTitle: string;
  /** Human-readable active-filters line already assembled by the page, e.g. "BU: Plant A · Category: Raw Materials". */
  activeFiltersSummary?: string;
}

const FORMATS: { value: ExportFormat; label: string; description: string; icon: typeof FileImage }[] = [
  { value: "png", label: "PNG Image", description: "One high-res image", icon: FileImage },
  { value: "pdf", label: "PDF Document", description: "One landscape page", icon: FileText },
  { value: "pptx", label: "PowerPoint (.pptx)", description: "Editable slides", icon: Presentation },
];

const PPTX_LAYOUTS: { value: PptxLayoutMode; label: string; description: string }[] = [
  {
    value: "overview",
    label: "Executive Overview",
    description: "Captures a clean executive presentation with 2 side-by-side widgets per slide.",
  },
  {
    value: "deep-dive",
    label: "Multi-Slide Deep Dive",
    description: "Generates full-page, maximized slides for every individual chart and table.",
  },
];

const PDF_LAYOUTS: { value: PdfLayoutMode; label: string; description: string }[] = [
  {
    value: "continuous",
    label: "Continuous Paginated PDF",
    description: "One capture, scaled to page width and sliced cleanly across as many pages as it takes.",
  },
  {
    value: "widget-per-page",
    label: "Multi-Page Executive PDF",
    description: "The KPI ribbon and every individual chart or table, one or two per page, fit to page width.",
  },
];

/**
 * Enterprise export modal opened by every dashboard's "Export Snapshot"
 * button (see export-snapshot-button.tsx) — offers PNG/PDF/PPTX with
 * conditional multi-slide PPTX layout options and presentation metadata
 * toggles, then hands off to lib/export/snapshot-exporter.ts. Deliberately
 * separate from lib/local-snapshots.ts / snapshot-history-dialog.tsx (the
 * localStorage-backed Snapshot History drawer) — this modal never touches
 * localStorage and doesn't affect that feature.
 */
export function ExportSnapshotModal({ open, onOpenChange, targetId, dashboardTitle, activeFiltersSummary }: ExportSnapshotModalProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useHasMounted();
  const isDark = mounted && resolvedTheme === "dark";

  const setExportCapturing = useSetExportCapturing();

  const [format, setFormat] = useState<ExportFormat>("png");
  const [pptxLayout, setPptxLayout] = useState<PptxLayoutMode>("overview");
  const [pdfLayout, setPdfLayout] = useState<PdfLayoutMode>("continuous");
  const [includeFilterSummary, setIncludeFilterSummary] = useState(true);
  const [includeTimestampFooter, setIncludeTimestampFooter] = useState(true);
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (busy) return; // never let a backdrop click/Escape interrupt an in-flight export
    onOpenChange(next);
    if (!next) setError(null);
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    setExportCapturing(true);
    try {
      // Let every paginated table re-render with all of its rows (see
      // ExportCaptureContext) and the layout settle before the first capture.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      await runDashboardExport({
        targetId,
        format,
        pptxLayout,
        pdfLayout,
        dashboardTitle,
        includeFilterSummary,
        includeTimestampFooter,
        activeFiltersSummary,
        userName,
        isDark,
        onProgress: setStatus,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export this dashboard.");
    } finally {
      setExportCapturing(false);
      setBusy(false);
      setStatus("");
    }
  }

  const activeFormat = FORMATS.find((f) => f.value === format);
  const activePptxLayout = PPTX_LAYOUTS.find((l) => l.value === pptxLayout);
  const activePdfLayout = PDF_LAYOUTS.find((l) => l.value === pdfLayout);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 shadow-xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            "border-slate-200 bg-white",
            "dark:border-slate-800 dark:bg-slate-900/95 dark:backdrop-blur-md"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Export Snapshot
              </Dialog.Title>
              <Dialog.Description className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                {dashboardTitle}
              </Dialog.Description>
            </div>
            <Dialog.Close
              disabled={busy}
              className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="mt-5 max-h-[65vh] space-y-6 overflow-y-auto pr-1">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Format
              </h3>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {FORMATS.map(({ value, label, description, icon: Icon }) => {
                  const active = format === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFormat(value)}
                      disabled={busy}
                      aria-pressed={active}
                      className={cn(
                        "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all disabled:pointer-events-none disabled:opacity-60",
                        active
                          ? "border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-slate-600"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-semibold">{label}</span>
                      <span
                        className={cn(
                          "text-[11px] leading-snug",
                          active ? "text-white/70 dark:text-slate-900/70" : "text-slate-400 dark:text-slate-500"
                        )}
                      >
                        {description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {format === "pptx" && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Slide layout
                </h3>
                <div className="mt-2 space-y-2">
                  {PPTX_LAYOUTS.map(({ value, label, description }) => {
                    const active = pptxLayout === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPptxLayout(value)}
                        disabled={busy}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all disabled:pointer-events-none disabled:opacity-60",
                          active
                            ? "border-sky-500/40 bg-sky-500/10"
                            : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-600"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                            active ? "border-sky-500" : "border-slate-300 dark:border-slate-600"
                          )}
                        >
                          {active && <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block text-xs font-semibold",
                              active ? "text-sky-700 dark:text-sky-400" : "text-slate-700 dark:text-slate-300"
                            )}
                          >
                            {label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                            {description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {format === "pdf" && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Page layout
                </h3>
                <div className="mt-2 space-y-2">
                  {PDF_LAYOUTS.map(({ value, label, description }) => {
                    const active = pdfLayout === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPdfLayout(value)}
                        disabled={busy}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all disabled:pointer-events-none disabled:opacity-60",
                          active
                            ? "border-sky-500/40 bg-sky-500/10"
                            : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-600"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                            active ? "border-sky-500" : "border-slate-300 dark:border-slate-600"
                          )}
                        >
                          {active && <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block text-xs font-semibold",
                              active ? "text-sky-700 dark:text-sky-400" : "text-slate-700 dark:text-slate-300"
                            )}
                          >
                            {label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                            {description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Presentation details
              </h3>
              <div className="mt-2 space-y-2.5">
                <ToggleRow
                  label="Include Active Filters Summary in Header"
                  checked={includeFilterSummary}
                  onChange={setIncludeFilterSummary}
                  disabled={busy}
                />
                <ToggleRow
                  label="Include Timestamp & User Name Footer"
                  checked={includeTimestampFooter}
                  onChange={setIncludeTimestampFooter}
                  disabled={busy}
                />
                {includeTimestampFooter && (
                  <input
                    type="text"
                    value={userName}
                    onChange={(event) => setUserName(event.target.value)}
                    disabled={busy}
                    placeholder="Your name (optional)"
                    aria-label="Your name"
                    className="ml-[2.15rem] h-8 w-[calc(100%-2.15rem)] rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  />
                )}
              </div>
            </section>

            {error && (
              <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <span className="inline-flex items-center gap-1.5 truncate rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-600 dark:text-sky-400">
              {activeFormat?.label}
              {format === "pptx" && activePptxLayout ? ` · ${activePptxLayout.label}` : ""}
              {format === "pdf" && activePdfLayout ? ` · ${activePdfLayout.label}` : ""}
            </span>
            <button
              type="button"
              onClick={handleExport}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {busy ? "Exporting…" : "Export"}
            </button>
          </div>

          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/90 dark:bg-slate-900/90">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 dark:text-slate-500" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{status || "Working…"}</p>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-slate-900 dark:bg-slate-100" : "bg-slate-200 dark:bg-slate-700"
        )}
      >
        <span
          className={cn(
            "inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform dark:bg-slate-900",
            checked ? "translate-x-3.5" : "translate-x-0.5"
          )}
        />
      </button>
      {label}
    </label>
  );
}
