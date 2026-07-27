"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowLeftRight, GitMerge, X } from "lucide-react";
import { useDatasets, type Dataset } from "@/context/DatasetsContext";
import { countJoinMatches, type JoinType } from "@/lib/join";
import { normalizeKey } from "@/lib/dataset-rows";
import { FilterSelect } from "@/components/ui/filter-controls";
import { cn } from "@/lib/utils";

interface JoinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Page the merged dataset should feed (and become the active dataset for). */
  pageTarget: string;
}

/** Prefer id-looking columns ("vendor_id", "supplierId") when auto-matching keys. */
function guessJoinKeys(left: Dataset, right: Dataset): { leftKey: string; rightKey: string } {
  const rightByNorm = new Map(right.columns.map((c) => [normalizeKey(c.id), c.id]));
  const idish = (id: string) => normalizeKey(id).endsWith("id");
  const ordered = [...left.columns].sort((a, b) => Number(idish(b.id)) - Number(idish(a.id)));
  for (const col of ordered) {
    const match = rightByNorm.get(normalizeKey(col.id));
    if (match !== undefined) return { leftKey: col.id, rightKey: match };
  }
  return { leftKey: left.columns[0]?.id ?? "", rightKey: right.columns[0]?.id ?? "" };
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function defaultJoinName(left: Dataset | null, right: Dataset | null): string {
  if (!left || !right) return "";
  return `${baseName(left.name)} + ${baseName(right.name)}`;
}

interface FormState {
  leftId: string;
  rightId: string;
  leftKey: string;
  rightKey: string;
  joinType: JoinType;
  name: string;
}

function JoinDialogForm({ pageTarget, onDone }: { pageTarget: string; onDone: () => void }) {
  const { datasets, getDatasetForPage, createJoinedDataset } = useDatasets();
  const [error, setError] = useState<string | null>(null);

  // Initial pair: the page's current dataset on the left, first other dataset
  // on the right. The form remounts on every dialog open, so initializers are
  // enough — no state-syncing effects.
  const [form, setForm] = useState<FormState>(() => {
    const left = getDatasetForPage(pageTarget) ?? datasets[0] ?? null;
    const right = datasets.find((d) => d.id !== left?.id) ?? null;
    const keys = left && right ? guessJoinKeys(left, right) : { leftKey: "", rightKey: "" };
    return {
      leftId: left?.id ?? "",
      rightId: right?.id ?? "",
      ...keys,
      joinType: "left",
      name: defaultJoinName(left, right),
    };
  });

  const left = datasets.find((d) => d.id === form.leftId) ?? null;
  const right = datasets.find((d) => d.id === form.rightId) ?? null;

  function selectDataset(side: "left" | "right", id: string) {
    setError(null);
    setForm((prev) => {
      const nextLeft = side === "left" ? datasets.find((d) => d.id === id) ?? null : datasets.find((d) => d.id === prev.leftId) ?? null;
      const nextRight = side === "right" ? datasets.find((d) => d.id === id) ?? null : datasets.find((d) => d.id === prev.rightId) ?? null;
      const keys = nextLeft && nextRight ? guessJoinKeys(nextLeft, nextRight) : { leftKey: "", rightKey: "" };
      return {
        ...prev,
        leftId: nextLeft?.id ?? "",
        rightId: nextRight?.id ?? "",
        ...keys,
        name: defaultJoinName(nextLeft, nextRight),
      };
    });
  }

  // The side selects exclude each other's pick, so with exactly two datasets
  // the only way to reverse the join direction is an explicit swap.
  function swapSides() {
    setError(null);
    setForm((prev) => ({
      ...prev,
      leftId: prev.rightId,
      rightId: prev.leftId,
      leftKey: prev.rightKey,
      rightKey: prev.leftKey,
      name: defaultJoinName(right, left),
    }));
  }

  const preview = useMemo(() => {
    if (!left || !right || !form.leftKey || !form.rightKey || left.id === right.id) return null;
    return countJoinMatches(left, right, form.leftKey, form.rightKey);
  }, [left, right, form.leftKey, form.rightKey]);

  const canMerge =
    !!left && !!right && left.id !== right.id && !!form.leftKey && !!form.rightKey &&
    !(form.joinType === "inner" && preview?.matchedLeftRows === 0);

  function merge() {
    setError(null);
    try {
      createJoinedDataset({
        name: form.name,
        leftId: form.leftId,
        rightId: form.rightId,
        leftKey: form.leftKey,
        rightKey: form.rightKey,
        joinType: form.joinType,
        pageTarget,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed.");
    }
  }

  const datasetOptions = (excludeId: string) =>
    datasets
      .filter((d) => d.id !== excludeId)
      .map((d) => ({
        value: d.id,
        label: `${d.name}${d.isJoined ? " (joined)" : ""} · ${d.rows.length.toLocaleString()} rows`,
      }));

  const columnOptions = (dataset: Dataset | null) =>
    dataset ? dataset.columns.map((c) => ({ value: c.id, label: `${c.name} · ${c.type}` })) : [];

  return (
    <>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Combine two uploaded datasets on a shared key column (e.g. <b>vendor_id</b>) into one
        composite dataset the dashboard reads like any other CSV.
      </p>

      {datasets.length < 2 ? (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Upload at least two CSVs to merge — use the &quot;Upload CSV&quot; button on any dashboard page.
        </p>
      ) : (
        <>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={swapSides}
              disabled={!left || !right}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Swap sides
            </button>
          </div>
          <div className="mt-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <FilterSelect
                label="Primary dataset (left)"
                value={form.leftId}
                options={datasetOptions(form.rightId)}
                onChange={(v) => selectDataset("left", v)}
              />
              <FilterSelect
                label="Left key"
                value={form.leftKey}
                options={columnOptions(left)}
                onChange={(v) => setForm((prev) => ({ ...prev, leftKey: v }))}
              />
            </div>
            <div className="space-y-3">
              <FilterSelect
                label="Secondary dataset (right)"
                value={form.rightId}
                options={datasetOptions(form.leftId)}
                onChange={(v) => selectDataset("right", v)}
              />
              <FilterSelect
                label="Right key"
                value={form.rightKey}
                options={columnOptions(right)}
                onChange={(v) => setForm((prev) => ({ ...prev, rightKey: v }))}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Join type
              </p>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                {(
                  [
                    { value: "left", label: "Left join (keep all left rows)" },
                    { value: "inner", label: "Inner join (matches only)" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, joinType: opt.value }))}
                    className={cn(
                      "px-3 py-2 text-xs font-medium transition-colors",
                      form.joinType === opt.value
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex-1 basis-48 space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                New dataset name
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:focus:ring-slate-500"
              />
            </label>
          </div>

          {preview && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <GitMerge className="h-4 w-4 shrink-0 text-slate-500" />
              <span>
                <b>{preview.matchedLeftRows.toLocaleString()}</b> out of{" "}
                <b>{preview.leftRows.toLocaleString()}</b> rows matched —{" "}
                {form.joinType === "left"
                  ? `left join keeps all ${preview.leftRows.toLocaleString()} rows`
                  : `inner join keeps ${preview.matchedLeftRows.toLocaleString()} matched rows`}
              </span>
            </p>
          )}

          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Dialog.Close className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
          Cancel
        </Dialog.Close>
        <button
          type="button"
          onClick={merge}
          disabled={!canMerge}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          <GitMerge className="h-4 w-4" />
          Merge &amp; Apply
        </button>
      </div>
    </>
  );
}

/**
 * Modal for merging two uploaded CSVs into a materialized composite dataset.
 * On "Merge & Apply" the joined output is stored in DatasetsContext, tagged
 * to `pageTarget`, and made the active dataset so the page re-renders on it.
 */
export function JoinDialog({ open, onOpenChange, pageTarget }: JoinDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Merge datasets
            </Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Close merge dialog"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <JoinDialogForm pageTarget={pageTarget} onDone={() => onOpenChange(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
