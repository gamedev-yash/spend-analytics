"use client";

import { ChevronDown } from "lucide-react";

export interface FilterDropdownOption {
  value: string;
  label: string;
}

export interface FilterDropdownProps {
  label: string;
  placeholder?: string;
  /** When provided, renders a real controlled <select> instead of the inert button. */
  options?: FilterDropdownOption[];
  /** Current value; empty string represents the "All ..." / placeholder option. */
  value?: string;
  onChange?: (value: string) => void;
  /**
   * Whether to render a leading `<option value="">{placeholder}</option>`.
   * Default true. Set false for controls where every option is a real,
   * always-applicable value with no "All" state (e.g. a fixed date window
   * that must always resolve to some concrete option).
   */
  includePlaceholderOption?: boolean;
}

/**
 * Reusable filter control. Without `options` it stays the original inert,
 * presentational button (unwired routes are unaffected). With `options` +
 * `value` + `onChange` it becomes a real controlled dropdown.
 */
export function FilterDropdown({
  label,
  placeholder = "All",
  options,
  value,
  onChange,
  includePlaceholderOption = true,
}: FilterDropdownProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </label>
      {options ? (
        <div className="relative">
          <select
            aria-label={label}
            value={value ?? ""}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full appearance-none truncate rounded-md border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {includePlaceholderOption && <option value="">{placeholder}</option>}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm transition-colors hover:border-slate-300"
        >
          <span className="truncate">{placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      )}
    </div>
  );
}
