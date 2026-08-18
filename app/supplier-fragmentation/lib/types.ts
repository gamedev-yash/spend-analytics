/**
 * Route-local types for the Supplier Fragmentation dashboard.
 *
 * The dashboard is a TypeScript port of the Initiative-18 Python/Dash
 * prototype (`initiative18-supplier-fragmentation`): every metric operates on
 * a denormalised "master" PO-line row set under a supplier-grouping toggle —
 * `vendor` treats each SAP vendor as one supplier, `parent` collapses
 * subsidiaries onto their KONZS parent company group.
 */

/** One denormalised PO line: fact_po_items joined to vendor/category/plant. */
export interface MasterRow {
  /** po_number — distinct count feeds the bubble size (# POs). */
  po: string;
  /** vendor_id */
  vendor: string;
  vendorName: string;
  /** parent_company_group (KONZS); null = vendor has no group and is its own parent. */
  parent: string | null;
  /** Vendor master is_active flag. */
  active: boolean;
  /** category_l1 name */
  l1: string;
  /** category_l2 name */
  l2: string;
  /** plant_code */
  plant: string;
  plantName: string;
  /** po_date as ISO "YYYY-MM-DD" — string compare is date compare. */
  date: string;
  /** net_value_inr */
  value: number;
}

/** Payload served by the route-local /supplier-fragmentation/api/master endpoint. */
export interface MasterPayload {
  rows: MasterRow[];
  plantOptions: { code: string; name: string }[];
  l1Options: string[];
  dateMin: string;
  dateMax: string;
}

export type GroupMode = "vendor" | "parent";

/** Global filter state (the filter bar). Empty arrays mean "all". */
export interface GlobalFilters {
  plants: string[];
  l1s: string[];
  dateFrom: string;
  dateTo: string;
}

/** Click-driven cross-filter applied on top of the global filters. */
export interface CrossFilter {
  plantName?: string;
  categoryL1?: string;
  categoryL2?: string;
}

/** One row per L2 category — the HHI building block for most views. */
export interface CategoryStat {
  categoryL2: string;
  categoryL1: string;
  nSuppliers: number;
  spend: number;
  nPos: number;
  /** Herfindahl-Hirschman Index, 0–10000 (10000 = single supplier). */
  hhi: number;
  /** 1 − HHI/10000 — 0 concentrated … 1 fragmented. */
  fragScore: number;
}

export interface KpiSet {
  totalSuppliers: number;
  avgSuppliers: number;
  mostFragName: string;
  mostFragCount: number;
  /** Spend-weighted mean fragmentation score, 0–100. */
  fragIndex: number;
  consolidationValue: number;
  consolidationCats: number;
}

export interface HeatmapData {
  /** BU display names, one per row, sorted ascending. */
  plantNames: string[];
  /** L1 columns ordered by total supplier count descending. */
  l1Order: string[];
  /** counts[rowIdx][colIdx] = distinct suppliers for that BU × L1 cell. */
  counts: number[][];
  /** spend[rowIdx][colIdx] = total spend for that cell. */
  spend: number[][];
  maxCount: number;
}

export interface SankeyNode {
  name: string;
  kind: "bu" | "supplier";
}

export interface SankeyLink {
  source: number;
  target: number;
  value: number;
  /** Preformatted hover label: "BU → Supplier: ₹…". */
  label: string;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface TrendPoint {
  /** Sortable key, e.g. "2024Q1". */
  quarter: string;
  /** Display label, e.g. "Q1-2024". */
  quarterLabel: string;
  avgSuppliers: number;
  totalSuppliers: number;
  newSuppliers: number;
  /** New-supplier additions exceeded mean + 1 population std dev. */
  spike: boolean;
}

export interface ConsolidationRow {
  categoryL2: string;
  plantName: string;
  currentSuppliers: number;
  /** "Vendor A (38%); Vendor B (22%); Vendor C (11%)" */
  top3: string;
  totalSpend: number;
  consolidatedSuppliers: number;
  /** Supplier-count reduction from parent grouping, percent (1 decimal). */
  reductionPct: number;
  estSavings: number;
  /** Parent grouping cuts the supplier count by more than half. */
  highlight: boolean;
}

/** Insight sentence fragment — `strong` segments render bold. */
export interface InsightSegment {
  text: string;
  strong?: boolean;
}
