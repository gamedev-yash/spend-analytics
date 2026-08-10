import "server-only";

// The natural-key SAP view (Vendor/Category/Plant/Material/PoItem/Invoice) that
// app/spend-overview, app/compliance, and their aggregate.ts/compliance.ts
// helpers are built on. Sourced from the same public/sample-data/*.csv the
// registry-keyed lib/server/sample-data-source.ts denormalizes for the
// warehouse/CSV-provider path — this file just reads the raw dimension and
// fact tables directly, keyed by their own natural columns instead of the
// registry's column ids.

import { readCsv } from "@/lib/server/sample-data-source";
import type { Vendor, Category, Plant, Material, PoItem, Invoice } from "@/lib/sap/types";

function text(value: string | undefined): string {
  return (value ?? "").trim();
}

function num(value: string | undefined): number {
  const n = Number(text(value).replace(/[,₹$€\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function bool(value: string | undefined): boolean {
  return text(value).toLowerCase() === "true";
}

export const vendors: Vendor[] = readCsv("dim_vendor.csv").map((row) => ({
  vendor_id: text(row.vendor_id),
  vendor_name: text(row.vendor_name),
  parent_company_group: text(row.parent_company_group) || null,
  country: text(row.country),
  city: text(row.city),
  account_group: text(row.account_group) as Vendor["account_group"],
  payment_terms_key: text(row.payment_terms_key),
  is_active: bool(row.is_active),
}));

export const categories: Category[] = readCsv("dim_category.csv").map((row) => ({
  category_code: text(row.category_code),
  category_name: text(row.category_name),
  category_l1: text(row.category_l1),
  category_l2: text(row.category_l2),
}));

export const plants: Plant[] = readCsv("dim_plant.csv").map((row) => ({
  plant_code: text(row.plant_code),
  plant_name: text(row.plant_name),
  company_code: text(row.company_code),
  region: text(row.region),
}));

export const materials: Material[] = readCsv("dim_material.csv").map((row) => ({
  material_number: text(row.material_number),
  material_description: text(row.material_description),
  material_type: text(row.material_type) as Material["material_type"],
  category_code: text(row.category_code),
}));

export const poItems: PoItem[] = readCsv("fact_po_items.csv").map((row) => {
  const docType = text(row.doc_type) as PoItem["doc_type"];
  return {
    po_number: text(row.po_number),
    po_item: num(row.po_item),
    vendor_id: text(row.vendor_id),
    category_code: text(row.category_code),
    plant_code: text(row.plant_code),
    po_date: text(row.po_date),
    net_value_inr: num(row.net_value_inr),
    quantity: num(row.quantity),
    unit: text(row.unit),
    currency: text(row.currency),
    doc_type: docType,
    // fact_po_items has no contract_number FK (metadata-registry.ts) — MK
    // (contract) / FO (framework order) are the two doc types issued against a
    // standing agreement, matching the is_contract_backed derivation
    // sample-data-source.ts uses for the same CSV.
    contract_number: docType === "MK" || docType === "FO" ? docType : null,
    is_deleted: bool(row.is_deleted),
  };
});

export const invoices: Invoice[] = readCsv("fact_invoices.csv").map((row) => ({
  invoice_number: text(row.invoice_number),
  invoice_date: text(row.invoice_date),
  po_number: text(row.po_number) || null,
  vendor_id: text(row.vendor_id),
  category_code: text(row.category_code),
  plant_code: text(row.plant_code),
  invoice_value_inr: num(row.invoice_value_inr),
  currency: text(row.currency),
}));

export const vendorById = new Map(vendors.map((v) => [v.vendor_id, v]));
export const categoryByCode = new Map(categories.map((c) => [c.category_code, c]));
export const plantByCode = new Map(plants.map((p) => [p.plant_code, p]));

export const L1_CATEGORIES = Array.from(new Set(categories.map((c) => c.category_l1)));
export const PLANT_LIST = plants;

export const DATA_MIN_DATE = "2023-01-01";
export const DATA_MAX_DATE = "2025-12-31";
