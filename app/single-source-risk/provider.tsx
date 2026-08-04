"use client";

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { invoices as staticInvoices, sourceSystemDims } from "./data";
import {
  applyBaseFilters,
  applyFilters,
  applyLinkedSelection,
  getAvailableMonths,
  getCategoryFilterOptions,
  getDefaultMonthRange,
  getGlobalUltimateFilterOptions,
  getPlantFilterOptions,
  getSourceSystemFilterOptions,
  monthIndex,
  type FilterOption,
} from "./selectors";
import type { FilterState, Invoice, LinkedDimension, LinkedSelection, SupplierCountThreshold } from "./types";

interface State {
  filters: FilterState;
  selection: LinkedSelection | null;
}

type Action =
  | { type: "SET_START_MONTH"; month: string }
  | { type: "SET_END_MONTH"; month: string }
  | { type: "SET_CATEGORY"; code: string | null }
  | { type: "SET_GLOBAL_ULTIMATE"; id: string | null }
  | { type: "SET_SOURCE_SYSTEM"; id: string | null }
  | { type: "SET_PLANT"; id: string | null }
  | { type: "SET_SUPPLIER_COUNT_PER_CATEGORY"; value: SupplierCountThreshold }
  | { type: "SELECT"; dimension: LinkedDimension; value: string; label: string }
  | { type: "CLEAR_SELECTION" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    // Picking a start after the current end (or an end before the current
    // start) drags the other bound along instead of producing an empty window.
    case "SET_START_MONTH": {
      const startMonth = action.month;
      const endMonth =
        monthIndex(startMonth) > monthIndex(state.filters.endMonth) ? startMonth : state.filters.endMonth;
      return { filters: { ...state.filters, startMonth, endMonth }, selection: null };
    }
    case "SET_END_MONTH": {
      const endMonth = action.month;
      const startMonth =
        monthIndex(endMonth) < monthIndex(state.filters.startMonth) ? endMonth : state.filters.startMonth;
      return { filters: { ...state.filters, startMonth, endMonth }, selection: null };
    }
    case "SET_CATEGORY":
      return { filters: { ...state.filters, categoryCode: action.code }, selection: null };
    case "SET_GLOBAL_ULTIMATE":
      return { filters: { ...state.filters, globalUltimateId: action.id }, selection: null };
    case "SET_SOURCE_SYSTEM":
      return { filters: { ...state.filters, sourceSystemId: action.id }, selection: null };
    case "SET_PLANT":
      return { filters: { ...state.filters, plantId: action.id }, selection: null };
    case "SET_SUPPLIER_COUNT_PER_CATEGORY":
      return { filters: { ...state.filters, supplierCountPerCategory: action.value }, selection: null };
    case "SELECT": {
      const isSameSelection =
        state.selection?.dimension === action.dimension && state.selection?.value === action.value;
      return {
        ...state,
        selection: isSameSelection
          ? null
          : { dimension: action.dimension, value: action.value, label: action.label },
      };
    }
    case "CLEAR_SELECTION":
      return { ...state, selection: null };
    default:
      return state;
  }
}

interface SingleSourceRiskContextValue {
  filters: FilterState;
  selection: LinkedSelection | null;
  /** Filters applied, selection NOT applied — what KPIs and a widget's own dimension read from. */
  filteredInvoices: Invoice[];
  /** Filters + linked-analysis selection applied — what sibling widgets and the table read from. */
  scopedInvoices: Invoice[];
  /**
   * Date/category/GU/source-system/plant filters applied, but WITHOUT the
   * "Number of Suppliers per Category" cut — the full category population
   * for widgets that classify risk themselves instead of only showing
   * categories that already pass the threshold (risk quadrant, exposure
   * trend, segment roll-up).
   */
  baseFilteredInvoices: Invoice[];
  setStartMonth: (month: string) => void;
  setEndMonth: (month: string) => void;
  setCategory: (code: string | null) => void;
  setGlobalUltimate: (id: string | null) => void;
  setSourceSystem: (id: string | null) => void;
  setPlant: (id: string | null) => void;
  setSupplierCountPerCategory: (value: SupplierCountThreshold) => void;
  select: (dimension: LinkedDimension, value: string, label: string) => void;
  clearSelection: () => void;
  /** Every invoice month present in the data, ascending — feeds both range dropdowns. */
  monthOptions: string[];
  categoryOptions: FilterOption[];
  globalUltimateOptions: FilterOption[];
  sourceSystemOptions: FilterOption[];
  plantOptions: FilterOption[];
}

const SingleSourceRiskContext = createContext<SingleSourceRiskContextValue | null>(null);

interface SingleSourceRiskProviderProps {
  children: ReactNode;
  /**
   * Invoice list to drive the dashboard — an uploaded dataset mapped via
   * buildInvoicesFromDataset, falling back to the static mock when absent.
   * Callers should remount the provider (React key) when this changes so
   * filter state resets against the new data.
   */
  invoices?: Invoice[];
}

export function SingleSourceRiskProvider({ children, invoices }: SingleSourceRiskProviderProps) {
  const invoiceData = invoices ?? staticInvoices;

  const monthOptions = useMemo(() => getAvailableMonths(invoiceData), [invoiceData]);
  const categoryOptions = useMemo(() => getCategoryFilterOptions(invoiceData), [invoiceData]);
  const globalUltimateOptions = useMemo(() => getGlobalUltimateFilterOptions(invoiceData), [invoiceData]);
  const sourceSystemOptions = useMemo(
    () => getSourceSystemFilterOptions(invoiceData, sourceSystemDims),
    [invoiceData]
  );
  const plantOptions = useMemo(() => getPlantFilterOptions(invoiceData), [invoiceData]);

  const [state, dispatch] = useReducer(reducer, invoiceData, (data): State => ({
    filters: {
      ...getDefaultMonthRange(data),
      categoryCode: null,
      globalUltimateId: null,
      sourceSystemId: null,
      plantId: null,
      supplierCountPerCategory: 1,
    },
    selection: null,
  }));

  const filteredInvoices = useMemo(() => applyFilters(invoiceData, state.filters), [invoiceData, state.filters]);
  const scopedInvoices = useMemo(
    () => applyLinkedSelection(filteredInvoices, state.selection),
    [filteredInvoices, state.selection]
  );
  const baseFilteredInvoices = useMemo(
    () => applyBaseFilters(invoiceData, state.filters),
    [invoiceData, state.filters]
  );

  const value = useMemo<SingleSourceRiskContextValue>(
    () => ({
      filters: state.filters,
      selection: state.selection,
      filteredInvoices,
      scopedInvoices,
      baseFilteredInvoices,
      setStartMonth: (month) => dispatch({ type: "SET_START_MONTH", month }),
      setEndMonth: (month) => dispatch({ type: "SET_END_MONTH", month }),
      setCategory: (code) => dispatch({ type: "SET_CATEGORY", code }),
      setGlobalUltimate: (id) => dispatch({ type: "SET_GLOBAL_ULTIMATE", id }),
      setSourceSystem: (id) => dispatch({ type: "SET_SOURCE_SYSTEM", id }),
      setPlant: (id) => dispatch({ type: "SET_PLANT", id }),
      setSupplierCountPerCategory: (value) => dispatch({ type: "SET_SUPPLIER_COUNT_PER_CATEGORY", value }),
      select: (dimension, value, label) => dispatch({ type: "SELECT", dimension, value, label }),
      clearSelection: () => dispatch({ type: "CLEAR_SELECTION" }),
      monthOptions,
      categoryOptions,
      globalUltimateOptions,
      sourceSystemOptions,
      plantOptions,
    }),
    [
      state,
      filteredInvoices,
      scopedInvoices,
      baseFilteredInvoices,
      monthOptions,
      categoryOptions,
      globalUltimateOptions,
      sourceSystemOptions,
      plantOptions,
    ]
  );

  return <SingleSourceRiskContext.Provider value={value}>{children}</SingleSourceRiskContext.Provider>;
}

export function useSingleSourceRisk(): SingleSourceRiskContextValue {
  const ctx = useContext(SingleSourceRiskContext);
  if (!ctx) throw new Error("useSingleSourceRisk must be used within a SingleSourceRiskProvider");
  return ctx;
}

/**
 * Convenience for widgets: pass the dimension THIS widget groups by. Returns
 * the correct invoice set per the linked-analysis rule (own dimension keeps
 * all bars visible; every other widget + the table narrows), plus whether a
 * given key is the actively-selected one (for highlighting).
 */
export function useWidgetInvoices(ownDimension: LinkedDimension) {
  const { filteredInvoices, scopedInvoices, selection, select } = useSingleSourceRisk();
  const invoicesForWidget = selection?.dimension === ownDimension ? filteredInvoices : scopedInvoices;
  const selectedKey = selection?.dimension === ownDimension ? selection.value : null;
  return {
    invoicesForWidget,
    selectedKey,
    onBarClick: (value: string, label: string) => select(ownDimension, value, label),
  };
}
