import type { Invoice, FilterState, LinkedSelection, SourceSystemDim, SupplierCountThreshold } from "./types";

// ---------------------------------------------------------------------------
// Date window
// ---------------------------------------------------------------------------

// "YYYY-MM" bucket key — still needed for the Exposure Trend chart's
// month-over-month grouping, independent of the filter window below.
function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

export function monthIndex(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** Inclusive on both ends — ISO "YYYY-MM-DD" strings sort lexicographically, so plain comparison works. */
export function isWithinWindow(inv: Invoice, dateFrom: string, dateTo: string): boolean {
  return inv.invoice_date >= dateFrom && inv.invoice_date <= dateTo;
}

/** Earliest/latest invoice date present in the data — feeds the date-range picker's min/max. */
export function getDateBounds(allInvoices: Invoice[]): { min: string; max: string } {
  let min = allInvoices[0]?.invoice_date ?? "";
  let max = min;
  for (const inv of allInvoices) {
    if (inv.invoice_date < min) min = inv.invoice_date;
    if (inv.invoice_date > max) max = inv.invoice_date;
  }
  return { min, max };
}

/**
 * Default window: the trailing 365 days of data, clamped to the earliest
 * date available so a dataset shorter than a year still opens fully in range.
 */
export function getDefaultDateRange(allInvoices: Invoice[]): { dateFrom: string; dateTo: string } {
  const { min, max } = getDateBounds(allInvoices);
  if (!max) return { dateFrom: min, dateTo: max };
  const from = new Date(new Date(`${max}T00:00:00Z`).getTime() - 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return { dateFrom: from > min ? from : min, dateTo: max };
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
  if (!isWithinWindow(inv, filters.dateFrom, filters.dateTo)) return false;
  if (filters.categoryCodes.length > 0 && !filters.categoryCodes.includes(inv.category_code)) return false;
  if (filters.globalUltimateIds.length > 0 && !filters.globalUltimateIds.includes(inv.global_ultimate_id)) return false;
  if (filters.sourceSystemIds.length > 0 && !filters.sourceSystemIds.includes(inv.source_system_id)) return false;
  if (filters.plantIds.length > 0 && !filters.plantIds.includes(inv.plant_id)) return false;
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

// ---------------------------------------------------------------------------
// Cascading options — each dimension's option list is computed from rows
// matching every OTHER active filter (date window and supplier-count-per-
// category included), so picking one filter narrows what the rest can
// offer. Implemented by re-running matchesBaseFilters with just that one
// dimension relaxed back to "all" — no separate lookup structure to keep in
// sync with matchesBaseFilters itself.
// ---------------------------------------------------------------------------

type CategoricalFilterKey = "categoryCodes" | "globalUltimateIds" | "sourceSystemIds" | "plantIds";

function relax(filters: FilterState, key: CategoricalFilterKey): FilterState {
  return { ...filters, [key]: [] };
}

export function cascadingCategoryOptions(allInvoices: Invoice[], filters: FilterState): FilterOption[] {
  return getCategoryFilterOptions(allInvoices.filter((inv) => matchesBaseFilters(inv, relax(filters, "categoryCodes"))));
}

export function cascadingGlobalUltimateOptions(allInvoices: Invoice[], filters: FilterState): FilterOption[] {
  return getGlobalUltimateFilterOptions(
    allInvoices.filter((inv) => matchesBaseFilters(inv, relax(filters, "globalUltimateIds")))
  );
}

export function cascadingSourceSystemOptions(
  allInvoices: Invoice[],
  filters: FilterState,
  sourceSystemDims: SourceSystemDim[]
): FilterOption[] {
  return getSourceSystemFilterOptions(
    allInvoices.filter((inv) => matchesBaseFilters(inv, relax(filters, "sourceSystemIds"))),
    sourceSystemDims
  );
}

export function cascadingPlantOptions(allInvoices: Invoice[], filters: FilterState): FilterOption[] {
  return getPlantFilterOptions(allInvoices.filter((inv) => matchesBaseFilters(inv, relax(filters, "plantIds"))));
}

/**
 * Drops any selected value that's no longer valid given every OTHER active
 * filter — the fix for the "0-row lockout" a cascading narrow can otherwise
 * cause (e.g. a previously-picked category disappearing once a Plant
 * selection excludes it, silently filtering the dashboard to nothing).
 * Single-pass: each dimension is checked against the RAW (pre-prune) state
 * of the others, matching how this app's other cascading filters work.
 */
export function pruneFilterState(
  allInvoices: Invoice[],
  raw: FilterState,
  sourceSystemDims: SourceSystemDim[]
): FilterState {
  const validCategory = new Set(cascadingCategoryOptions(allInvoices, raw).map((o) => o.value));
  const validGlobalUltimate = new Set(cascadingGlobalUltimateOptions(allInvoices, raw).map((o) => o.value));
  const validSourceSystem = new Set(
    cascadingSourceSystemOptions(allInvoices, raw, sourceSystemDims).map((o) => o.value)
  );
  const validPlant = new Set(cascadingPlantOptions(allInvoices, raw).map((o) => o.value));

  return {
    ...raw,
    categoryCodes: raw.categoryCodes.filter((v) => validCategory.has(v)),
    globalUltimateIds: raw.globalUltimateIds.filter((v) => validGlobalUltimate.has(v)),
    sourceSystemIds: raw.sourceSystemIds.filter((v) => validSourceSystem.has(v)),
    plantIds: raw.plantIds.filter((v) => validPlant.has(v)),
  };
}

export const SUPPLIER_COUNT_OPTIONS: { value: SupplierCountThreshold; label: string }[] = [
  { value: 1, label: "≤ 1 supplier (single source)" },
  { value: 2, label: "≤ 2 suppliers" },
  { value: 3, label: "≤ 3 suppliers" },
];
