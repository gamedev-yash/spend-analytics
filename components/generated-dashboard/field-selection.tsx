"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
// The "Other columns" group (identifiers, free text, constants) is collapsed
// by default. It's off by default too, so surfacing it expanded would put the
// longest, least useful list at the bottom of every dataset with an ID column.

interface FieldSelectionProps {
  fields: FieldOption[];
  /** Selected column names, in `fields` order. */
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

function FieldRow({
  field,
  checked,
  disabled,
  onToggle,
}: {
  field: FieldOption;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={onToggle}
        className="mt-0.5 shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-800 dark:text-slate-100" title={field.name}>
          {field.name}
        </span>
        <span
          className="block truncate text-xs text-slate-500 dark:text-slate-400"
          title={field.detail}
        >
          {field.detail}
        </span>
      </span>
    </label>
  );
}

export function FieldSelection({ fields, selected, onChange, disabled }: FieldSelectionProps) {
  const [showOther, setShowOther] = useState(false);
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

  function setGroup(group: FieldGroup, on: boolean) {
    const next = new Set(chosen);
    for (const field of fields) {
      if (field.group !== group) continue;
      if (on) next.add(field.name);
      else next.delete(field.name);
    }
    emit(next);
  }

  const groups = FIELD_GROUP_ORDER.map((group) => ({
    group,
    items: fields.filter((f) => f.group === group),
  })).filter((entry) => entry.items.length > 0);

  return (
    <div className="space-y-4">
      {groups.map(({ group, items }) => {
        const chosenCount = items.filter((f) => chosen.has(f.name)).length;
        const isOther = group === "other";
        const collapsed = isOther && !showOther;

        return (
          <section key={group}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                {isOther ? (
                  <button
                    type="button"
                    onClick={() => setShowOther((v) => !v)}
                    aria-expanded={showOther}
                    className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    {collapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {FIELD_GROUP_LABELS[group]}
                    <span className="font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">
                      ({items.length})
                    </span>
                  </button>
                ) : (
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {FIELD_GROUP_LABELS[group]}{" "}
                    <span className="font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">
                      {chosenCount} of {items.length} selected
                    </span>
                  </p>
                )}
                {!collapsed && (
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    {FIELD_GROUP_HINTS[group]}
                  </p>
                )}
              </div>

              {!collapsed && items.length > 1 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setGroup(group, chosenCount < items.length)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  {chosenCount < items.length ? "Select all" : "Clear"}
                </button>
              )}
            </div>

            {!collapsed && (
              <div className="mt-1.5 grid gap-x-4 sm:grid-cols-2">
                {items.map((field) => (
                  <FieldRow
                    key={field.name}
                    field={field}
                    checked={chosen.has(field.name)}
                    disabled={disabled}
                    onToggle={() => toggle(field.name)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
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
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Preview{" "}
        <span className="font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">
          first {previewRows.length} rows
          {hidden > 0 && ` · ${shown.length} of ${columns.length} selected columns`}
        </span>
      </p>
      <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
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
    </div>
  );
}
