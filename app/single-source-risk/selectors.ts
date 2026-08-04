import type { Invoice, FilterState, LinkedSelection, SourceSystemDim, SupplierCountThreshold } from "./types";

// ---------------------------------------------------------------------------
// Date window
// ---------------------------------------------------------------------------

function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

export function monthIndex(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** Inclusive on both ends — startMonth and endMonth are both counted. */
export function isWithinWindow(inv: Invoice, startMonth: string, endMonth: string): boolean {
  const invIdx = monthIndex(monthOf(inv.invoice_date));
  return invIdx >= monthIndex(startMonth) && invIdx <= monthIndex(endMonth);
}

/** All distinct invoice months present in the data, ascending — powers both month dropdowns. */
export function getAvailableMonths(allInvoices: Invoice[]): string[] {
  const months = new Set(allInvoices.map((inv) => monthOf(inv.invoice_date)));
  return Array.from(months).sort();
}

/**
 * Default window: the trailing 12 months of data, i.e. the latest month present
 * back 11 months — clamped to the earliest month available so a dataset shorter
 * than a year still opens fully in range.
 */
export function getDefaultMonthRange(allInvoices: Invoice[]): { startMonth: string; endMonth: string } {
  const months = getAvailableMonths(allInvoices);
  const endMonth = months[months.length - 1];
  const startIdx = Math.max(0, months.length - 12);
  return { startMonth: months[startIdx], endMonth };
}

// ---------------------------------------------------------------------------
// Filtering
//
// Two-pass: the "base" filters (window, category, supplier, source system,
// plant) narrow the invoice set first; the distinct-supplier-per-category
// count that the "Number of Suppliers per Category" filter judges against is
// then computed FROM that narrowed set, not from the whole dataset — so e.g.
// filtering to one Source System reports how single-sourced categories look
// within that system alone.
// ---------------------------------------------------------------------------

function matchesBaseFilters(inv: Invoice, filters: FilterState): boolean {
  if (!isWithinWindow(inv, filters.startMonth, filters.endMonth)) return false;
  if (filters.categoryCode !== null && inv.category_code !== filters.categoryCode) return false;
  if (filters.globalUltimateId !== null && inv.global_ultimate_id !== filters.globalUltimateId) return false;
  if (filters.sourceSystemId !== null && inv.source_system_id !== filters.sourceSystemId) return false;
  if (filters.plantId !== null && inv.plant_id !== filters.plantId) return false;
  return true;
}

/** category_code -> distinct global_ultimate_id count, within the given invoice set. */
export function categorySupplierCounts(invoices: Invoice[]): Map<string, number> {
  const groups = new Map<string, Set<string>>();
  for (const inv of invoices) {
    let suppliers = groups.get(inv.category_code);
    if (!suppliers) {
      suppliers = new Set();
      groups.set(inv.category_code, suppliers);
    }
    suppliers.add(inv.global_ultimate_id);
  }
  const counts = new Map<string, number>();
  for (const [code, suppliers] of groups) counts.set(code, suppliers.size);
  return counts;
}

export function applyFilters(allInvoices: Invoice[], filters: FilterState): Invoice[] {
  const base = allInvoices.filter((inv) => matchesBaseFilters(inv, filters));
  const counts = categorySupplierCounts(base);
  return base.filter((inv) => (counts.get(inv.category_code) ?? 0) <= filters.supplierCountPerCategory);
}

/**
 * Base filters only (date/category/GU/source-system/plant) — WITHOUT the
 * "Number of Suppliers per Category" cut. Powers widgets that need to see
 * the whole category population classified by risk rather than just the
 * slice that already passes the current threshold (the risk quadrant,
 * exposure trend, and segment roll-up).
 */
export function applyBaseFilters(allInvoices: Invoice[], filters: FilterState): Invoice[] {
  return allInvoices.filter((inv) => matchesBaseFilters(inv, filters));
}

export function applyLinkedSelection(invoices: Invoice[], selection: LinkedSelection | null): Invoice[] {
  if (!selection) return invoices;
  switch (selection.dimension) {
    case "category":
      return invoices.filter((inv) => inv.category_code === selection.value);
    case "product":
      return invoices.filter((inv) => inv.product_id === selection.value);
    case "plant":
      return invoices.filter((inv) => inv.plant_id === selection.value);
    case "globalUltimate":
      return invoices.filter((inv) => inv.global_ultimate_id === selection.value);
    default:
      return invoices;
  }
}

// ---------------------------------------------------------------------------
// Shared numeric helpers
// ---------------------------------------------------------------------------

export function totalSpend(invoices: Invoice[]): number {
  return invoices.reduce((acc, inv) => acc + inv.amount, 0);
}

function distinctCount<T>(values: T[]): number {
  return new Set(values).size;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export interface KpiSummary {
  totalSpend: number;
  supplierCount: number;
  productCount: number;
  categoryCount: number;
}

export function computeKpis(invoices: Invoice[]): KpiSummary {
  return {
    totalSpend: totalSpend(invoices),
    supplierCount: distinctCount(invoices.map((inv) => inv.global_ultimate_id)),
    productCount: distinctCount(invoices.map((inv) => inv.product_id)),
    categoryCount: distinctCount(invoices.map((inv) => inv.category_code)),
  };
}

// ---------------------------------------------------------------------------
// Widget 1 — Spend by Categories with Suppliers <= N
// ---------------------------------------------------------------------------

export interface CategoryAgg {
  key: string;
  label: string;
  supplierCount: number;
  spend: number;
  invoiceCount: number;
  productCount: number;
}

export function aggregateByCategory(invoices: Invoice[]): CategoryAgg[] {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const bucket = groups.get(inv.category_code);
    if (bucket) bucket.push(inv);
    else groups.set(inv.category_code, [inv]);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    label: group[0].category_name,
    supplierCount: distinctCount(group.map((inv) => inv.global_ultimate_id)),
    spend: totalSpend(group),
    invoiceCount: group.length,
    productCount: distinctCount(group.map((inv) => inv.product_id)),
  }));
}

// ---------------------------------------------------------------------------
// Widget 2 — Spend by Products
// ---------------------------------------------------------------------------

export interface ProductAgg {
  key: string;
  label: string;
  categoryName: string;
  spend: number;
  invoiceCount: number;
}

export function aggregateByProduct(invoices: Invoice[]): ProductAgg[] {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const bucket = groups.get(inv.product_id);
    if (bucket) bucket.push(inv);
    else groups.set(inv.product_id, [inv]);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    label: group[0].product_name,
    categoryName: group[0].category_name,
    spend: totalSpend(group),
    invoiceCount: group.length,
  }));
}

// ---------------------------------------------------------------------------
// Widget 3 — Spend by Plants/Sites
// ---------------------------------------------------------------------------

export interface PlantAgg {
  key: string;
  label: string;
  country: string;
  spend: number;
  invoiceCount: number;
}

export function aggregateByPlant(invoices: Invoice[]): PlantAgg[] {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const bucket = groups.get(inv.plant_id);
    if (bucket) bucket.push(inv);
    else groups.set(inv.plant_id, [inv]);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    label: group[0].plant_name,
    country: group[0].country,
    spend: totalSpend(group),
    invoiceCount: group.length,
  }));
}

// ---------------------------------------------------------------------------
// Widget 4 — Spend by Suppliers (Global Ultimate)
// ---------------------------------------------------------------------------

export interface GlobalUltimateAgg {
  key: string;
  label: string;
  spend: number;
  percentOfTotal: number;
  categoryCount: number;
  invoiceCount: number;
}

export function aggregateByGlobalUltimate(invoices: Invoice[]): GlobalUltimateAgg[] {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const bucket = groups.get(inv.global_ultimate_id);
    if (bucket) bucket.push(inv);
    else groups.set(inv.global_ultimate_id, [inv]);
  }
  const grandTotal = totalSpend(invoices);
  return Array.from(groups.entries()).map(([key, group]) => {
    const spend = totalSpend(group);
    return {
      key,
      label: group[0].global_ultimate_name,
      spend,
      percentOfTotal: grandTotal > 0 ? (spend / grandTotal) * 100 : 0,
      categoryCount: distinctCount(group.map((inv) => inv.category_code)),
      invoiceCount: group.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Category Risk Quadrant — every category (regardless of the current
// threshold), tagged with which side of it they fall on.
// ---------------------------------------------------------------------------

export interface CategoryRiskAgg extends CategoryAgg {
  isAtRisk: boolean;
}

export function aggregateCategoryRisk(
  baseFilteredInvoices: Invoice[],
  threshold: SupplierCountThreshold
): CategoryRiskAgg[] {
  return aggregateByCategory(baseFilteredInvoices).map((agg) => ({
    ...agg,
    isAtRisk: agg.supplierCount <= threshold,
  }));
}

// ---------------------------------------------------------------------------
// Critical Supplier Blast Radius — suppliers who are the sole
// (distinct-count === 1) source for one or more categories, plus an overall
// concentration score for the current view.
// ---------------------------------------------------------------------------

export interface CriticalSupplierAgg {
  key: string;
  label: string;
  soleSourcedCategoryCount: number;
  /** Spend across only the categories this supplier sole-sources, not its total spend. */
  spend: number;
}

export function aggregateCriticalSuppliers(invoices: Invoice[]): CriticalSupplierAgg[] {
  const counts = categorySupplierCounts(invoices);
  const soleSourcedCategoryCodes = new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count === 1)
      .map(([code]) => code)
  );
  const bySupplier = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    if (!soleSourcedCategoryCodes.has(inv.category_code)) continue;
    const bucket = bySupplier.get(inv.global_ultimate_id);
    if (bucket) bucket.push(inv);
    else bySupplier.set(inv.global_ultimate_id, [inv]);
  }
  return Array.from(bySupplier.entries()).map(([key, group]) => ({
    key,
    label: group[0].global_ultimate_name,
    soleSourcedCategoryCount: distinctCount(group.map((inv) => inv.category_code)),
    spend: totalSpend(group),
  }));
}

export interface ConcentrationSummary {
  criticalSupplierCount: number;
  /** Total spend sitting in categories that are sole-sourced (distinct-supplier count === 1). */
  blastRadiusSpend: number;
  /** Herfindahl-Hirschman Index over supplier spend shares, 0-10000 (higher = more concentrated). */
  hhi: number;
}

export function computeConcentrationSummary(invoices: Invoice[]): ConcentrationSummary {
  const criticalSuppliers = aggregateCriticalSuppliers(invoices);
  const blastRadiusSpend = criticalSuppliers.reduce((acc, supplier) => acc + supplier.spend, 0);

  const grandTotal = totalSpend(invoices);
  const spendBySupplier = new Map<string, number>();
  for (const inv of invoices) {
    spendBySupplier.set(inv.global_ultimate_id, (spendBySupplier.get(inv.global_ultimate_id) ?? 0) + inv.amount);
  }
  const hhi =
    grandTotal > 0
      ? Array.from(spendBySupplier.values()).reduce((acc, spend) => acc + (spend / grandTotal) ** 2, 0) * 10000
      : 0;

  return { criticalSupplierCount: criticalSuppliers.length, blastRadiusSpend, hhi };
}

// ---------------------------------------------------------------------------
// Single-Source Exposure Trend — at-risk share of spend per month, computed
// by reclassifying each month's own invoices against the current threshold
// (a category's supplier count can differ month to month).
// ---------------------------------------------------------------------------

export interface ExposureTrendPoint {
  month: string; // "YYYY-MM"
  atRiskSpendPercent: number;
  atRiskCategoryCount: number;
  totalSpend: number;
}

export function aggregateExposureTrend(
  baseFilteredInvoices: Invoice[],
  threshold: SupplierCountThreshold
): ExposureTrendPoint[] {
  const byMonth = new Map<string, Invoice[]>();
  for (const inv of baseFilteredInvoices) {
    const month = monthOf(inv.invoice_date);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(inv);
    else byMonth.set(month, [inv]);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => monthIndex(a) - monthIndex(b))
    .map(([month, invoicesInMonth]) => {
      const counts = categorySupplierCounts(invoicesInMonth);
      const monthTotal = totalSpend(invoicesInMonth);
      const atRiskSpend = invoicesInMonth
        .filter((inv) => (counts.get(inv.category_code) ?? 0) <= threshold)
        .reduce((acc, inv) => acc + inv.amount, 0);
      const atRiskCategoryCount = Array.from(counts.values()).filter((count) => count <= threshold).length;
      return {
        month,
        atRiskSpendPercent: monthTotal > 0 ? (atRiskSpend / monthTotal) * 100 : 0,
        atRiskCategoryCount,
        totalSpend: monthTotal,
      };
    });
}

// ---------------------------------------------------------------------------
// At-Risk Spend by Segment — categories rolled up to their parent UNSPSC
// segment, spend split into at-risk vs. diversified within each segment.
// ---------------------------------------------------------------------------

export interface SegmentRiskAgg {
  key: string; // segment_code
  label: string; // segment_name
  atRiskSpend: number;
  diversifiedSpend: number;
  totalSpend: number;
}

export function aggregateSegmentRisk(
  baseFilteredInvoices: Invoice[],
  threshold: SupplierCountThreshold
): SegmentRiskAgg[] {
  const counts = categorySupplierCounts(baseFilteredInvoices);
  const bySegment = new Map<string, Invoice[]>();
  for (const inv of baseFilteredInvoices) {
    const bucket = bySegment.get(inv.segment_code);
    if (bucket) bucket.push(inv);
    else bySegment.set(inv.segment_code, [inv]);
  }
  return Array.from(bySegment.entries()).map(([key, group]) => {
    const atRiskSpend = group
      .filter((inv) => (counts.get(inv.category_code) ?? 0) <= threshold)
      .reduce((acc, inv) => acc + inv.amount, 0);
    const total = totalSpend(group);
    return {
      key,
      label: group[0].segment_name,
      atRiskSpend,
      diversifiedSpend: total - atRiskSpend,
      totalSpend: total,
    };
  });
}

// ---------------------------------------------------------------------------
// Detail Report table — one row per Category
// ---------------------------------------------------------------------------

export interface TableRow {
  categoryCode: string;
  categoryName: string;
  invoiceCount: number;
  plantCount: number;
  supplierCount: number;
  productCount: number;
  spend: number;
  costCenterCount: number;
}

export function aggregateForTable(invoices: Invoice[]): TableRow[] {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const bucket = groups.get(inv.category_code);
    if (bucket) bucket.push(inv);
    else groups.set(inv.category_code, [inv]);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({
    categoryCode: key,
    categoryName: group[0].category_name,
    invoiceCount: group.length,
    plantCount: distinctCount(group.map((inv) => inv.plant_id)),
    supplierCount: distinctCount(group.map((inv) => inv.global_ultimate_id)),
    productCount: distinctCount(group.map((inv) => inv.product_id)),
    spend: totalSpend(group),
    costCenterCount: distinctCount(group.map((inv) => inv.cost_center_id)),
  }));
}

// ---------------------------------------------------------------------------
// Filter-option lists — derived from the full (window-unfiltered) dataset,
// not from the dimension tables, so an option never yields zero results.
// ---------------------------------------------------------------------------

export interface FilterOption {
  value: string;
  label: string;
}

function sortedOptions(options: FilterOption[]): FilterOption[] {
  return [...options].sort((a, b) => a.label.localeCompare(b.label));
}

export function getCategoryFilterOptions(allInvoices: Invoice[]): FilterOption[] {
  const seen = new Map<string, string>();
  for (const inv of allInvoices) seen.set(inv.category_code, inv.category_name);
  return sortedOptions(Array.from(seen, ([value, label]) => ({ value, label })));
}

export function getSourceSystemFilterOptions(
  allInvoices: Invoice[],
  sourceSystemDims: SourceSystemDim[]
): FilterOption[] {
  const nameById = new Map(sourceSystemDims.map((d) => [d.id, d.name]));
  const usedIds = new Set(allInvoices.map((inv) => inv.source_system_id));
  return sortedOptions(Array.from(usedIds).map((value) => ({ value, label: nameById.get(value) ?? value })));
}

export function getGlobalUltimateFilterOptions(allInvoices: Invoice[]): FilterOption[] {
  const seen = new Map<string, string>();
  for (const inv of allInvoices) seen.set(inv.global_ultimate_id, inv.global_ultimate_name);
  return sortedOptions(Array.from(seen, ([value, label]) => ({ value, label })));
}

export function getPlantFilterOptions(allInvoices: Invoice[]): FilterOption[] {
  const seen = new Map<string, string>();
  for (const inv of allInvoices) seen.set(inv.plant_id, inv.plant_name);
  return sortedOptions(Array.from(seen, ([value, label]) => ({ value, label })));
}

export const SUPPLIER_COUNT_OPTIONS: { value: SupplierCountThreshold; label: string }[] = [
  { value: 1, label: "≤ 1 supplier (single source)" },
  { value: 2, label: "≤ 2 suppliers" },
  { value: 3, label: "≤ 3 suppliers" },
];
