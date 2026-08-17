"use client";

import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FIELD_GROUP_HINTS,
  FIELD_GROUP_LABELS,
  FIELD_GROUP_ORDER,
  type FieldGroup,
  type FieldOption,
} from "@/lib/generated-dashboard/fields";
import { cn } from "@/lib/utils";

// The dimension/measure picker, shared by both data sources.
//
// Everything it renders comes out of the dataset's own profile — the roles,
// the summaries, the recommended defaults — so a platform spend table and an
// uploaded CSV present identically, and this component knows about neither.
//
// Fields are browsed one group (Measures/Dimensions/Time/Other) at a time via
// tabs, so a wide profile doesn't turn into one long scroll. Typing in the
// search box steps outside that grouping and flattens all groups into one
// filtered list, since the whole point of a search is not having to know
// which tab a field lives under.

interface FieldSelectionProps {
  fields: FieldOption[];
  /** Selected column names, in `fields` order. */
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/** Tint for a group's selected-count badge on its tab — purely a scanning aid. */
const GROUP_TAB_ACCENT: Record<FieldGroup, string> = {
  measure: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  dimension: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  temporal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  other: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

function FieldCard({
  field,
  checked,
  disabled,
  onToggle,
  groupLabel,
}: {
  field: FieldOption;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  /** Shown only in search results, where fields from different groups sit side by side. */
  groupLabel?: string;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-3 py-2 ring-1 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-60 ring-slate-200 dark:ring-slate-800"
          : checked
            ? "cursor-pointer bg-emerald-50/70 ring-emerald-500/30 hover:bg-emerald-50 dark:bg-emerald-500/10 dark:ring-emerald-500/25"
            : "cursor-pointer ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800/60 dark:hover:ring-slate-700"
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={onToggle}
        className="mt-0.5 shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={field.name}>
            {field.name}
          </span>
          {groupLabel && (
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {groupLabel}
            </span>
          )}
          {field.recommended && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
              <Sparkles className="h-2.5 w-2.5" />
              Recommended
            </span>
          )}
        </span>
        <span
          className="mt-0.5 block truncate font-mono text-[11px] text-slate-500 dark:text-slate-400"
          title={field.detail}
        >
          {field.detail}
        </span>
      </span>
    </label>
  );
}

export function FieldSelection({ fields, selected, onChange, disabled }: FieldSelectionProps) {
  const [query, setQuery] = useState("");
  const chosen = useMemo(() => new Set(selected), [selected]);

  /** Emit in `fields` order, so the projected column order matches the source's. */
  function emit(next: Set<string>) {
    onChange(fields.filter((f) => next.has(f.name)).map((f) => f.name));
  }

  function toggle(name: string) {
    const next = new Set(chosen);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    emit(next);
  }

  function setMany(names: string[], on: boolean) {
    const next = new Set(chosen);
    for (const name of names) {
      if (on) next.add(name);
      else next.delete(name);
    }
    emit(next);
  }

  const groups = useMemo(
    () =>
      FIELD_GROUP_ORDER.map((group) => ({
        group,
        items: fields.filter((f) => f.group === group),
      })).filter((entry) => entry.items.length > 0),
    [fields]
  );

  const trimmedQuery = query.trim();
  const searching = trimmedQuery.length > 0;
  const matches = useMemo(
    () =>
      searching
        ? fields.filter((f) => f.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
        : [],
    [fields, searching, trimmedQuery]
  );
  const matchesChosenCount = matches.filter((f) => chosen.has(f.name)).length;

  if (fields.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder="Search fields…"
          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-2.5 pl-8 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-1 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500"
        />
      </div>

      {searching ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {matches.length} of {fields.length} fields match &ldquo;{trimmedQuery}&rdquo;
            </p>
            {matches.length > 1 && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setMany(matches.map((f) => f.name), matchesChosenCount < matches.length)}
                className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                {matchesChosenCount < matches.length ? "Select all matches" : "Clear matches"}
              </button>
            )}
          </div>

          {matches.length > 0 ? (
            <Card size="sm" className="mt-2">
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2">
                  {matches.map((field) => (
                    <FieldCard
                      key={field.name}
                      field={field}
                      checked={chosen.has(field.name)}
                      disabled={disabled}
                      onToggle={() => toggle(field.name)}
                      groupLabel={FIELD_GROUP_LABELS[field.group]}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
              No fields match that search.
            </p>
          )}
        </div>
      ) : (
        // Remounts (via key) when the available groups change — e.g. switching
        // spend datasets — so the tab selection always starts back on the
        // first non-empty group instead of opening on a group that no longer
        // exists for the newly loaded source.
        <Tabs key={groups.map((entry) => entry.group).join("-")} defaultValue={groups[0]?.group}>
          <div className="overflow-x-auto">
            <TabsList>
              {groups.map(({ group, items }) => {
                const chosenCount = items.filter((f) => chosen.has(f.name)).length;
                return (
                  <TabsTrigger key={group} value={group} className="gap-1.5">
                    {FIELD_GROUP_LABELS[group]}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                        chosenCount > 0
                          ? GROUP_TAB_ACCENT[group]
                          : "bg-slate-200/70 text-slate-500 dark:bg-slate-700/70 dark:text-slate-400"
                      )}
                    >
                      {chosenCount}/{items.length}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {groups.map(({ group, items }) => {
            const chosenCount = items.filter((f) => chosen.has(f.name)).length;
            return (
              <TabsContent key={group} value={group} className="mt-3">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <p className="max-w-md text-xs text-slate-400 dark:text-slate-500">
                    {FIELD_GROUP_HINTS[group]}
                  </p>
                  {items.length > 1 && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setMany(items.map((f) => f.name), chosenCount < items.length)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    >
                      {chosenCount < items.length ? "Select all" : "Clear"}
                    </button>
                  )}
                </div>

                <Card size="sm" className="mt-2">
                  <CardContent>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {items.map((field) => (
                        <FieldCard
                          key={field.name}
                          field={field}
                          checked={chosen.has(field.name)}
                          disabled={disabled}
                          onToggle={() => toggle(field.name)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

const PREVIEW_ROWS = 5;
const PREVIEW_COLUMNS = 6;
const MAX_CELL_CHARS = 28;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  if (text === "") return "—";
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS - 1)}…` : text;
}

/**
 * First few rows of the selected columns — the check that the fields chosen
 * are the fields meant, before a generation run is spent on them. Scrolls
 * horizontally rather than wrapping: a squeezed table is harder to read than
 * one the user drags.
 */
export function DataPreview({
  rows,
  columns,
}: {
  rows: Record<string, unknown>[];
  columns: string[];
}) {
  if (columns.length === 0 || rows.length === 0) return null;

  const shown = columns.slice(0, PREVIEW_COLUMNS);
  const hidden = columns.length - shown.length;
  const previewRows = rows.slice(0, PREVIEW_ROWS);

  return (
    <Card size="sm">
      <div className="flex items-baseline justify-between gap-3 px-(--card-spacing)">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Preview
        </p>
        <p className="truncate text-xs text-slate-400 dark:text-slate-500">
          first {previewRows.length} rows
          {hidden > 0 && ` · ${shown.length} of ${columns.length} selected columns`}
        </p>
      </div>
      <div className="mt-2 overflow-x-auto border-t border-slate-100 dark:border-slate-800">
        <table className="w-full min-w-max border-collapse text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              {shown.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-3 py-2 font-medium text-slate-600 dark:text-slate-300"
                >
                  {column}
                </th>
              ))}
              {hidden > 0 && (
                <th className="whitespace-nowrap px-3 py-2 font-normal text-slate-400 dark:text-slate-500">
                  +{hidden} more
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, index) => (
              <tr
                key={index}
                className="border-t border-slate-100 text-slate-600 dark:border-slate-800 dark:text-slate-400"
              >
                {shown.map((column) => (
                  <td key={column} className="whitespace-nowrap px-3 py-1.5">
                    {cellText(row[column])}
                  </td>
                ))}
                {hidden > 0 && <td className="px-3 py-1.5 text-slate-300 dark:text-slate-600">…</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
