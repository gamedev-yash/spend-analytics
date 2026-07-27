// Converts the static mock datasets behind the four core dashboards into flat
// CSV files under public/sample-data/, so the CSV-upload pipeline has real
// test files whose shape the page adapters understand (round-trippable).
//
//   npm run convert-mock
//
// One CSV per page, at that page's natural row grain:
//   tail-spend.csv            — one row per supplier (bubbles ⟕ consolidation ⟕ SAP report)
//   spend-overview.csv        — one row per PO line item, joined with vendor/category/plant dims
//   payment-terms.csv         — one row per invoice (already flat in the mock)
//   supplier-fragmentation.csv — one row per category concentration record
//
// Deliberately imports only dependency-free mock modules (tailSpendMock,
// supplierMock) and reads the JSON-backed datasets straight from disk —
// lib/sap/raw-data.ts and app/payment-terms/data.ts import "server-only",
// which throws outside a React Server Components runtime.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

import { tailSpendMock } from "../app/tail-spend/tailSpendMock";
import { supplierMock } from "../app/supplier-fragmentation/supplierMock";
import type { Invoice as PaymentTermsInvoice } from "../app/payment-terms/types";
import type { Vendor, Category, Plant, PoItem } from "../lib/sap/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "sample-data");

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(ROOT, relativePath), "utf-8")) as T;
}

/** null/undefined → "" so the CSV cell is empty rather than the string "null". */
function blankNulls(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? ""]));
}

function writeCsv(fileName: string, rows: Record<string, unknown>[], columns: string[]): void {
  const csv = Papa.unparse(
    { fields: columns, data: rows.map((r) => columns.map((c) => blankNulls(r)[c] ?? "")) },
    { newline: "\n" }
  );
  writeFileSync(join(OUT_DIR, fileName), `${csv}\n`, "utf-8");
  console.log(`  ${fileName}: ${rows.length} rows x ${columns.length} cols`);
}

// ---------------------------------------------------------------------------
// 1. tail-spend.csv — supplier grain
// ---------------------------------------------------------------------------

function buildTailSpendRows(): { rows: Record<string, unknown>[]; columns: string[] } {
  const { supplierBubbles, consolidationCandidates, sapSupplierReport } = tailSpendMock;

  const byId = new Map<string, Record<string, unknown>>();

  for (const b of supplierBubbles) {
    byId.set(b.supplierId, {
      supplierId: b.supplierId,
      supplierName: b.supplierName,
      category: b.category,
      segment: b.segment,
      poCount: b.poCount,
      avgPOValue: b.avgPOValue,
      totalSpend: b.totalSpend,
    });
  }

  for (const c of consolidationCandidates) {
    const row = byId.get(c.supplierId) ?? {
      supplierId: c.supplierId,
      supplierName: c.supplierName,
      category: c.category,
      // Consolidation candidates are tail suppliers by construction.
      segment: "Tail",
      poCount: c.poCount,
      avgPOValue: c.avgPOValue,
      totalSpend: c.totalSpend,
    };
    Object.assign(row, {
      microPOCount: c.microPOCount,
      processingCost: c.processingCost,
      potentialSavings: c.potentialSavings,
      consolidationScore: c.consolidationScore,
      recommendedAction: c.recommendedAction,
    });
    byId.set(c.supplierId, row);
  }

  for (const r of sapSupplierReport) {
    const row = byId.get(r.supplierId) ?? {
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      totalSpend: r.spend,
    };
    Object.assign(row, {
      invoiceCount: r.invoiceCount,
      plantCount: r.plantCount,
      categoryCount: r.categoryCount,
      productCount: r.productCount,
      costCenterCount: r.costCenterCount,
    });
    byId.set(r.supplierId, row);
  }

  return {
    rows: Array.from(byId.values()),
    columns: [
      "supplierId",
      "supplierName",
      "category",
      "segment",
      "poCount",
      "avgPOValue",
      "totalSpend",
      "microPOCount",
      "processingCost",
      "potentialSavings",
      "consolidationScore",
      "recommendedAction",
      "invoiceCount",
      "plantCount",
      "categoryCount",
      "productCount",
      "costCenterCount",
    ],
  };
}

// ---------------------------------------------------------------------------
// 2. spend-overview.csv — PO line-item grain, denormalized with dim names
// ---------------------------------------------------------------------------

function buildSpendOverviewRows(): { rows: Record<string, unknown>[]; columns: string[] } {
  const vendors = readJson<Vendor[]>("data/sap/dimVendor.json");
  const categories = readJson<Category[]>("data/sap/dimCategory.json");
  const plants = readJson<Plant[]>("data/sap/dimPlant.json");
  const poItems = readJson<PoItem[]>("data/sap/factPoItems.json");

  const vendorById = new Map(vendors.map((v) => [v.vendor_id, v]));
  const categoryByCode = new Map(categories.map((c) => [c.category_code, c]));
  const plantByCode = new Map(plants.map((p) => [p.plant_code, p]));

  const rows = poItems.map((p) => {
    const vendor = vendorById.get(p.vendor_id);
    const category = categoryByCode.get(p.category_code);
    const plant = plantByCode.get(p.plant_code);
    return {
      po_number: p.po_number,
      po_item: p.po_item,
      po_date: p.po_date,
      vendor_id: p.vendor_id,
      vendor_name: vendor?.vendor_name ?? "",
      parent_company_group: vendor?.parent_company_group ?? "",
      category_code: p.category_code,
      category_name: category?.category_name ?? "",
      category_l1: category?.category_l1 ?? "Other",
      category_l2: category?.category_l2 ?? "Other",
      plant_code: p.plant_code,
      plant_name: plant?.plant_name ?? p.plant_code,
      region: plant?.region ?? "",
      net_value_inr: p.net_value_inr,
      quantity: p.quantity,
      unit: p.unit,
      currency: p.currency,
      doc_type: p.doc_type,
      contract_number: p.contract_number,
      is_deleted: p.is_deleted,
    };
  });

  return { rows, columns: Object.keys(rows[0]) };
}

// ---------------------------------------------------------------------------
// 3. payment-terms.csv — invoice grain (mock is already flat)
// ---------------------------------------------------------------------------

function buildPaymentTermsRows(): { rows: Record<string, unknown>[]; columns: string[] } {
  const invoices = readJson<PaymentTermsInvoice[]>("payment-terms-mock/data/invoices.json");
  return {
    rows: invoices as unknown as Record<string, unknown>[],
    columns: Object.keys(invoices[0]),
  };
}

// ---------------------------------------------------------------------------
// 4. supplier-fragmentation.csv — category concentration grain
// ---------------------------------------------------------------------------

function buildSupplierFragmentationRows(): { rows: Record<string, unknown>[]; columns: string[] } {
  return {
    rows: supplierMock.categories as unknown as Record<string, unknown>[],
    columns: ["category", "supplierCount", "top3ConcentrationPercent", "singleUseSuppliers", "spendCr"],
  };
}

// ---------------------------------------------------------------------------

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Writing sample CSVs to ${OUT_DIR}`);

  const tailSpend = buildTailSpendRows();
  writeCsv("tail-spend.csv", tailSpend.rows, tailSpend.columns);

  const spendOverview = buildSpendOverviewRows();
  writeCsv("spend-overview.csv", spendOverview.rows, spendOverview.columns);

  const paymentTerms = buildPaymentTermsRows();
  writeCsv("payment-terms.csv", paymentTerms.rows, paymentTerms.columns);

  const supplierFragmentation = buildSupplierFragmentationRows();
  writeCsv("supplier-fragmentation.csv", supplierFragmentation.rows, supplierFragmentation.columns);

  console.log("Done.");
}

main();
