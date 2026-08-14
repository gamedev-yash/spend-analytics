"use client";

import { useMemo, useState } from "react";
import { Check, LayoutGrid, Plus, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { GeneratedWidget } from "@/components/generated-dashboard/generated-widget";
import { matchesWidgetQuery, widgetSearchText } from "@/lib/generated-dashboard/search";
import { addWidgetFromLibrary } from "@/lib/generated-dashboard/store";
import { CHART_KIND_LABELS, type GeneratedDashboard, type WidgetSpec } from "@/types/generated-dashboard";
import { cn } from "@/lib/utils";

// "Add Widget" for a generated dashboard: browse the widgets Claude planned
// but didn't put on the opening screen, search them, preview the selected one
// against the dashboard's live (filtered) data, and add it.
//
// Everything here reuses the dashboard's own rendering path — the preview IS
// <GeneratedWidget>, the same component the grid mounts, over the same rows
// the grid is currently showing. There's no separate preview renderer to drift
// out of sync with the real one.

interface AddWidgetSheetProps {
  dashboard: GeneratedDashboard;
  /**
   * The rows the dashboard is currently displaying — filtered, not raw. A
   * preview drawn from unfiltered rows would show the user a chart they can't
   * actually get: the moment it's added it re-renders against these.
   */
  rows: Record<string, unknown>[];
}

/** Human label for a widget's grid footprint, so a full-width preview doesn't mislead about final size. */
function colSpanLabel(colSpan: WidgetSpec["colSpan"]): string {
  switch (colSpan) {
    case 3:
      return "Quarter width";
    case 4:
      return "Third width";
    case 6:
      return "Half width";
    case 8:
      return "Two-thirds width";
    case 12:
    default:
      return "Full width";
  }
}

function EmptyPane({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
      <LayoutGrid className="h-6 w-6 text-slate-400 dark:text-slate-600" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      <p className="max-w-xs text-xs text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

/** Sheet body — remounted per open (see the `open &&` guard), so search/selection always start fresh. */
function AddWidgetPanel({ dashboard, rows }: AddWidgetSheetProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  // Memoized, not a bare `?? []`: that fallback allocates a new array on every
  // render, which would defeat the memo on `haystacks` below and re-derive
  // every widget's search text on each keystroke.
  const library = useMemo(() => dashboard.library ?? [], [dashboard.library]);

  const sectionHeadings = useMemo(
    () => new Map((dashboard.plan.sections ?? []).map((s) => [s.id, s.heading])),
    [dashboard.plan.sections]
  );

  // Search text is derived per widget rather than per keystroke — the library
  // is stable between adds, so only the cheap `includes` runs while typing.
  const haystacks = useMemo(
    () => new Map(library.map((w) => [w.id, widgetSearchText(w, sectionHeadings.get(w.sectionId))])),
    [library, sectionHeadings]
  );

  const results = useMemo(
    () => library.filter((w) => matchesWidgetQuery(haystacks.get(w.id) ?? "", query)),
    [library, haystacks, query]
  );

  // Selection follows the result list: an explicit pick wins as long as it's
  // still visible, otherwise fall back to the first result. Keeps a preview on
  // screen while typing, and auto-advances after an add without an effect.
  const selected = results.find((w) => w.id === selectedId) ?? results[0] ?? null;

  function handleAdd() {
    if (!selected) return;
    addWidgetFromLibrary(dashboard.id, selected.id);
    setJustAdded(selected.title);
    setSelectedId(null);
  }

  if (library.length === 0) {
    return (
      <div className="min-h-0 flex-1 px-6 pb-6">
        <EmptyPane
          title="No widgets left to add"
          message={
            dashboard.library === undefined
              ? "This dashboard was generated before the widget catalog existed, so every widget it planned is already on screen. Generating a new dashboard from the same CSV will build one."
              : "Every widget Claude planned for this dataset is already on the dashboard."
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-6">
      <label className="relative block shrink-0">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="search"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search widgets — try a metric, column, or chart type"
          aria-label="Search available widgets"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-700 shadow-sm outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-slate-500"
        />
      </label>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* Left: the catalog list */}
        <div className="flex min-h-0 flex-col gap-2">
          <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {results.length} of {library.length} available
          </p>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {results.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No widgets match “{query}”.
              </p>
            )}
            {results.map((widget) => {
              const isSelected = selected?.id === widget.id;
              return (
                <button
                  key={widget.id}
                  type="button"
                  onClick={() => setSelectedId(widget.id)}
                  aria-current={isSelected}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    isSelected
                      ? "border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-800"
                      : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-800/60"
                  )}
                >
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {widget.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                    {CHART_KIND_LABELS[widget.kind]}
                    {sectionHeadings.get(widget.sectionId) && ` · ${sectionHeadings.get(widget.sectionId)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: live preview of the selected widget over the dashboard's current rows */}
        <div className="flex min-h-0 flex-col gap-3">
          {selected ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <GeneratedWidget widget={selected} rows={rows} preview />
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {colSpanLabel(selected.colSpan)} · previewing {rows.length.toLocaleString("en-IN")} rows
                </p>
                <Button onClick={handleAdd}>
                  <Plus className="h-4 w-4" />
                  Add to dashboard
                </Button>
              </div>
            </>
          ) : (
            <EmptyPane
              title="Nothing selected"
              message="Pick a widget from the list to preview it against this dashboard's current data."
            />
          )}
        </div>
      </div>

      {justAdded && (
        <p className="flex shrink-0 items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" />
          Added “{justAdded}” to the dashboard.
        </p>
      )}
    </div>
  );
}

/**
 * "Add Widget" trigger + panel. The catalog is `dashboard.library` — the
 * widgets Claude planned and flagged non-essential at generation time (see
 * lib/generated-dashboard/select-initial.ts) — so adding one costs no API
 * call: the spec already exists and is already validated against this
 * dataset's profile.
 */
export function AddWidgetSheet({ dashboard, rows }: AddWidgetSheetProps) {
  const [open, setOpen] = useState(false);
  const available = (dashboard.library ?? []).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Widget
        {available > 0 && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {available}
          </span>
        )}
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full gap-3 bg-white sm:max-w-3xl dark:bg-slate-900"
        aria-label="Add a widget to this dashboard"
      >
        <SheetHeader>
          <SheetTitle>Add a widget</SheetTitle>
          <SheetDescription>
            Widgets Claude planned for this dataset but kept off the opening screen. Previews use the
            dashboard&apos;s current filters.
          </SheetDescription>
        </SheetHeader>
        {open && <AddWidgetPanel dashboard={dashboard} rows={rows} />}
      </SheetContent>
    </Sheet>
  );
}
