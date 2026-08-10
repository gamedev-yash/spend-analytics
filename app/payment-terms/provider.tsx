"use client";

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { invoices as staticInvoices, sourceSystemDims as staticSourceSystemDims } from "./data";
import {
  applyFilters,
  applyLinkedSelection,
  cascadingCategoryOptions,
  cascadingGlobalUltimateOptions,
  cascadingPaymentTermOptions,
  cascadingPlantOptions,
  cascadingSourceSystemOptions,
  getDateBounds,
  getDefaultDateRange,
  pruneFilterState,
  type FilterOption,
} from "./selectors";
import type { FilterState, Invoice, LinkedDimension, LinkedSelection, SourceSystemDim } from "./types";

interface State {
  filters: FilterState;
  selection: LinkedSelection | null;
}

type Action =
  | { type: "SET_DATE_FROM"; date: string }
  | { type: "SET_DATE_TO"; date: string }
  | { type: "SET_CATEGORIES"; codes: string[] }
  | { type: "SET_GLOBAL_ULTIMATES"; ids: string[] }
  | { type: "SET_SOURCE_SYSTEMS"; ids: string[] }
  | { type: "SET_PLANTS"; ids: string[] }
  | { type: "SET_PAYMENT_TERMS"; codes: string[] }
  | { type: "SELECT"; dimension: LinkedDimension; value: string; label: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "RESET_FILTERS"; defaultRange: { dateFrom: string; dateTo: string } };

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
    case "SET_CATEGORIES":
      return { filters: { ...state.filters, categoryCodes: action.codes }, selection: null };
    case "SET_GLOBAL_ULTIMATES":
      return { filters: { ...state.filters, globalUltimateIds: action.ids }, selection: null };
    case "SET_SOURCE_SYSTEMS":
      return { filters: { ...state.filters, sourceSystemIds: action.ids }, selection: null };
    case "SET_PLANTS":
      return { filters: { ...state.filters, plantIds: action.ids }, selection: null };
    case "SET_PAYMENT_TERMS":
      return { filters: { ...state.filters, paymentTermCodes: action.codes }, selection: null };
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
    case "RESET_FILTERS":
      return {
        filters: {
          ...action.defaultRange,
          categoryCodes: [],
          globalUltimateIds: [],
          sourceSystemIds: [],
          plantIds: [],
          paymentTermCodes: [],
        },
        selection: null,
      };
    default:
      return state;
  }
}

interface PaymentTermsContextValue {
  /** Always pruned against the current data — never holds a stale, now-invalid selection (see selectors.ts's pruneFilterState). */
  filters: FilterState;
  selection: LinkedSelection | null;
  /** Filters applied, selection NOT applied — what KPIs and a widget's own dimension read from. */
  filteredInvoices: Invoice[];
  /** Filters + linked-analysis selection applied — what sibling widgets and the table read from. */
  scopedInvoices: Invoice[];
  setDateFrom: (date: string) => void;
  setDateTo: (date: string) => void;
  setCategories: (codes: string[]) => void;
  setGlobalUltimates: (ids: string[]) => void;
  setSourceSystems: (ids: string[]) => void;
  setPlants: (ids: string[]) => void;
  setPaymentTerms: (codes: string[]) => void;
  select: (dimension: LinkedDimension, value: string, label: string) => void;
  clearSelection: () => void;
  /** Resets every dropdown and date back to its default. */
  resetFilters: () => void;
  /** Earliest/latest invoice date present in the data — feeds the date-range picker's min/max. */
  dateMin: string;
  dateMax: string;
  /** Every option list below is cascading — narrowed by every OTHER active filter, not the full dataset. */
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
   * Invoice list to drive the dashboard — the warehouse's fact_payments rows
   * (lib/page-data/payment-terms-from-provider.ts) in Azure-SQL/warehouse
   * mode, falling back to the static mock otherwise.
   */
  invoices?: Invoice[];
  /** Source-system options that go with `invoices`; falls back with it. */
  sourceSystemDims?: SourceSystemDim[];
}

export function PaymentTermsProvider({ children, invoices, sourceSystemDims }: PaymentTermsProviderProps) {
  const invoiceData = invoices ?? staticInvoices;
  const sourceSystemData = sourceSystemDims ?? staticSourceSystemDims;

  // Earliest/latest invoice date present in the data — feeds the date-range picker's min/max.
  const { min: dateMin, max: dateMax } = useMemo(() => getDateBounds(invoiceData), [invoiceData]);

  const [state, dispatch] = useReducer(reducer, invoiceData, (data) => ({
    filters: {
      ...getDefaultDateRange(data),
      categoryCodes: [],
      globalUltimateIds: [],
      sourceSystemIds: [],
      plantIds: [],
      paymentTermCodes: [],
    },
    selection: null,
  }));

  // Self-healing: re-validated against the current data on every render, so
  // a filter that's become invalid (another dimension narrowed it out, or
  // the dataset itself changed) never silently locks the dashboard to zero
  // rows — it's just dropped.
  const filters = useMemo(
    () => pruneFilterState(invoiceData, state.filters, sourceSystemData),
    [invoiceData, state.filters, sourceSystemData]
  );

  // Cascading option lists — computed from `filters` (the pruned state), so
  // each dropdown reflects every OTHER active filter.
  const categoryOptions = useMemo(() => cascadingCategoryOptions(invoiceData, filters), [invoiceData, filters]);
  const globalUltimateOptions = useMemo(
    () => cascadingGlobalUltimateOptions(invoiceData, filters),
    [invoiceData, filters]
  );
  const sourceSystemOptions = useMemo(
    () => cascadingSourceSystemOptions(invoiceData, filters, sourceSystemData),
    [invoiceData, filters, sourceSystemData]
  );
  const plantOptions = useMemo(() => cascadingPlantOptions(invoiceData, filters), [invoiceData, filters]);
  const paymentTermOptions = useMemo(
    () => cascadingPaymentTermOptions(invoiceData, filters),
    [invoiceData, filters]
  );

  const filteredInvoices = useMemo(() => applyFilters(invoiceData, filters), [invoiceData, filters]);
  const scopedInvoices = useMemo(
    () => applyLinkedSelection(filteredInvoices, state.selection),
    [filteredInvoices, state.selection]
  );

  const value = useMemo<PaymentTermsContextValue>(
    () => ({
      filters,
      selection: state.selection,
      filteredInvoices,
      scopedInvoices,
      setDateFrom: (date) => dispatch({ type: "SET_DATE_FROM", date }),
      setDateTo: (date) => dispatch({ type: "SET_DATE_TO", date }),
      setCategories: (codes) => dispatch({ type: "SET_CATEGORIES", codes }),
      setGlobalUltimates: (ids) => dispatch({ type: "SET_GLOBAL_ULTIMATES", ids }),
      setSourceSystems: (ids) => dispatch({ type: "SET_SOURCE_SYSTEMS", ids }),
      setPlants: (ids) => dispatch({ type: "SET_PLANTS", ids }),
      setPaymentTerms: (codes) => dispatch({ type: "SET_PAYMENT_TERMS", codes }),
      select: (dimension, value, label) => dispatch({ type: "SELECT", dimension, value, label }),
      clearSelection: () => dispatch({ type: "CLEAR_SELECTION" }),
      resetFilters: () => dispatch({ type: "RESET_FILTERS", defaultRange: getDefaultDateRange(invoiceData) }),
      dateMin,
      dateMax,
      categoryOptions,
      globalUltimateOptions,
      paymentTermOptions,
      sourceSystemOptions,
      plantOptions,
    }),
    [
      filters,
      state.selection,
      invoiceData,
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
