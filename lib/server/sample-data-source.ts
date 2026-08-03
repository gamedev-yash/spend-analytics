import "server-only";

// The query API's answer when no database is configured: the same
// ClientCsvAdapter the browser uses, run server-side over public/sample-data/
// with rows shaped to the metadata registry's column ids.
//
// Deliberately not a stub returning invented numbers. The registry describes the
// star schema, so the CSVs are denormalized here exactly as
// scripts/seed-azure-sql.ts denormalizes them for the warehouse — sharing
// lib/server/sap-transforms — which makes a payload answered from the samples
// agree with the same payload answered from Azure SQL. That is what makes the
// dev experience honest, and what lets Step 4's frontend switch adapters without
// its numbers moving.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { ClientCsvAdapter } from "@/lib/adapters/client-csv-adapter";
import { fiscalParts, fxRate, humanizeGroupName } from "@/lib/server/sap-transforms";
import { getDataset, listColumns } from "@/lib/server/metadata-registry";
import type { ColumnMeta } from "@/lib/infer";
import type { Dataset, DatasetRow } from "@/types/dataset";

const ROOT = process.cwd();
const SAMPLE_DIR = join(ROOT, "public", "sample-data");
const SAP_DIR = join(ROOT, "data", "sap");

type RawRow = Record<string, string>;

function readCsv(fileName: string): RawRow[] {
  const raw = readFileSync(join(SAMPLE_DIR, fileName), "utf-8");
  return Papa.parse<RawRow>(raw, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  }).data;
}

function readJson<T>(dir: string, fileName: string): T {
  return JSON.parse(readFileSync(join(dir, fileName), "utf-8")) as T;
}

function text(value: string | undefined): string {
  return (value ?? "").trim();
}

function num(value: string | undefined): number {
  const n = Number(text(value).replace(/[,₹$€\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Dimension lookups
// ---------------------------------------------------------------------------

interface VendorAttrs {
  vendor_name: string;
  parent_company_name: string | null;
  vendor_country: string;
  vendor_city: string;
  payment_term_code: string | null;
}

interface CategoryAttrs {
  category_l1_name: string;
  category_l2_name: string;
}

interface PlantAttrs {
  plant_name: string;
  company_code: string;
  company_name: string;
}

interface Dimensions {
  vendors: Map<string, VendorAttrs>;
  categories: Map<string, CategoryAttrs>;
  plants: Map<string, PlantAttrs>;
  paymentTerms: Map<string, { net_due_days: number | null; term_description: string }>;
}

function loadDimensions(): Dimensions {
  const vendors = new Map<string, VendorAttrs>();
  for (const row of readCsv("dim_vendor.csv")) {
    const id = text(row.vendor_id);
    if (!id) continue;
    const group = text(row.parent_company_group);
    vendors.set(id, {
      vendor_name: text(row.vendor_name) || id,
      parent_company_name: group ? humanizeGroupName(group) : null,
      vendor_country: text(row.country),
      vendor_city: text(row.city),
      payment_term_code: text(row.payment_terms_key) || null,
    });
  }

  const categories = new Map<string, CategoryAttrs>();
  const categoryRows = readJson<
    { category_code: string; category_name: string; category_l1: string; category_l2: string }[]
  >(SAP_DIR, "dimCategory.json");
  for (const row of categoryRows) {
    categories.set(row.category_code, {
      category_l1_name: row.category_l1 || "Unclassified",
      category_l2_name: row.category_l2 || row.category_name || row.category_code,
    });
  }

  const plants = new Map<string, PlantAttrs>();
  const plantRows = readJson<
    { plant_code: string; plant_name: string; company_code: string }[]
  >(SAP_DIR, "dimPlant.json");
  for (const row of plantRows) {
    plants.set(row.plant_code, {
      plant_name: row.plant_name || row.plant_code,
      company_code: row.company_code,
      // Companies are 1:1 with plants in the sample extract, matching how the
      // seed script derives dim_company.company_name.
      company_name: row.plant_name || row.company_code,
    });
  }

  const paymentTerms = new Map<string, { net_due_days: number | null; term_description: string }>();
  for (const row of readCsv("payment-terms.csv")) {
    const code = text(row.payment_term_code);
    if (!code || paymentTerms.has(code)) continue;
    const nominal = text(row.nominal_days);
    paymentTerms.set(code, {
      net_due_days: nominal === "" ? null : num(nominal),
      term_description: text(row.payment_term_name) || code,
    });
  }
  for (const vendor of vendors.values()) {
    const code = vendor.payment_term_code;
    if (!code || paymentTerms.has(code)) continue;
    const days = /(\d+)/.exec(code);
    paymentTerms.set(code, {
      net_due_days: days ? Number(days[1]) : null,
      term_description: days ? `Net ${days[1]} days` : code,
    });
  }

  return { vendors, categories, plants, paymentTerms };
}

// ---------------------------------------------------------------------------
// Fact row builders — keys are metadata-registry column ids
// ---------------------------------------------------------------------------

function buildPoItemRows(dims: Dimensions): DatasetRow[] {
  // spend-overview.csv is the PO line-item grain; see scripts/seed-azure-sql.ts.
  const rows: DatasetRow[] = [];
  for (const row of readCsv("spend-overview.csv")) {
    if (text(row.is_deleted).toLowerCase() === "true") continue;
    const vendorId = text(row.vendor_id);
    const vendor = dims.vendors.get(vendorId);
    const category = dims.categories.get(text(row.category_code));
    const plant = dims.plants.get(text(row.plant_code));
    const currency = (text(row.currency) || "INR").toUpperCase();
    const valueInr = round(num(row.net_value_inr), 2);
    const valueDoc = round(valueInr / fxRate(currency), 2);
    const quantity = round(num(row.quantity), 3);

    rows.push({
      vendor_id: vendorId,
      vendor_name: vendor?.vendor_name ?? text(row.vendor_name),
      parent_company_name: vendor?.parent_company_name ?? null,
      vendor_country: vendor?.vendor_country ?? null,
      vendor_city: vendor?.vendor_city ?? null,
      material_group_id: text(row.category_code),
      category_l1_name: category?.category_l1_name ?? text(row.category_l1),
      category_l2_name: category?.category_l2_name ?? text(row.category_l2),
      plant_code: text(row.plant_code),
      plant_name: plant?.plant_name ?? text(row.plant_name),
      company_code: plant?.company_code ?? null,
      company_name: plant?.company_name ?? null,
      po_date: text(row.po_date),
      po_number: text(row.po_number),
      currency_code: currency,
      is_contract_backed: text(row.contract_number) !== "" ? 1 : 0,
      net_order_value_inr: valueInr,
      net_order_value_doc: valueDoc,
      po_quantity: quantity,
      unit_price: quantity > 0 ? round(valueDoc / quantity, 2) : null,
    });
  }
  return rows;
}

function buildInvoiceRows(dims: Dimensions): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (const row of readCsv("fact_invoices.csv")) {
    const vendorId = text(row.vendor_id);
    const vendor = dims.vendors.get(vendorId);
    const category = dims.categories.get(text(row.category_code));
    const plant = dims.plants.get(text(row.plant_code));
    const currency = (text(row.currency) || "INR").toUpperCase();
    const grossInr = round(num(row.invoice_value_inr), 2);
    const grossDoc = round(grossInr / fxRate(currency), 2);
    // The extract has no separate posting date; the ledger date is the document
    // date, exactly as the seed script assumes.
    const invoiceDate = text(row.invoice_date);
    const iso = /^(\d{4})-(\d{2})/.exec(invoiceDate);
    const termCode = vendor?.payment_term_code ?? null;
    const term = termCode ? dims.paymentTerms.get(termCode) : undefined;

    rows.push({
      vendor_id: vendorId,
      vendor_name: vendor?.vendor_name ?? vendorId,
      parent_company_name: vendor?.parent_company_name ?? null,
      vendor_country: vendor?.vendor_country ?? null,
      material_group_id: text(row.category_code),
      category_l1_name: category?.category_l1_name ?? null,
      category_l2_name: category?.category_l2_name ?? null,
      plant_code: text(row.plant_code),
      plant_name: plant?.plant_name ?? text(row.plant_code),
      company_name: plant?.company_name ?? null,
      payment_term_code: termCode,
      payment_term_description: term?.term_description ?? null,
      net_due_days: term?.net_due_days ?? null,
      posting_date: invoiceDate,
      invoice_date: invoiceDate,
      invoice_number: text(row.invoice_number),
      po_number: text(row.po_number) || null,
      currency_code: currency,
      fiscal_year: iso ? fiscalParts(Number(iso[1]), Number(iso[2])).fiscalYear : null,
      // No credit-memo or payment-block indicator exists in the sample extract.
      is_credit_memo: 0,
      payment_block_flag: 0,
      gross_amount_inr: grossInr,
      gross_amount_doc: grossDoc,
      net_amount_inr: grossInr,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Dataset assembly
// ---------------------------------------------------------------------------

/** ColumnMeta straight off the registry, so types agree with the warehouse. */
function columnsFor(datasetId: string, rows: DatasetRow[]): ColumnMeta[] {
  const dataset = getDataset(datasetId);
  if (!dataset) return [];
  return listColumns(dataset).map((column) => {
    const distinct = new Set<unknown>();
    for (const row of rows) {
      const value = row[column.id];
      if (value !== null && value !== undefined && value !== "") distinct.add(value);
    }
    return { id: column.id, name: column.name, type: column.type, distinctCount: distinct.size };
  });
}

const cache = new Map<string, Dataset>();
let dimensionsCache: Dimensions | null = null;

/** The sample dataset for a registry id, parsed once per process. */
export function getSampleDataset(datasetId: string): Dataset | null {
  const cached = cache.get(datasetId);
  if (cached) return cached;
  if (!getDataset(datasetId)) return null;

  dimensionsCache ??= loadDimensions();
  const rows =
    datasetId === "fact_po_items"
      ? buildPoItemRows(dimensionsCache)
      : datasetId === "fact_invoices"
        ? buildInvoiceRows(dimensionsCache)
        : null;
  if (!rows) return null;

  const dataset: Dataset = {
    id: datasetId,
    name: getDataset(datasetId)?.name ?? datasetId,
    rows,
    columns: columnsFor(datasetId, rows),
    createdAt: new Date(0).toISOString(),
  };
  cache.set(datasetId, dataset);
  return dataset;
}

/**
 * Provider over the sample datasets. Same class the browser runs, so grouping,
 * aggregation, sorting, and Top-N behave identically.
 */
export const sampleDataProvider = new ClientCsvAdapter(() =>
  ["fact_po_items", "fact_invoices"].flatMap((id) => {
    const dataset = getSampleDataset(id);
    return dataset ? [dataset] : [];
  })
);
