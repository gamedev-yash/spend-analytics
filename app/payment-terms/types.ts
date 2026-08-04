export interface Invoice {
  invoice_id: string;
  invoice_date: string; // "YYYY-MM-DD"
  paid_date: string | null;
  paid_days: number | null;
  is_paid: boolean;
  amount: number;
  currency: string;
  supplier_id: string;
  supplier_name: string;
  global_ultimate_id: string;
  global_ultimate_name: string;
  category_code: string | null;
  category_name: string | null;
  segment_code: string | null;
  segment_name: string | null;
  plant_id: string;
  plant_name: string;
  region: string;
  country: string;
  source_system_id: string;
  payment_term_code: string | null;
  payment_term_name: string | null;
  nominal_days: number | null;
}

export interface PaymentTermDim {
  code: string;
  name: string;
  nominal_days: number;
  discount_pct: number;
  discount_days: number;
  kind: "standard" | "discount" | "eom" | "special" | "immediate";
}

export interface CategoryDim {
  code: string;
  name: string;
  segment_code: string;
  segment_name: string;
  level: number;
}

export interface SourceSystemDim {
  id: string;
  name: string;
}

/** User-picked date window + the global/page-option dropdown filters this dashboard defines. */
export interface FilterState {
  /** "YYYY-MM-DD" — inclusive first day of the window. Never later than dateTo. */
  dateFrom: string;
  /** "YYYY-MM-DD" — inclusive last day of the window. */
  dateTo: string;
  /** category_code, the NO_VALUE_KEY sentinel, or null for "All Categories". */
  categoryCode: string | null;
  /** global_ultimate_id, or null for "All Suppliers". */
  globalUltimateId: string | null;
  /** source_system_id, or null for "All Source Systems". */
  sourceSystemId: string | null;
  /** plant_id, or null for "All Plants". */
  plantId: string | null;
  /** payment_term_code, the NO_VALUE_KEY sentinel, or null for "All Payment Terms". */
  paymentTermCode: string | null;
}

/** Which grouping dimension a widget contributed the active "linked analysis" selection on. */
export type LinkedDimension = "category" | "globalUltimate" | "paymentTerm";

export interface LinkedSelection {
  dimension: LinkedDimension;
  /** category_code / global_ultimate_id / payment_term_code, or the NO_VALUE_KEY sentinel. */
  value: string;
  /** Display label, so the "filtered by" chip doesn't need to re-derive it. */
  label: string;
}
