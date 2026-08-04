import "server-only";

import { vendorById, categoryByCode, plants } from "@/lib/sap/raw-data";
import { getFilteredPoItems, getFilteredInvoices } from "@/lib/sap/aggregate";
import type { SapFilters } from "@/lib/sap/types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

// ---------------------------------------------------------------------------
// Headline — Unmanaged Spend = off-PO invoices + off-contract POs
// ---------------------------------------------------------------------------

export interface ComplianceHeadline {
  unmanagedSpendInr: number;
  unmanagedSpendPercent: number;
  unmanagedInvoiceCount: number;
  unmanagedSupplierCount: number;
  offPoSpendInr: number;
  offContractSpendInr: number;
}

export function getComplianceHeadline(filters: SapFilters): ComplianceHeadline {
  const poItems = getFilteredPoItems(filters);
  const invoiceRows = getFilteredInvoices(filters);
  const offContractPo = poItems.filter((p) => !p.contract_number);
  const offPoInvoices = invoiceRows.filter((i) => !i.po_number);

  const offContractSpendInr = offContractPo.reduce((s, p) => s + p.net_value_inr, 0);
  const offPoSpendInr = offPoInvoices.reduce((s, i) => s + i.invoice_value_inr, 0);
  const unmanagedSpendInr = offContractSpendInr + offPoSpendInr;

  const totalSpendInr =
    poItems.reduce((s, p) => s + p.net_value_inr, 0) + invoiceRows.reduce((s, i) => s + i.invoice_value_inr, 0);
  const unmanagedSpendPercent = totalSpendInr > 0 ? round2((unmanagedSpendInr / totalSpendInr) * 100) : 0;

  const unmanagedSuppliers = new Set([
    ...offContractPo.map((p) => p.vendor_id),
    ...offPoInvoices.map((i) => i.vendor_id),
  ]);

  return {
    unmanagedSpendInr: round2(unmanagedSpendInr),
    unmanagedSpendPercent,
    unmanagedInvoiceCount: offPoInvoices.length + offContractPo.length,
    unmanagedSupplierCount: unmanagedSuppliers.size,
    offPoSpendInr: round2(offPoSpendInr),
    offContractSpendInr: round2(offContractSpendInr),
  };
}

// ---------------------------------------------------------------------------
// Off-PO / Off-Contract split, by category
// ---------------------------------------------------------------------------

export interface CategorySpendPoint {
  category: string;
  value: number;
  /** Share of this widget's own total (e.g. % of total off-PO spend), not of overall company spend. */
  percent: number;
}

function bucketByL1<T>(rows: T[], categoryCodeFn: (r: T) => string, valueFn: (r: T) => number): CategorySpendPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const l1 = categoryByCode.get(categoryCodeFn(r))?.category_l1 ?? "Other";
    map.set(l1, (map.get(l1) ?? 0) + valueFn(r));
  }
  const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
  return Array.from(map.entries())
    .map(([category, value]) => ({ category, value: round2(value), percent: percent(value, total) }))
    .sort((a, b) => b.value - a.value);
}

/** Categories ranked by off-PO spend — invoices with no purchase order. */
export function getOffPoByCategoryData(filters: SapFilters): CategorySpendPoint[] {
  const offPoInvoices = getFilteredInvoices(filters).filter((i) => !i.po_number);
  return bucketByL1(offPoInvoices, (i) => i.category_code, (i) => i.invoice_value_inr);
}

/** Categories ranked by off-contract spend — POs with no associated contract. */
export function getOffContractByCategoryData(filters: SapFilters): CategorySpendPoint[] {
  const offContractPo = getFilteredPoItems(filters).filter((p) => !p.contract_number);
  return bucketByL1(offContractPo, (p) => p.category_code, (p) => p.net_value_inr);
}

// ---------------------------------------------------------------------------
// Unmanaged spend, by supplier / BU
// ---------------------------------------------------------------------------

export interface SupplierSpendPoint {
  key: string;
  displayName: string;
  value: number;
  /** Share of total unmanaged spend across every supplier (not just the ones listed). */
  percent: number;
}

/** Suppliers ranked by unmanaged spend (off-PO + off-contract combined). */
export function getUnmanagedBySupplierData(filters: SapFilters, limit = 15): SupplierSpendPoint[] {
  const offContractPo = getFilteredPoItems(filters).filter((p) => !p.contract_number);
  const offPoInvoices = getFilteredInvoices(filters).filter((i) => !i.po_number);

  const map = new Map<string, { displayName: string; value: number }>();
  function add(vendorId: string, value: number) {
    const vendor = vendorById.get(vendorId);
    const key = vendor?.parent_company_group ?? vendorId;
    const displayName = vendor?.parent_company_group ?? vendor?.vendor_name ?? vendorId;
    const entry = map.get(key) ?? { displayName, value: 0 };
    entry.value += value;
    map.set(key, entry);
  }
  for (const p of offContractPo) add(p.vendor_id, p.net_value_inr);
  for (const i of offPoInvoices) add(i.vendor_id, i.invoice_value_inr);

  const total = Array.from(map.values()).reduce((s, v) => s + v.value, 0);
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, displayName: v.displayName, value: round2(v.value), percent: percent(v.value, total) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export interface BuSpendPoint {
  plantCode: string;
  plantName: string;
  value: number;
  /** Share of total unmanaged spend across every BU. */
  percent: number;
}

// ---------------------------------------------------------------------------
// Supplier Detailed Report (SAP Spend Control Tower "Detailed Report")
// ---------------------------------------------------------------------------

export interface ComplianceDetailRow {
  key: string;
  supplierName: string;
  invoices: number;
  plants: number;
  categories: number;
  /** Not tracked at this transaction grain in the current dataset (no material/product id on a PO line). */
  products: number | null;
  unmanagedSpendInr: number;
  totalSpendInr: number;
}

/** Supplier-grain drill-down: every supplier's unmanaged spend against their total spend. */
export function getComplianceDetailReportData(filters: SapFilters, limit = 500): ComplianceDetailRow[] {
  const poItems = getFilteredPoItems(filters);
  const invoiceRows = getFilteredInvoices(filters);

  interface Entry {
    supplierName: string;
    unmanagedSpend: number;
    totalSpend: number;
    plants: Set<string>;
    categories: Set<string>;
    invoices: number;
  }
  const map = new Map<string, Entry>();
  function entryFor(vendorId: string): Entry {
    const vendor = vendorById.get(vendorId);
    const key = vendor?.parent_company_group ?? vendorId;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        supplierName: vendor?.parent_company_group ?? vendor?.vendor_name ?? vendorId,
        unmanagedSpend: 0,
        totalSpend: 0,
        plants: new Set(),
        categories: new Set(),
        invoices: 0,
      };
      map.set(key, entry);
    }
    return entry;
  }

  for (const p of poItems) {
    const entry = entryFor(p.vendor_id);
    entry.totalSpend += p.net_value_inr;
    if (!p.contract_number) entry.unmanagedSpend += p.net_value_inr;
    entry.plants.add(p.plant_code);
    const l1 = categoryByCode.get(p.category_code)?.category_l1;
    if (l1) entry.categories.add(l1);
  }
  for (const inv of invoiceRows) {
    const entry = entryFor(inv.vendor_id);
    entry.totalSpend += inv.invoice_value_inr;
    entry.invoices += 1;
    if (!inv.po_number) entry.unmanagedSpend += inv.invoice_value_inr;
    entry.plants.add(inv.plant_code);
    const l1 = categoryByCode.get(inv.category_code)?.category_l1;
    if (l1) entry.categories.add(l1);
  }

  return Array.from(map.entries())
    .map(([key, e]) => ({
      key,
      supplierName: e.supplierName,
      invoices: e.invoices,
      plants: e.plants.size,
      categories: e.categories.size,
      products: null,
      unmanagedSpendInr: round2(e.unmanagedSpend),
      totalSpendInr: round2(e.totalSpend),
    }))
    .sort((a, b) => b.unmanagedSpendInr - a.unmanagedSpendInr)
    .slice(0, limit);
}

/** Business units ranked by unmanaged spend (off-PO + off-contract combined). */
export function getUnmanagedByBuData(filters: SapFilters): BuSpendPoint[] {
  const offContractPo = getFilteredPoItems(filters).filter((p) => !p.contract_number);
  const offPoInvoices = getFilteredInvoices(filters).filter((i) => !i.po_number);

  const map = new Map<string, number>();
  for (const p of offContractPo) map.set(p.plant_code, (map.get(p.plant_code) ?? 0) + p.net_value_inr);
  for (const i of offPoInvoices) map.set(i.plant_code, (map.get(i.plant_code) ?? 0) + i.invoice_value_inr);

  const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
  return plants
    .map((pl) => {
      const value = round2(map.get(pl.plant_code) ?? 0);
      return { plantCode: pl.plant_code, plantName: pl.plant_name, value, percent: percent(value, total) };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}
