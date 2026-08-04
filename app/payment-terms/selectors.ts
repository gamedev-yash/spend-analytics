import type { Invoice, FilterState, LinkedSelection, SourceSystemDim } from "./types";
import { NO_VALUE_KEY, NO_VALUE_LABEL } from "./constants";

// ---------------------------------------------------------------------------
// Dimension key/label helpers — the ONE place null category / null payment
// term get mapped to the "(No Value)" sentinel + label. Every widget, the
// table, and the filter-option lists all go through these.
// ---------------------------------------------------------------------------

export function categoryKey(inv: Invoice): string {
  return inv.category_code ?? NO_VALUE_KEY;
}
export function categoryLabel(inv: Invoice): string {
  return inv.category_name ?? NO_VALUE_LABEL;
}
export function paymentTermKey(inv: Invoice): string {
  return inv.payment_term_code ?? NO_VALUE_KEY;
}
export function paymentTermLabel(inv: Invoice): string {
  return inv.payment_term_name ?? NO_VALUE_LABEL;
}

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
// Filtering — the 4 dashboard filters, then the linked-analysis selection.
// Every KPI / widget / table call chain starts from applyFilters(); widgets
// and the table additionally apply applyLinkedSelection() on top (KPIs never
// do, per spec — see PaymentTermsProvider).
// ---------------------------------------------------------------------------

export function applyFilters(allInvoices: Invoice[], filters: FilterState): Invoice[] {
  return allInvoices.filter((inv) => {
    if (!isWithinWindow(inv, filters.startMonth, filters.endMonth)) return false;
    if (filters.categoryCodes.length > 0 && !filters.categoryCodes.includes(categoryKey(inv))) return false;
    if (filters.globalUltimateIds.length > 0 && !filters.globalUltimateIds.includes(inv.global_ultimate_id)) return false;
    if (filters.sourceSystemIds.length > 0 && !filters.sourceSystemIds.includes(inv.source_system_id)) return false;
    if (filters.plantIds.length > 0 && !filters.plantIds.includes(inv.plant_id)) return false;
    if (filters.paymentTermCodes.length > 0 && !filters.paymentTermCodes.includes(paymentTermKey(inv))) return false;
    return true;
  });
}

export function applyLinkedSelection(invoices: Invoice[], selection: LinkedSelection | null): Invoice[] {
  if (!selection) return invoices;
  if (selection.dimension === "category") {
    return invoices.filter((inv) => categoryKey(inv) === selection.value);
  }
  if (selection.dimension === "globalUltimate") {
    return invoices.filter((inv) => inv.global_ultimate_id === selection.value);
  }
  return invoices.filter((inv) => paymentTermKey(inv) === selection.value);
}

// ---------------------------------------------------------------------------
// Shared numeric helpers
// ---------------------------------------------------------------------------

/** Mean paid_days, excluding open (unpaid) invoices. The ONLY place this exclusion rule lives. */
export function avgPaidDays(invoices: Invoice[]): number | null {
  const paid = invoices.filter((inv) => inv.is_paid && inv.paid_days !== null);
  if (paid.length === 0) return null;
  const sum = paid.reduce((acc, inv) => acc + (inv.paid_days as number), 0);
  return sum / paid.length;
}

export function totalSpend(invoices: Invoice[]): number {
  return invoices.reduce((acc, inv) => acc + inv.amount, 0);
}

function distinctNonNull<T>(values: (T | null)[]): number {
  return new Set(values.filter((v): v is T => v !== null)).size;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export interface KpiSummary {
  distinctPaymentTerms: number;
  avgPaidDays: number | null;
}

export function computeKpis(invoices: Invoice[]): KpiSummary {
  return {
    distinctPaymentTerms: distinctNonNull(invoices.map((inv) => inv.payment_term_code)),
    avgPaidDays: avgPaidDays(invoices),
  };
}

// ---------------------------------------------------------------------------
// Widget 1 — Payment Terms by Categories
// ---------------------------------------------------------------------------

export interface CategoryAgg {
  key: string;
  label: string;
  distinctTermCount: number;
  spend: number;
  invoiceCount: number;
}

export function aggregateByCategory(invoices: Invoice[]): CategoryAgg[] {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const key = categoryKey(inv);
    const bucket = groups.get(key);
    if (bucket) bucket.push(inv);
    else groups.set(key, [inv]);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    label: categoryLabel(group[0]),
    distinctTermCount: distinctNonNull(group.map((inv) => inv.payment_term_code)),
    spend: totalSpend(group),
    invoiceCount: group.length,
  }));
}

// ---------------------------------------------------------------------------
// Widget 2 — Payment Terms by Suppliers (Global Ultimate)
// ---------------------------------------------------------------------------

export interface GlobalUltimateAgg {
  key: string;
  label: string;
  distinctTermCount: number;
  spend: number;
}

export function aggregateByGlobalUltimate(invoices: Invoice[]): GlobalUltimateAgg[] {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const key = inv.global_ultimate_id;
    const bucket = groups.get(key);
    if (bucket) bucket.push(inv);
    else groups.set(key, [inv]);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    label: group[0].global_ultimate_name,
    distinctTermCount: distinctNonNull(group.map((inv) => inv.payment_term_code)),
    spend: totalSpend(group),
  }));
}

// ---------------------------------------------------------------------------
// Widgets 3 & 4 — both group by payment term; computed once, each widget
// picks the fields it needs.
// ---------------------------------------------------------------------------

export interface PaymentTermAgg {
  key: string;
  label: string;
  nominalDays: number | null;
  spend: number;
  avgPaidDays: number | null;
  invoiceCount: number;
}

export function aggregateByPaymentTerm(invoices: Invoice[]): PaymentTermAgg[] {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const key = paymentTermKey(inv);
    const bucket = groups.get(key);
    if (bucket) bucket.push(inv);
    else groups.set(key, [inv]);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({
    key,
    label: paymentTermLabel(group[0]),
    nominalDays: group.find((inv) => inv.nominal_days !== null)?.nominal_days ?? null,
    spend: totalSpend(group),
    avgPaidDays: avgPaidDays(group),
    invoiceCount: group.length,
  }));
}

// ---------------------------------------------------------------------------
// Detail Report table — one row per Global Ultimate
// ---------------------------------------------------------------------------

export interface TableRow {
  globalUltimateId: string;
  globalUltimateName: string;
  paymentTermCount: number;
  categoryCount: number;
  plantCount: number;
  avgPaidDays: number | null;
  spend: number;
}

export function aggregateForTable(invoices: Invoice[]): TableRow[] {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const key = inv.global_ultimate_id;
    const bucket = groups.get(key);
    if (bucket) bucket.push(inv);
    else groups.set(key, [inv]);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({
    globalUltimateId: key,
    globalUltimateName: group[0].global_ultimate_name,
    paymentTermCount: distinctNonNull(group.map((inv) => inv.payment_term_code)),
    categoryCount: distinctNonNull(group.map((inv) => inv.category_code)),
    plantCount: distinctNonNull(group.map((inv) => inv.plant_id)),
    avgPaidDays: avgPaidDays(group),
    spend: totalSpend(group),
  }));
}

// ---------------------------------------------------------------------------
// Filter-option lists — derived from the full (window-unfiltered) dataset,
// not from the dimension tables, so an option never yields zero results and
// "N of M terms actually used" is handled implicitly.
// ---------------------------------------------------------------------------

export interface FilterOption {
  value: string;
  label: string;
}

function sortedOptionsWithNoValueLast(options: FilterOption[]): FilterOption[] {
  const real = options.filter((o) => o.value !== NO_VALUE_KEY).sort((a, b) => a.label.localeCompare(b.label));
  const noValue = options.find((o) => o.value === NO_VALUE_KEY);
  return noValue ? [...real, noValue] : real;
}

export function getCategoryFilterOptions(allInvoices: Invoice[]): FilterOption[] {
  const seen = new Map<string, string>();
  for (const inv of allInvoices) seen.set(categoryKey(inv), categoryLabel(inv));
  return sortedOptionsWithNoValueLast(Array.from(seen, ([value, label]) => ({ value, label })));
}

export function getPaymentTermFilterOptions(allInvoices: Invoice[]): FilterOption[] {
  const seen = new Map<string, string>();
  for (const inv of allInvoices) seen.set(paymentTermKey(inv), paymentTermLabel(inv));
  return sortedOptionsWithNoValueLast(Array.from(seen, ([value, label]) => ({ value, label })));
}

export function getSourceSystemFilterOptions(
  allInvoices: Invoice[],
  sourceSystemDims: SourceSystemDim[]
): FilterOption[] {
  const nameById = new Map(sourceSystemDims.map((d) => [d.id, d.name]));
  const usedIds = new Set(allInvoices.map((inv) => inv.source_system_id));
  return Array.from(usedIds)
    .map((value) => ({ value, label: nameById.get(value) ?? value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getGlobalUltimateFilterOptions(allInvoices: Invoice[]): FilterOption[] {
  const seen = new Map<string, string>();
  for (const inv of allInvoices) seen.set(inv.global_ultimate_id, inv.global_ultimate_name);
  return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}

export function getPlantFilterOptions(allInvoices: Invoice[]): FilterOption[] {
  const seen = new Map<string, string>();
  for (const inv of allInvoices) seen.set(inv.plant_id, inv.plant_name);
  return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}

// ---------------------------------------------------------------------------
// Cascading options — each dimension's option list is computed from rows
// matching every OTHER active filter (date window included), so picking one
// filter narrows what the rest can offer. Implemented by re-running
// applyFilters with just that one dimension relaxed back to "all" — no
// separate lookup structure to keep in sync with applyFilters itself.
// ---------------------------------------------------------------------------

type CategoricalFilterKey =
  | "categoryCodes"
  | "globalUltimateIds"
  | "sourceSystemIds"
  | "plantIds"
  | "paymentTermCodes";

function relax(filters: FilterState, key: CategoricalFilterKey): FilterState {
  return { ...filters, [key]: [] };
}

export function cascadingCategoryOptions(allInvoices: Invoice[], filters: FilterState): FilterOption[] {
  return getCategoryFilterOptions(applyFilters(allInvoices, relax(filters, "categoryCodes")));
}

export function cascadingGlobalUltimateOptions(allInvoices: Invoice[], filters: FilterState): FilterOption[] {
  return getGlobalUltimateFilterOptions(applyFilters(allInvoices, relax(filters, "globalUltimateIds")));
}

export function cascadingSourceSystemOptions(
  allInvoices: Invoice[],
  filters: FilterState,
  sourceSystemDims: SourceSystemDim[]
): FilterOption[] {
  return getSourceSystemFilterOptions(applyFilters(allInvoices, relax(filters, "sourceSystemIds")), sourceSystemDims);
}

export function cascadingPlantOptions(allInvoices: Invoice[], filters: FilterState): FilterOption[] {
  return getPlantFilterOptions(applyFilters(allInvoices, relax(filters, "plantIds")));
}

export function cascadingPaymentTermOptions(allInvoices: Invoice[], filters: FilterState): FilterOption[] {
  return getPaymentTermFilterOptions(applyFilters(allInvoices, relax(filters, "paymentTermCodes")));
}

/**
 * Drops any selected value that's no longer valid given every OTHER active
 * filter — the fix for the "0-row lockout" a cascading narrow can otherwise
 * cause (e.g. a previously-picked category disappearing once a Plant
 * selection excludes it, silently filtering the dashboard to nothing).
 * Single-pass: each dimension is checked against the RAW (pre-prune) state
 * of the others, matching how the rest of this app's cascading filters work.
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
  const validPaymentTerm = new Set(cascadingPaymentTermOptions(allInvoices, raw).map((o) => o.value));

  return {
    ...raw,
    categoryCodes: raw.categoryCodes.filter((v) => validCategory.has(v)),
    globalUltimateIds: raw.globalUltimateIds.filter((v) => validGlobalUltimate.has(v)),
    sourceSystemIds: raw.sourceSystemIds.filter((v) => validSourceSystem.has(v)),
    plantIds: raw.plantIds.filter((v) => validPlant.has(v)),
    paymentTermCodes: raw.paymentTermCodes.filter((v) => validPaymentTerm.has(v)),
  };
}
