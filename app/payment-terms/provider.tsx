"use client";

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { invoices as staticInvoices, sourceSystemDims } from "./data";
import {
  applyFilters,
  applyLinkedSelection,
  getCategoryFilterOptions,
  getDateBounds,
  getDefaultDateRange,
  getGlobalUltimateFilterOptions,
  getPaymentTermFilterOptions,
  getPlantFilterOptions,
  getSourceSystemFilterOptions,
  type FilterOption,
} from "./selectors";
import type { FilterState, Invoice, LinkedDimension, LinkedSelection } from "./types";

interface State {
  filters: FilterState;
  selection: LinkedSelection | null;
}

type Action =
  | { type: "SET_DATE_FROM"; date: string }
  | { type: "SET_DATE_TO"; date: string }
  | { type: "SET_CATEGORY"; code: string | null }
  | { type: "SET_GLOBAL_ULTIMATE"; id: string | null }
  | { type: "SET_SOURCE_SYSTEM"; id: string | null }
  | { type: "SET_PLANT"; id: string | null }
  | { type: "SET_PAYMENT_TERM"; code: string | null }
  | { type: "SELECT"; dimension: LinkedDimension; value: string; label: string }
  | { type: "CLEAR_SELECTION" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    // Picking a FROM after the current TO (or a TO before the current FROM)
    // drags the other bound along instead of producing an empty window. ISO
    // "YYYY-MM-DD" strings sort lexicographically, so plain comparison works.
    case "SET_DATE_FROM": {
      const dateFrom = action.date;
      const dateTo = dateFrom > state.filters.dateTo ? dateFrom : state.filters.dateTo;
      return { filters: { ...state.filters, dateFrom, dateTo }, selection: null };
    }
    case "SET_DATE_TO": {
      const dateTo = action.date;
      const dateFrom = dateTo < state.filters.dateFrom ? dateTo : state.filters.dateFrom;
      return { filters: { ...state.filters, dateFrom, dateTo }, selection: null };
    }
    case "SET_CATEGORY":
      return { filters: { ...state.filters, categoryCode: action.code }, selection: null };
    case "SET_GLOBAL_ULTIMATE":
      return { filters: { ...state.filters, globalUltimateId: action.id }, selection: null };
    case "SET_SOURCE_SYSTEM":
      return { filters: { ...state.filters, sourceSystemId: action.id }, selection: null };
    case "SET_PLANT":
      return { filters: { ...state.filters, plantId: action.id }, selection: null };
    case "SET_PAYMENT_TERM":
      return { filters: { ...state.filters, paymentTermCode: action.code }, selection: null };
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

interface PaymentTermsContextValue {
  filters: FilterState;
  selection: LinkedSelection | null;
  /** Filters applied, selection NOT applied — what KPIs and a widget's own dimension read from. */
  filteredInvoices: Invoice[];
  /** Filters + linked-analysis selection applied — what sibling widgets and the table read from. */
  scopedInvoices: Invoice[];
  setDateFrom: (date: string) => void;
  setDateTo: (date: string) => void;
  setCategory: (code: string | null) => void;
  setGlobalUltimate: (id: string | null) => void;
  setSourceSystem: (id: string | null) => void;
  setPlant: (id: string | null) => void;
  setPaymentTerm: (code: string | null) => void;
  select: (dimension: LinkedDimension, value: string, label: string) => void;
  clearSelection: () => void;
  /** Earliest/latest invoice date present in the data — feeds the date-range picker's min/max. */
  dateMin: string;
  dateMax: string;
  categoryOptions: FilterOption[];
  globalUltimateOptions: FilterOption[];
  paymentTermOptions: FilterOption[];
  sourceSystemOptions: FilterOption[];
  plantOptions: FilterOption[];
}

const PaymentTermsContext = createContext<PaymentTermsContextValue | null>(null);

interface PaymentTermsProviderProps {
  children: ReactNode;
  /**
   * Invoice list to drive the dashboard — an uploaded dataset mapped via
   * buildInvoicesFromDataset, falling back to the static mock when absent.
   * Callers should remount the provider (React key) when this changes so
   * filter state resets against the new data.
   */
  invoices?: Invoice[];
}

export function PaymentTermsProvider({ children, invoices }: PaymentTermsProviderProps) {
  const invoiceData = invoices ?? staticInvoices;

  // Option lists — derived once per invoice dataset.
  const { min: dateMin, max: dateMax } = useMemo(() => getDateBounds(invoiceData), [invoiceData]);
  const categoryOptions = useMemo(() => getCategoryFilterOptions(invoiceData), [invoiceData]);
  const globalUltimateOptions = useMemo(() => getGlobalUltimateFilterOptions(invoiceData), [invoiceData]);
  const paymentTermOptions = useMemo(() => getPaymentTermFilterOptions(invoiceData), [invoiceData]);
  const sourceSystemOptions = useMemo(
    () => getSourceSystemFilterOptions(invoiceData, sourceSystemDims),
    [invoiceData]
  );
  const plantOptions = useMemo(() => getPlantFilterOptions(invoiceData), [invoiceData]);

  const [state, dispatch] = useReducer(reducer, invoiceData, (data) => ({
    filters: {
      ...getDefaultDateRange(data),
      categoryCode: null,
      globalUltimateId: null,
      sourceSystemId: null,
      plantId: null,
      paymentTermCode: null,
    },
    selection: null,
  }));

  const filteredInvoices = useMemo(() => applyFilters(invoiceData, state.filters), [invoiceData, state.filters]);
  const scopedInvoices = useMemo(
    () => applyLinkedSelection(filteredInvoices, state.selection),
    [filteredInvoices, state.selection]
  );

  const value = useMemo<PaymentTermsContextValue>(
    () => ({
      filters: state.filters,
      selection: state.selection,
      filteredInvoices,
      scopedInvoices,
      setDateFrom: (date) => dispatch({ type: "SET_DATE_FROM", date }),
      setDateTo: (date) => dispatch({ type: "SET_DATE_TO", date }),
      setCategory: (code) => dispatch({ type: "SET_CATEGORY", code }),
      setGlobalUltimate: (id) => dispatch({ type: "SET_GLOBAL_ULTIMATE", id }),
      setSourceSystem: (id) => dispatch({ type: "SET_SOURCE_SYSTEM", id }),
      setPlant: (id) => dispatch({ type: "SET_PLANT", id }),
      setPaymentTerm: (code) => dispatch({ type: "SET_PAYMENT_TERM", code }),
      select: (dimension, value, label) => dispatch({ type: "SELECT", dimension, value, label }),
      clearSelection: () => dispatch({ type: "CLEAR_SELECTION" }),
      dateMin,
      dateMax,
      categoryOptions,
      globalUltimateOptions,
      paymentTermOptions,
      sourceSystemOptions,
      plantOptions,
    }),
    [
      state,
      filteredInvoices,
      scopedInvoices,
      dateMin,
      dateMax,
      categoryOptions,
      globalUltimateOptions,
      paymentTermOptions,
      sourceSystemOptions,
      plantOptions,
    ]
  );

  return <PaymentTermsContext.Provider value={value}>{children}</PaymentTermsContext.Provider>;
}

export function usePaymentTerms(): PaymentTermsContextValue {
  const ctx = useContext(PaymentTermsContext);
  if (!ctx) throw new Error("usePaymentTerms must be used within a PaymentTermsProvider");
  return ctx;
}

/**
 * Convenience for widgets: pass the dimension THIS widget groups by. Returns
 * the correct invoice set per the linked-analysis rule (own dimension keeps
 * all bars visible; every other widget + the table narrows), plus whether a
 * given key is the actively-selected one (for highlighting).
 */
export function useWidgetInvoices(ownDimension: LinkedDimension) {
  const { filteredInvoices, scopedInvoices, selection, select } = usePaymentTerms();
  const invoicesForWidget = selection?.dimension === ownDimension ? filteredInvoices : scopedInvoices;
  const selectedKey = selection?.dimension === ownDimension ? selection.value : null;
  return {
    invoicesForWidget,
    selectedKey,
    onBarClick: (value: string, label: string) => select(ownDimension, value, label),
  };
}
