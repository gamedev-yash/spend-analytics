"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Plus, Sparkles, X } from "lucide-react";
import { useDatasets } from "@/context/DatasetsContext";
import { createDashboard } from "@/lib/custom-dashboards-store";
import { suggestWidgetsForDataset } from "@/lib/suggest";
import { FilterSelect } from "@/components/ui/filter-controls";
import { cn } from "@/lib/utils";

function defaultTitleFor(datasetName: string): string {
  const base = datasetName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base ? `${base.replace(/\b\w/g, (c) => c.toUpperCase())} Dashboard` : "New Dashboard";
}

/** Form body — remounted per open, so initializers read the current datasets. */
function NewDashboardForm({ onDone }: { onDone: () => void }) {
  const { datasets } = useDatasets();
  const router = useRouter();
  const [datasetId, setDatasetId] = useState(() => datasets[datasets.length - 1]?.id ?? "");
  const [title, setTitle] = useState(() => {
    const initial = datasets[datasets.length - 1];
    return initial ? defaultTitleFor(initial.name) : "New Dashboard";
  });
  const [error, setError] = useState<string | null>(null);

  const dataset = datasets.find((d) => d.id === datasetId) ?? null;
  const previewWidgets = dataset ? suggestWidgetsForDataset(dataset) : [];

  function selectDataset(id: string) {
    setDatasetId(id);
    const next = datasets.find((d) => d.id === id);
    if (next) setTitle(defaultTitleFor(next.name));
  }

  function create() {
    if (!dataset) return;
    setError(null);
    try {
      const dashboard = createDashboard({
        title,
        datasetId: dataset.id,
        widgets: suggestWidgetsForDataset(dataset),
      });
      onDone();
      router.push(`/dashboards/${dashboard.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the dashboard.");
    }
  }

  if (datasets.length === 0) {
    return (
      <>
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Upload a CSV first — use the &quot;Upload CSV&quot; button on any dashboard page, then come
          back to build a custom dashboard on it.
        </p>
        <div className="mt-5 flex justify-end">
          <Dialog.Close className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            Close
          </Dialog.Close>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Pick an uploaded dataset and name the dashboard — widgets are proposed automatically from
        its columns, and you can add or edit them afterwards.
      </p>

      <div className="mt-4 space-y-3">
        <FilterSelect
          label="Dataset"
          value={datasetId}
          onChange={selectDataset}
          options={datasets.map((d) => ({
            value: d.id,
            label: `${d.isJoined ? "⋈ " : ""}${d.name} · ${d.rows.length.toLocaleString("en-IN")} rows · ${d.columns.length} cols`,
          }))}
        />

        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Dashboard name
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-slate-500"
          />
        </label>
      </div>

      {previewWidgets.length > 0 && (
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            <Sparkles className="h-3.5 w-3.5" />
            {previewWidgets.length} widgets will be created automatically
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {previewWidgets.map((widget) => (
              <li key={widget.id} className="truncate text-xs text-slate-500 dark:text-slate-400">
                · {widget.title}{" "}
                <span className="text-slate-400 dark:text-slate-500">({widget.chartType})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Dialog.Close className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
          Cancel
        </Dialog.Close>
        <button
          type="button"
          onClick={create}
          disabled={!dataset}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          <Plus className="h-4 w-4" />
          Create Dashboard
        </button>
      </div>
    </>
  );
}

interface NewDashboardButtonProps {
  label?: string;
  /** Renders as a full-width, sidebar-styled row instead of a pill button. */
  variant?: "button" | "nav";
  collapsed?: boolean;
  className?: string;
}

/**
 * "+ New Custom Dashboard" entry point: choose an uploaded CSV, name the
 * dashboard, and land on /dashboards/[uuid] with an auto-suggested layout
 * already populated.
 */
export function NewDashboardButton({
  label = "New Custom Dashboard",
  variant = "button",
  collapsed = false,
  className,
}: NewDashboardButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
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
        <Plus className="h-4 w-4 shrink-0" />
        {!(variant === "nav" && collapsed) && <span className="truncate">{label}</span>}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100vh-3rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              New custom dashboard
            </Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Close new dashboard dialog"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {open && <NewDashboardForm onDone={() => setOpen(false)} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
