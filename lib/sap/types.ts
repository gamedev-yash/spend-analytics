export interface Vendor {
  vendor_id: string;
  vendor_name: string;
  parent_company_group: string | null;
  country: string;
  city: string;
  account_group: "ZDOM" | "ZIMP" | "ZSER";
  payment_terms_key: string;
  is_active: boolean;
}

export interface Category {
  category_code: string;
  category_name: string;
  category_l1: string;
  category_l2: string;
}

export interface Plant {
  plant_code: string;
  plant_name: string;
  company_code: string;
  region: string;
}

export interface Material {
  material_number: string;
  material_description: string;
  material_type: "ROH" | "ERSA" | "HIBE" | "DIEN";
  category_code: string;
}

export interface PoItem {
  po_number: string;
  po_item: number;
  vendor_id: string;
  category_code: string;
  plant_code: string;
  po_date: string;
  net_value_inr: number;
  quantity: number;
  unit: string;
  currency: string;
  doc_type: "NB" | "FO" | "MK" | "UB";
  contract_number: string | null;
  is_deleted: boolean;
}

export interface Invoice {
  invoice_number: string;
  invoice_date: string;
  po_number: string | null;
  vendor_id: string;
  category_code: string;
  plant_code: string;
  invoice_value_inr: number;
  currency: string;
}

export type SpendType = "po" | "invoice" | "both";

export interface SapFilters {
  /** Comma-separated plant codes; absent/empty = all. */
  plants?: string[];
  /** Comma-separated L1 category names; absent/empty = all. */
  categoriesL1?: string[];
  dateFrom?: string;
  dateTo?: string;
  spendType?: SpendType;
  /** Cross-filter: clicking a supplier row/bar. */
  vendorId?: string;
  /** Cross-filter: clicking an L1 (or "L1|L2") segment in the treemap/sunburst. */
  categoryPath?: string;
}
