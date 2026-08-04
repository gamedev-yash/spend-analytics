"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GroupMode } from "../lib/types";
import { useFragmentation } from "./fragmentationStore";

interface Option {
  value: string;
  label: string;
}

/**
 * Dependency-free multi-select: a labeled button that opens a checkbox list.
 * Empty selection means "all", mirroring the prototype's dropdowns.
 */
function MultiSelect({
  label,
  placeholder,
  options,
  selected,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function toggle(value: string) {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
    );
  }

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selected`;

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      <label
        htmlFor={buttonId}
        className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500"
      >
        {label}
      </label>
      <button
        id={buttonId}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600"
      >
        <span className={cn("truncate text-left", selected.length === 0 && "text-slate-400 dark:text-slate-500")}>
          {summary}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50"
            >
              <X className="h-3.5 w-3.5" /> Clear selection
            </button>
          )}
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                      : "border-slate-300 dark:border-slate-600"
                  )}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500"
      >
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-[7px] text-sm text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:[color-scheme:dark]"
      />
    </div>
  );
}

const GROUPING_OPTIONS: { value: GroupMode; label: string }[] = [
  { value: "vendor", label: "By Vendor" },
  { value: "parent", label: "By Parent Company" },
];

/**
 * Global filter bar: Business Unit, Category L1, time range, and the critical
 * "By Vendor vs By Parent Company" grouping toggle.
 */
export function FragmentationControls() {
  const { payload, filters, mode, setPlants, setL1s, setDateRange, setMode } = useFragmentation();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_auto_auto_auto]">
        <MultiSelect
          label="Business Unit / Plant"
          placeholder="All business units"
          options={payload.plantOptions.map((p) => ({ value: p.code, label: p.name }))}
          selected={filters.plants}
          onChange={setPlants}
        />
        <MultiSelect
          label="Category (L1)"
          placeholder="All categories"
          options={payload.l1Options.map((l1) => ({ value: l1, label: l1 }))}
          selected={filters.l1s}
          onChange={setL1s}
        />
        <DateField
          label="From"
          value={filters.dateFrom}
          min={payload.dateMin}
          max={filters.dateTo || payload.dateMax}
          onChange={(from) => setDateRange(from, filters.dateTo)}
        />
        <DateField
          label="To"
          value={filters.dateTo}
          min={filters.dateFrom || payload.dateMin}
          max={payload.dateMax}
          onChange={(to) => setDateRange(filters.dateFrom, to)}
        />
        <div className="space-y-1.5">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Supplier Grouping
          </span>
          <div
            role="radiogroup"
            aria-label="Supplier grouping"
            className="inline-flex rounded-md border border-slate-200 p-0.5 dark:border-slate-700"
          >
            {GROUPING_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                onClick={() => setMode(option.value)}
                className={cn(
                  "whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === option.value
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
