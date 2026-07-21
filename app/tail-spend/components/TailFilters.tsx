"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { SpendSegment } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";

export interface TailFilterState {
  microPOThreshold: number;
  category: string;
  segment: "All" | SpendSegment;
  microPOOnly: boolean;
}

export const ALL_CATEGORIES = "All Categories";
export const DEFAULT_TAIL_FILTERS: TailFilterState = {
  microPOThreshold: 25_000,
  category: ALL_CATEGORIES,
  segment: "All",
  microPOOnly: false,
};

interface TailFiltersProps {
  value: TailFilterState;
  onChange: (next: TailFilterState) => void;
  categories: string[];
}

const SEGMENT_OPTIONS: Array<"All" | SpendSegment> = ["All", "Strategic", "Core", "Tail"];

/**
 * Single filter row scoping every chart below it — threshold slider, category
 * and segment drop-downs, and the micro-PO isolation toggle. All state is
 * lifted to the page so every view re-renders against the same slice.
 */
export function TailFilters({ value, onChange, categories }: TailFiltersProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 lg:flex-row lg:items-center lg:gap-6">
      <div className="flex items-center gap-2 text-slate-300">
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Filters
        </span>
      </div>

      <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="micro-po-threshold" className="text-xs font-medium text-slate-400">
            Micro-PO threshold
          </label>
          <span className="text-sm font-semibold text-slate-100">
            {formatINR(value.microPOThreshold)}
          </span>
        </div>
        <input
          id="micro-po-threshold"
          type="range"
          min={5_000}
          max={100_000}
          step={5_000}
          value={value.microPOThreshold}
          onChange={(event) =>
            onChange({ ...value, microPOThreshold: Number(event.target.value) })
          }
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-amber-500"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <FilterSelect
          id="tail-filter-category"
          label="Category"
          value={value.category}
          options={[ALL_CATEGORIES, ...categories]}
          onChange={(category) => onChange({ ...value, category })}
        />
        <FilterSelect
          id="tail-filter-segment"
          label="Segment"
          value={value.segment}
          options={SEGMENT_OPTIONS}
          onChange={(segment) => onChange({ ...value, segment: segment as TailFilterState["segment"] })}
        />
      </div>

      <div className="flex items-center gap-2.5 self-start pt-1 lg:self-auto lg:pt-0">
        <button
          type="button"
          role="switch"
          aria-checked={value.microPOOnly}
          aria-label="Micro-POs only"
          onClick={() => onChange({ ...value, microPOOnly: !value.microPOOnly })}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
            value.microPOOnly ? "bg-amber-500" : "bg-slate-700"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              value.microPOOnly ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="whitespace-nowrap text-xs font-medium text-slate-300">
          Micro-POs only
        </span>
      </div>
    </div>
  );
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function FilterSelect({ id, label, value, options, onChange }: FilterSelectProps) {
  return (
    <div className="flex min-w-[168px] flex-1 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-slate-400">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-md border border-slate-700 bg-slate-800 py-1.5 pl-3 pr-9 text-sm text-slate-100 shadow-sm transition-colors hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
      </div>
    </div>
  );
}
