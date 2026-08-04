import "server-only";

import { vendorById, categoryByCode, plants } from "@/lib/sap/raw-data";
import { getFilteredPoItems, getFilteredInvoices } from "@/lib/sap/aggregate";
import type { SapFilters } from "@/lib/sap/types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
}

function bucketByL1<T>(rows: T[], categoryCodeFn: (r: T) => string, valueFn: (r: T) => number): CategorySpendPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const l1 = categoryByCode.get(categoryCodeFn(r))?.category_l1 ?? "Other";
    map.set(l1, (map.get(l1) ?? 0) + valueFn(r));
  }
  return Array.from(map.entries())
    .map(([category, value]) => ({ category, value: round2(value) }))
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

  return Array.from(map.entries())
    .map(([key, v]) => ({ key, displayName: v.displayName, value: round2(v.value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export interface BuSpendPoint {
  plantCode: string;
  plantName: string;
  value: number;
}

/** Business units ranked by unmanaged spend (off-PO + off-contract combined). */
export function getUnmanagedByBuData(filters: SapFilters): BuSpendPoint[] {
  const offContractPo = getFilteredPoItems(filters).filter((p) => !p.contract_number);
  const offPoInvoices = getFilteredInvoices(filters).filter((i) => !i.po_number);

  const map = new Map<string, number>();
  for (const p of offContractPo) map.set(p.plant_code, (map.get(p.plant_code) ?? 0) + p.net_value_inr);
  for (const i of offPoInvoices) map.set(i.plant_code, (map.get(i.plant_code) ?? 0) + i.invoice_value_inr);

  return plants
    .map((pl) => ({ plantCode: pl.plant_code, plantName: pl.plant_name, value: round2(map.get(pl.plant_code) ?? 0) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}
