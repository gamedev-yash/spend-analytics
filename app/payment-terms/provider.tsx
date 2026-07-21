"use client";

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { invoices, sourceSystemDims } from "./data";
import {
  applyFilters,
  applyLinkedSelection,
  getAvailableEndMonths,
  getCategoryFilterOptions,
  getDefaultEndMonth,
  getPaymentTermFilterOptions,
  getSourceSystemFilterOptions,
  type FilterOption,
} from "./selectors";
import type { FilterState, Invoice, LinkedDimension, LinkedSelection } from "./types";

// Static option lists — derived once from the full dataset, never change at runtime.
const END_MONTHS = getAvailableEndMonths(invoices);
const DEFAULT_END_MONTH = getDefaultEndMonth(invoices);
const CATEGORY_OPTIONS = getCategoryFilterOptions(invoices);
const PAYMENT_TERM_OPTIONS = getPaymentTermFilterOptions(invoices);
const SOURCE_SYSTEM_OPTIONS = getSourceSystemFilterOptions(invoices, sourceSystemDims);

interface State {
  filters: FilterState;
  selection: LinkedSelection | null;
}

type Action =
  | { type: "SET_END_MONTH"; month: string }
  | { type: "SET_CATEGORY"; code: string | null }
  | { type: "SET_SOURCE_SYSTEM"; id: string | null }
  | { type: "SET_PAYMENT_TERM"; code: string | null }
  | { type: "SELECT"; dimension: LinkedDimension; value: string; label: string }
  | { type: "CLEAR_SELECTION" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_END_MONTH":
      return { filters: { ...state.filters, endMonth: action.month }, selection: null };
    case "SET_CATEGORY":
      return { filters: { ...state.filters, categoryCode: action.code }, selection: null };
    case "SET_SOURCE_SYSTEM":
      return { filters: { ...state.filters, sourceSystemId: action.id }, selection: null };
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
  setEndMonth: (month: string) => void;
  setCategory: (code: string | null) => void;
  setSourceSystem: (id: string | null) => void;
  setPaymentTerm: (code: string | null) => void;
  select: (dimension: LinkedDimension, value: string, label: string) => void;
  clearSelection: () => void;
  endMonthOptions: string[];
  categoryOptions: FilterOption[];
  paymentTermOptions: FilterOption[];
  sourceSystemOptions: FilterOption[];
}

const PaymentTermsContext = createContext<PaymentTermsContextValue | null>(null);

export function PaymentTermsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    filters: {
      endMonth: DEFAULT_END_MONTH,
      categoryCode: null,
      sourceSystemId: null,
      paymentTermCode: null,
    },
    selection: null,
  });

  const filteredInvoices = useMemo(() => applyFilters(invoices, state.filters), [state.filters]);
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
      setEndMonth: (month) => dispatch({ type: "SET_END_MONTH", month }),
      setCategory: (code) => dispatch({ type: "SET_CATEGORY", code }),
      setSourceSystem: (id) => dispatch({ type: "SET_SOURCE_SYSTEM", id }),
      setPaymentTerm: (code) => dispatch({ type: "SET_PAYMENT_TERM", code }),
      select: (dimension, value, label) => dispatch({ type: "SELECT", dimension, value, label }),
      clearSelection: () => dispatch({ type: "CLEAR_SELECTION" }),
      endMonthOptions: END_MONTHS,
      categoryOptions: CATEGORY_OPTIONS,
      paymentTermOptions: PAYMENT_TERM_OPTIONS,
      sourceSystemOptions: SOURCE_SYSTEM_OPTIONS,
    }),
    [state, filteredInvoices, scopedInvoices]
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
