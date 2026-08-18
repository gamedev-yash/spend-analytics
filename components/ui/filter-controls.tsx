"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown, FilterX } from "lucide-react";
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

interface FilterMonthRangeProps {
  label: string;
  /** All selectable months, ascending. Values are opaque keys (e.g. "YYYY-MM"). */
  options: FilterSelectOption[];
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  className?: string;
}

/**
 * Two month dropdowns under one label — an inclusive start..end window.
 *
 * The start list is capped at the current end and the end list floored at the
 * current start, so an inverted range can't be selected in the first place.
 * Callers should still clamp in their reducer, since a dataset swap can move
 * the bounds underneath the current selection.
 */
export function FilterMonthRange({
  label,
  options,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  className,
}: FilterMonthRangeProps) {
  const startId = useId();
  const endId = useId();

  const endIndex = options.findIndex((option) => option.value === endValue);
  const startIndex = options.findIndex((option) => option.value === startValue);
  const startOptions = endIndex === -1 ? options : options.slice(0, endIndex + 1);
  const endOptions = startIndex === -1 ? options : options.slice(startIndex);
  const monthSpan = startIndex === -1 || endIndex === -1 ? null : endIndex - startIndex + 1;

  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={startId} className="block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            From
          </label>
          <div className="relative">
            <select
              id={startId}
              value={startValue}
              onChange={(event) => onStartChange(event.target.value)}
              className="w-full appearance-none rounded-md border border-slate-200 bg-white px-2.5 py-2 pr-7 text-sm text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:focus:ring-slate-500"
            >
              {startOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor={endId} className="block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            To
          </label>
          <div className="relative">
            <select
              id={endId}
              value={endValue}
              onChange={(event) => onEndChange(event.target.value)}
              className="w-full appearance-none rounded-md border border-slate-200 bg-white px-2.5 py-2 pr-7 text-sm text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:focus:ring-slate-500"
            >
              {endOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          </div>
        </div>
      </div>
      {monthSpan !== null && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {monthSpan} month{monthSpan === 1 ? "" : "s"} selected
        </p>
      )}
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

interface FilterDateRangeProps {
  /** Section label above both inputs — defaults to "Date Range"; pass something more specific (e.g. "Time Period") when that reads better for the page. */
  label?: string;
  fromValue: string;
  toValue: string;
  min?: string;
  max?: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  className?: string;
}

/**
 * The one Date Range control every dashboard filter bar should use — a pair
 * of native `<input type="date">` pickers, cross-constrained (FROM can't
 * exceed the current TO, TO can't precede the current FROM) so the range
 * can't invert through the picker itself. Purely presentational: it renders
 * whatever `fromValue`/`toValue` it's given and calls back on change — each
 * page owns its own state (URL params, local state, a store, whatever) and
 * decides what "on change" means.
 */
export function FilterDateRange({
  label = "Date Range",
  fromValue,
  toValue,
  min,
  max,
  onFromChange,
  onToChange,
  className,
}: FilterDateRangeProps) {
  const fromId = useId();
  const toId = useId();
  const inputClassName =
    "h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:[color-scheme:dark]";

  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={fromId}
          type="date"
          value={fromValue}
          min={min}
          max={toValue || max}
          onChange={(event) => onFromChange(event.target.value)}
          className={inputClassName}
          aria-label={`${label} — from`}
        />
        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">to</span>
        <input
          id={toId}
          type="date"
          value={toValue}
          min={fromValue || min}
          max={max}
          onChange={(event) => onToChange(event.target.value)}
          className={inputClassName}
          aria-label={`${label} — to`}
        />
      </div>
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
          "relative h-5 w-9 shrink-0 overflow-hidden rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900",
          checked ? "bg-slate-900 dark:bg-slate-100" : "bg-slate-200 dark:bg-slate-700"
        )}
      >
        <span
          className={cn(
            "pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow-sm transition-transform",
            checked
              ? "translate-x-4 bg-white dark:bg-slate-900"
              : "translate-x-0 bg-white dark:bg-slate-300"
          )}
        />
      </button>
    </div>
  );
}

interface ClearFiltersButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

/**
 * The one "Clear Filters" control every dashboard's Filter Drawer should
 * use — same icon, label, and styling everywhere, so pages differ only in
 * what `onClick` actually resets. Callers decide when to render it (e.g.
 * `{hasActiveFilters && <ClearFiltersButton onClick={resetFilters} />}`) and
 * where — the established convention is last, after every other control in
 * the main "Filters" group.
 */
export function ClearFiltersButton({ onClick, label = "Clear Filters", className }: ClearFiltersButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
        className
      )}
    >
      <FilterX className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
