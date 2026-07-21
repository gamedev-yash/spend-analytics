"use client";

import { ChevronDown, Filter } from "lucide-react";
import { ALL_CATEGORIES } from "./TailFilters";

export const ALL_SUPPLIERS = "All Suppliers";
export const ALL_SOURCE_SYSTEMS = "All Source Systems";
export const ALL_PLANTS = "All Plants/Sites";

export interface SapFilterState {
  dateRange: string;
  category: string;
  supplierGlobalUltimate: string;
  sourceSystem: string;
  plantSite: string;
}

export function defaultSapFilters(dateRange: string): SapFilterState {
  return {
    dateRange,
    category: ALL_CATEGORIES,
    supplierGlobalUltimate: ALL_SUPPLIERS,
    sourceSystem: ALL_SOURCE_SYSTEMS,
    plantSite: ALL_PLANTS,
  };
}

interface SapFilterPanelProps {
  value: SapFilterState;
  onChange: (next: SapFilterState) => void;
  dateRanges: string[];
  categories: string[];
  suppliers: string[];
  sourceSystems: string[];
  plantSites: string[];
}

/**
 * Left sidebar of the SAP standard workspace — Date Range, Category, Supplier
 * (Global Ultimate), Source System, Plant/Site. Fixed order and labels per the
 * SAP Spend Control Tower spec.
 */
export function SapFilterPanel({
  value,
  onChange,
  dateRanges,
  categories,
  suppliers,
  sourceSystems,
  plantSites,
}: SapFilterPanelProps) {
  return (
    <div className="flex h-fit flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 lg:w-64 lg:shrink-0">
      <div className="flex items-center gap-2 text-slate-300">
        <Filter className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filters</span>
      </div>

      <SapSelect
        id="sap-filter-date-range"
        label="Date Range"
        value={value.dateRange}
        options={dateRanges}
        onChange={(dateRange) => onChange({ ...value, dateRange })}
      />
      <SapSelect
        id="sap-filter-category"
        label="Category"
        value={value.category}
        options={[ALL_CATEGORIES, ...categories]}
        onChange={(category) => onChange({ ...value, category })}
      />
      <SapSelect
        id="sap-filter-supplier"
        label="Supplier (Global Ultimate)"
        value={value.supplierGlobalUltimate}
        options={[ALL_SUPPLIERS, ...suppliers]}
        onChange={(supplierGlobalUltimate) => onChange({ ...value, supplierGlobalUltimate })}
      />
      <SapSelect
        id="sap-filter-source-system"
        label="Source System"
        value={value.sourceSystem}
        options={[ALL_SOURCE_SYSTEMS, ...sourceSystems]}
        onChange={(sourceSystem) => onChange({ ...value, sourceSystem })}
      />
      <SapSelect
        id="sap-filter-plant"
        label="Plant/Site"
        value={value.plantSite}
        options={[ALL_PLANTS, ...plantSites]}
        onChange={(plantSite) => onChange({ ...value, plantSite })}
      />
    </div>
  );
}

interface SapSelectProps {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function SapSelect({ id, label, value, options, onChange }: SapSelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-slate-400">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-md border border-slate-700 bg-slate-800 py-1.5 pl-3 pr-9 text-sm text-slate-100 shadow-sm transition-colors hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
