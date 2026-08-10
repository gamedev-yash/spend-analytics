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
//
// fact_payments / agg_vendor_annual / dim_contract / dim_material /
// dim_payment_terms are CSV-only for now — see metadata-registry.ts's comments
// on each — so this file is their only implementation; there is no parallel
// seed-azure-sql.ts path for them yet.

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

type RawRow = Record<string, string>;

export function readCsv(fileName: string): RawRow[] {
  const raw = readFileSync(join(SAMPLE_DIR, fileName), "utf-8");
  return Papa.parse<RawRow>(raw, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  }).data;
}

function text(value: string | undefined): string {
  return (value ?? "").trim();
}

function textOrNull(value: string | undefined): string | null {
  const t = text(value);
  return t === "" ? null : t;
}

function num(value: string | undefined): number {
  const n = Number(text(value).replace(/[,₹$€\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: string | undefined): number | null {
  const t = text(value);
  if (t === "") return null;
  const n = Number(t.replace(/[,₹$€\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bool01(value: string | undefined): number {
  return text(value).toLowerCase() === "true" ? 1 : 0;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Dimension lookups — shared by every fact/standalone builder below
// ---------------------------------------------------------------------------

interface VendorAttrs {
  vendor_name: string;
  parent_company_name: string | null;
  vendor_country: string;
  vendor_city: string;
  account_group: string | null;
  payment_term_code: string | null;
  is_active: number;
}

interface CategoryAttrs {
  category_l1_name: string;
  category_l2_name: string;
}

interface PlantAttrs {
  plant_name: string;
  company_code: string;
  company_name: string;
  region: string;
}

interface PaymentTermAttrs {
  term_description: string;
  net_due_days: number | null;
  discount_days_1: number | null;
  discount_percent_1: number | null;
  discount_days_2: number | null;
  discount_percent_2: number | null;
  is_discount_term: number;
}

interface Dimensions {
  vendors: Map<string, VendorAttrs>;
  categories: Map<string, CategoryAttrs>;
  plants: Map<string, PlantAttrs>;
  paymentTerms: Map<string, PaymentTermAttrs>;
}

function loadDimensions(): Dimensions {
  const vendors = new Map<string, VendorAttrs>();
  for (const row of readCsv("dim_vendor.csv")) {
    const id = text(row.vendor_id);
    if (!id) continue;
    const group = text(row.parent_company_group);
    // "IND-<own vendor_id>" is this extract's placeholder for "no group" (a
    // vendor that is its own ultimate parent) — the same concept
    // db/schema.sql's parent_group_key models as NULL. Only a value shared by
    // more than one vendor is a real group worth humanizing into a display name.
    const isSelfPlaceholder = group === `IND-${id}`;
    vendors.set(id, {
      vendor_name: text(row.vendor_name) || id,
      parent_company_name: group && !isSelfPlaceholder ? humanizeGroupName(group) : null,
      vendor_country: text(row.country),
      vendor_city: text(row.city),
      account_group: text(row.account_group) || null,
      payment_term_code: text(row.payment_terms_key) || null,
      is_active: bool01(row.is_active),
    });
  }

  const categories = new Map<string, CategoryAttrs>();
  for (const row of readCsv("dim_category.csv")) {
    const code = text(row.category_code);
    if (!code) continue;
    categories.set(code, {
      category_l1_name: text(row.category_l1) || "Unclassified",
      category_l2_name: text(row.category_l2) || text(row.category_name) || code,
    });
  }

  const plants = new Map<string, PlantAttrs>();
  for (const row of readCsv("dim_plant.csv")) {
    const code = text(row.plant_code);
    if (!code) continue;
    plants.set(code, {
      plant_name: text(row.plant_name) || code,
      company_code: text(row.company_code),
      // db/schema.sql's dim_company is 1:1 with plant in the sample extract;
      // no separate company display name exists, so plant_name doubles as it.
      company_name: text(row.plant_name) || text(row.company_code),
      region: text(row.region),
    });
  }

  const paymentTerms = new Map<string, PaymentTermAttrs>();
  for (const row of readCsv("dim_payment_terms.csv")) {
    const code = text(row.payment_term_key);
    if (!code) continue;
    paymentTerms.set(code, {
      term_description: text(row.payment_term_description) || code,
      net_due_days: numOrNull(row.net_days),
      discount_days_1: numOrNull(row.discount_days_1),
      discount_percent_1: numOrNull(row.discount_percent_1),
      discount_days_2: numOrNull(row.discount_days_2),
      discount_percent_2: numOrNull(row.discount_percent_2),
      is_discount_term: bool01(row.is_discount_term),
    });
  }

  return { vendors, categories, plants, paymentTerms };
}

// ---------------------------------------------------------------------------
// Fact row builders — keys are metadata-registry column ids
// ---------------------------------------------------------------------------

function buildPoItemRows(dims: Dimensions): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (const row of readCsv("fact_po_items.csv")) {
    if (text(row.is_deleted).toLowerCase() === "true") continue;
    const vendorId = text(row.vendor_id);
    const vendor = dims.vendors.get(vendorId);
    const category = dims.categories.get(text(row.category_code));
    const plant = dims.plants.get(text(row.plant_code));
    const currency = (text(row.currency) || "INR").toUpperCase();
    const valueInr = round(num(row.net_value_inr), 2);
    const valueDoc = round(valueInr / fxRate(currency), 2);
    const quantity = round(num(row.quantity), 3);
    const docType = text(row.doc_type);

    rows.push({
      vendor_id: vendorId,
      vendor_name: vendor?.vendor_name ?? vendorId,
      parent_company_name: vendor?.parent_company_name ?? null,
      vendor_country: vendor?.vendor_country ?? null,
      vendor_city: vendor?.vendor_city ?? null,
      vendor_is_active: vendor?.is_active ?? 1,
      material_group_id: text(row.category_code),
      category_l1_name: category?.category_l1_name ?? null,
      category_l2_name: category?.category_l2_name ?? null,
      plant_code: text(row.plant_code),
      plant_name: plant?.plant_name ?? text(row.plant_code),
      region: plant?.region ?? null,
      company_code: plant?.company_code ?? null,
      company_name: plant?.company_name ?? null,
      po_date: text(row.po_date),
      po_number: text(row.po_number),
      po_item: text(row.po_item),
      currency_code: currency,
      doc_type: docType,
      // MK (contract) / FO (framework order) are the two doc types issued
      // against a standing agreement; NB (standard) / UB (stock transfer) are not.
      is_contract_backed: docType === "MK" || docType === "FO" ? 1 : 0,
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
      region: plant?.region ?? null,
      company_name: plant?.company_name ?? null,
      payment_term_code: termCode,
      payment_term_description: term?.term_description ?? null,
      net_due_days: term?.net_due_days ?? null,
      posting_date: invoiceDate,
      invoice_date: invoiceDate,
      invoice_number: text(row.invoice_number),
      po_number: textOrNull(row.po_number),
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

function buildPaymentRows(dims: Dimensions): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (const row of readCsv("fact_payments.csv")) {
    const vendorId = text(row.vendor_id);
    const vendor = dims.vendors.get(vendorId);
    const categoryCode = text(row.category_code);
    const category = dims.categories.get(categoryCode);
    const plantCode = text(row.plant_code);
    const plant = dims.plants.get(plantCode);
    const termKey = text(row.payment_term_key);
    const term = dims.paymentTerms.get(termKey);

    rows.push({
      document_number: text(row.document_number),
      document_type: text(row.document_type),
      company_code: text(row.company_code),
      fiscal_year: numOrNull(row.fiscal_year),
      vendor_id: vendorId,
      vendor_name: vendor?.vendor_name ?? vendorId,
      parent_company_name: vendor?.parent_company_name ?? null,
      category_code: categoryCode,
      category_l1_name: category?.category_l1_name ?? null,
      category_l2_name: category?.category_l2_name ?? null,
      plant_code: plantCode,
      plant_name: plant?.plant_name ?? plantCode,
      region: plant?.region ?? null,
      payment_term_key: termKey,
      payment_term_description: term?.term_description ?? null,
      net_days: numOrNull(row.net_days),
      discount_days_1: numOrNull(row.discount_days_1),
      discount_percent_1: numOrNull(row.discount_percent_1),
      invoice_date: text(row.invoice_date),
      baseline_date: text(row.baseline_date),
      clearing_date: textOrNull(row.clearing_date),
      clearing_document: textOrNull(row.clearing_document),
      payment_status: text(row.payment_status),
      actual_dpo: numOrNull(row.actual_dpo),
      invoice_amount_inr: round(num(row.invoice_amount_inr), 2),
      discount_available_inr: round(num(row.discount_available_inr), 2),
      discount_captured_inr: round(num(row.discount_captured_inr), 2),
      discount_missed_inr: round(num(row.discount_missed_inr), 2),
    });
  }
  return rows;
}

function buildAggVendorAnnualRows(dims: Dimensions): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (const row of readCsv("agg_vendor_annual.csv")) {
    const vendorId = text(row.vendor_id);
    const vendor = dims.vendors.get(vendorId);
    rows.push({
      vendor_id: vendorId,
      vendor_name: text(row.vendor_name) || vendor?.vendor_name || vendorId,
      // Not agg_vendor_annual's own parent_company_group column — that carries
      // the raw SAP-style code (GRP-013, or IND-<self> for no group) verbatim.
      // dim_vendor's own row is already humanized and self-placeholder-null'd.
      parent_company_group: vendor?.parent_company_name ?? null,
      vendor_country: vendor?.vendor_country ?? null,
      account_group: vendor?.account_group ?? null,
      year: text(row.year),
      spend_rank: num(row.spend_rank),
      cumulative_spend_pct: num(row.cumulative_spend_pct),
      is_tail: bool01(row.is_tail),
      tail_tier: text(row.tail_tier),
      total_spend_inr: round(num(row.total_spend_inr), 2),
      po_count: num(row.po_count),
      avg_po_value_inr: round(num(row.avg_po_value_inr), 2),
      category_count: num(row.category_count),
      plant_count: num(row.plant_count),
    });
  }
  return rows;
}

function buildContractRows(dims: Dimensions): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (const row of readCsv("dim_contract.csv")) {
    const vendorId = text(row.vendor_id);
    const vendor = dims.vendors.get(vendorId);
    const categoryCode = text(row.category_code);
    const category = dims.categories.get(categoryCode);
    const plantCode = text(row.plant_code);
    const plant = dims.plants.get(plantCode);

    rows.push({
      contract_number: text(row.contract_number),
      vendor_id: vendorId,
      vendor_name: vendor?.vendor_name ?? vendorId,
      category_code: categoryCode,
      category_l1_name: category?.category_l1_name ?? null,
      category_l2_name: category?.category_l2_name ?? null,
      plant_code: plantCode,
      plant_name: plant?.plant_name ?? plantCode,
      region: plant?.region ?? null,
      start_date: text(row.start_date),
      end_date: text(row.end_date),
      is_active: bool01(row.is_active),
      contract_value_inr: round(num(row.contract_value_inr), 2),
    });
  }
  return rows;
}

function buildMaterialRows(dims: Dimensions): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (const row of readCsv("dim_material.csv")) {
    const categoryCode = text(row.category_code);
    const category = dims.categories.get(categoryCode);
    rows.push({
      material_number: text(row.material_number),
      material_description: text(row.material_description),
      material_type: text(row.material_type),
      category_code: categoryCode,
      category_l1_name: category?.category_l1_name ?? null,
      category_l2_name: category?.category_l2_name ?? null,
    });
  }
  return rows;
}

function buildPaymentTermRows(): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (const row of readCsv("dim_payment_terms.csv")) {
    rows.push({
      payment_term_key: text(row.payment_term_key),
      payment_term_description: text(row.payment_term_description),
      net_days: numOrNull(row.net_days),
      discount_days_1: numOrNull(row.discount_days_1),
      discount_percent_1: numOrNull(row.discount_percent_1),
      discount_days_2: numOrNull(row.discount_days_2),
      discount_percent_2: numOrNull(row.discount_percent_2),
      is_discount_term: bool01(row.is_discount_term),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Dataset assembly
// ---------------------------------------------------------------------------

const BUILDERS: Record<string, (dims: Dimensions) => DatasetRow[]> = {
  fact_po_items: buildPoItemRows,
  fact_invoices: buildInvoiceRows,
  fact_payments: buildPaymentRows,
  agg_vendor_annual: buildAggVendorAnnualRows,
  dim_contract: buildContractRows,
  dim_material: buildMaterialRows,
  dim_payment_terms: () => buildPaymentTermRows(),
};

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

  const builder = BUILDERS[datasetId];
  if (!builder) return null;

  dimensionsCache ??= loadDimensions();
  const rows = builder(dimensionsCache);

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
  Object.keys(BUILDERS).flatMap((id) => {
    const dataset = getSampleDataset(id);
    return dataset ? [dataset] : [];
  })
);
