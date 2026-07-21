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

function monthIndex(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** Trailing 12 completed months ending at (and including) filters.endMonth. */
export function isWithinWindow(inv: Invoice, endMonth: string): boolean {
  const endIdx = monthIndex(endMonth);
  const startIdx = endIdx - 11;
  const invIdx = monthIndex(monthOf(inv.invoice_date));
  return invIdx >= startIdx && invIdx <= endIdx;
}

/** All distinct invoice months present in the data, ascending — powers the "end month" dropdown. */
export function getAvailableEndMonths(allInvoices: Invoice[]): string[] {
  const months = new Set(allInvoices.map((inv) => monthOf(inv.invoice_date)));
  return Array.from(months).sort();
}

export function getDefaultEndMonth(allInvoices: Invoice[]): string {
  const months = getAvailableEndMonths(allInvoices);
  return months[months.length - 1];
}

// ---------------------------------------------------------------------------
// Filtering — the 4 dashboard filters, then the linked-analysis selection.
// Every KPI / widget / table call chain starts from applyFilters(); widgets
// and the table additionally apply applyLinkedSelection() on top (KPIs never
// do, per spec — see PaymentTermsProvider).
// ---------------------------------------------------------------------------

export function applyFilters(allInvoices: Invoice[], filters: FilterState): Invoice[] {
  return allInvoices.filter((inv) => {
    if (!isWithinWindow(inv, filters.endMonth)) return false;
    if (filters.categoryCode !== null && categoryKey(inv) !== filters.categoryCode) return false;
    if (filters.sourceSystemId !== null && inv.source_system_id !== filters.sourceSystemId) return false;
    if (filters.paymentTermCode !== null && paymentTermKey(inv) !== filters.paymentTermCode) return false;
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
