export interface Invoice {
  invoice_id: string;
  invoice_date: string; // "YYYY-MM-DD"
  amount: number;
  currency: string;
  supplier_id: string;
  supplier_name: string;
  global_ultimate_id: string;
  global_ultimate_name: string;
  category_code: string;
  category_name: string;
  segment_code: string;
  segment_name: string;
  plant_id: string;
  plant_name: string;
  region: string;
  country: string;
  source_system_id: string;
  product_id: string;
  product_name: string;
  cost_center_id: string;
  cost_center_name: string;
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

/** How many distinct Global-Ultimate suppliers a category may have and still count as "at risk". */
export type SupplierCountThreshold = 1 | 2 | 3;

/** User-picked date window + the global/page-option dropdown filters this dashboard defines. Every categorical filter is multi-select: empty array = all. */
export interface FilterState {
  /** "YYYY-MM-DD" — inclusive first day of the window. Never later than dateTo. */
  dateFrom: string;
  /** "YYYY-MM-DD" — inclusive last day of the window. */
  dateTo: string;
  /** category_code values. Empty = all. */
  categoryCodes: string[];
  /** global_ultimate_id values. Empty = all. */
  globalUltimateIds: string[];
  /** source_system_id values. Empty = all. */
  sourceSystemIds: string[];
  /** plant_id values. Empty = all. */
  plantIds: string[];
  /**
   * Categories are kept only when their distinct-supplier count (computed
   * from the invoice set after every OTHER filter above is applied) is at
   * or below this value — the dashboard's defining lens, so unlike the other
   * filters it has no "off" state.
   */
  supplierCountPerCategory: SupplierCountThreshold;
}

/** Which grouping dimension a widget contributed the active "linked analysis" selection on. */
export type LinkedDimension = "category" | "product" | "plant" | "globalUltimate";

export interface LinkedSelection {
  dimension: LinkedDimension;
  /** category_code / product_id / plant_id / global_ultimate_id. */
  value: string;
  /** Display label, so the "filtered by" chip doesn't need to re-derive it. */
  label: string;
}
