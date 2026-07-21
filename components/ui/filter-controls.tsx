"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterGroupProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Section wrapper for a cluster of related filters — an uppercase label
 * followed by a divider that fills the remaining width, then the controls.
 * Compose several inside a FilterBar registration to separate e.g. "Global
 * Filters" from a page-specific "Analysis Options" section.
 */
export function FilterGroup({ title, children, className }: FilterGroupProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2">
        <h2 className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {title}
        </h2>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export interface FilterSelectOption {
  label: string;
  value: string;
}

interface FilterSelectProps {
  label: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  id?: string;
  className?: string;
}

/** Styled, labeled `<select>` — the standard dropdown filter control. */
export function FilterSelect({ label, value, options, onChange, id, className }: FilterSelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={selectId} className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-md border border-slate-200 bg-white px-3 py-2 pr-9 text-sm text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:focus:ring-slate-500"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
      </div>
    </div>
  );
}

interface FilterSliderProps {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  formatValue?: (value: number) => string;
  id?: string;
  className?: string;
}

/** Range slider with a live, formatted value readout next to the label. */
export function FilterSlider({
  label,
  min,
  max,
  value,
  onChange,
  step = 1,
  formatValue,
  id,
  className,
}: FilterSliderProps) {
  const generatedId = useId();
  const sliderId = id ?? generatedId;
  const displayValue = formatValue ? formatValue(value) : String(value);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={sliderId} className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </label>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{displayValue}</span>
      </div>
      <input
        id={sliderId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-700 dark:bg-slate-700 dark:accent-slate-300"
      />
    </div>
  );
}

interface FilterToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  className?: string;
}

/** Switch-style boolean control — a labeled row with a rounded toggle. */
export function FilterToggle({ label, checked, onChange, id, className }: FilterToggleProps) {
  const generatedId = useId();
  const toggleId = id ?? generatedId;

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <label htmlFor={toggleId} className="text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
      </label>
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900",
          checked ? "bg-slate-900 dark:bg-slate-100" : "bg-slate-200 dark:bg-slate-700"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}
