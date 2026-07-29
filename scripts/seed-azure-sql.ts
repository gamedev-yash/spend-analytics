// Transforms the sample CSVs under public/sample-data/ into the Azure SQL star
// schema defined in db/schema.sql, writing db/seed-data.sql and — when
// AZURE_SQL_CONNECTION_STRING is set — pushing straight to the database.
//
//   npx tsx scripts/seed-azure-sql.ts
//   npm run seed:sql
//
// Environment
//   AZURE_SQL_CONNECTION_STRING  when set, executes against the database
//                                (requires `npm i -D mssql`)
//   USD_INR_RATE, EUR_INR_RATE   override the conversion rates below
//   SEED_OUT                     override the output path
//
// ---------------------------------------------------------------------------
// Source availability
//
// Three tables named in the star schema have no CSV of their own; they are
// derived from the SAP JSON extracts the CSVs were generated from:
//
//   dim_plant, dim_company   ← data/sap/dimPlant.json (carries company_code)
//   dim_material_category    ← data/sap/dimCategory.json (carries L1/L2 names;
//                              dim_material.csv has only the group code)
//
// And fact_po_items has no fact_po_items.csv — spend-overview.csv is that
// grain (one row per PO line item, 20 columns incl. is_deleted and
// contract_number). SOURCES below prefers a real CSV wherever one appears
// later, so dropping fact_po_items.csv into public/sample-data/ takes over
// without a code change.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = process.env.SEED_OUT ?? join(ROOT, "db", "seed-data.sql");

/** Document-currency → INR. The sample amounts are already INR, so the ETL
 *  divides by these to recover the document-currency figure. */
const FX_TO_INR: Record<string, number> = {
  INR: 1,
  USD: Number(process.env.USD_INR_RATE ?? 83.5),
  EUR: Number(process.env.EUR_INR_RATE ?? 90),
};

/** dim_date coverage. Wider than the fact window so late arrivals still resolve. */
const DATE_FROM = "2023-01-01";
const DATE_TO = "2028-12-31";

/** T-SQL caps a single INSERT ... VALUES at 1000 rows. */
const INSERT_BATCH = 1000;

type Row = Record<string, string>;

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

interface SourceSpec {
  /** Candidate paths, most preferred first. */
  candidates: string[];
  /** Why a non-obvious source is used — printed in the run summary. */
  note?: string;
}

const SOURCES: Record<string, SourceSpec> = {
  vendors: { candidates: ["public/sample-data/dim_vendor.csv"] },
  materials: { candidates: ["public/sample-data/dim_material.csv"] },
  categories: {
    candidates: ["public/sample-data/dim_category.csv", "data/sap/dimCategory.json"],
    note: "no dim_category.csv — dim_material.csv carries the group code but not the L1/L2 names",
  },
  plants: {
    candidates: ["public/sample-data/dim_plant.csv", "data/sap/dimPlant.json"],
    note: "no dim_plant.csv — dimPlant.json is also the only source of company_code",
  },
  paymentTerms: { candidates: ["public/sample-data/payment-terms.csv"] },
  poItems: {
    candidates: ["public/sample-data/fact_po_items.csv", "public/sample-data/spend-overview.csv"],
    note: "no fact_po_items.csv — spend-overview.csv is the PO line-item grain",
  },
  invoices: { candidates: ["public/sample-data/fact_invoices.csv"] },
};

const resolvedSources = new Map<string, string>();

function resolveSource(name: string): string {
  const spec = SOURCES[name];
  const hit = spec.candidates.find((candidate) => existsSync(join(ROOT, candidate)));
  if (!hit) {
    throw new Error(
      `No source found for "${name}". Looked for:\n  ${spec.candidates.join("\n  ")}`
    );
  }
  resolvedSources.set(name, hit);
  return join(ROOT, hit);
}

/** Read a source as string rows, whether it is CSV or a JSON array. */
function readSource(name: string): Row[] {
  const path = resolveSource(name);
  const raw = readFileSync(path, "utf-8");
  if (path.endsWith(".json")) {
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    return parsed.map((record) =>
      Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)])
      )
    );
  }
  const result = Papa.parse<Row>(raw, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}

// ---------------------------------------------------------------------------
// Scalar helpers
// ---------------------------------------------------------------------------

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

function truthy(value: string | undefined): boolean {
  const t = text(value).toLowerCase();
  return t === "true" || t === "1" || t === "x" || t === "yes";
}

/** "CATERPILLAR-GRP" → "Caterpillar Group" — the source carries only a code. */
function humanizeGroup(code: string): string {
  return code
    .replace(/-GRP$/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) =>
      word.length <= 3 && word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ")
    .concat(" Group");
}

function fxRate(currency: string): number {
  const rate = FX_TO_INR[currency.toUpperCase()];
  if (rate === undefined) {
    unknownCurrencies.add(currency);
    return 1;
  }
  return rate;
}

const unknownCurrencies = new Set<string>();

// ---------------------------------------------------------------------------
// T-SQL literal rendering
// ---------------------------------------------------------------------------

type Sql = string;

function sqlString(value: string | null | undefined, unicode = true): Sql {
  if (value === null || value === undefined || value === "") return "NULL";
  return `${unicode ? "N" : ""}'${value.replace(/'/g, "''")}'`;
}

function sqlNumber(value: number | null | undefined): Sql {
  if (value === null || value === undefined || !Number.isFinite(value)) return "NULL";
  return String(value);
}

function sqlInt(value: number | null | undefined): Sql {
  if (value === null || value === undefined || !Number.isFinite(value)) return "NULL";
  return String(Math.round(value));
}

function sqlBit(value: boolean): Sql {
  return value ? "1" : "0";
}

function sqlDate(value: string): Sql {
  return `'${value}'`;
}

// ---------------------------------------------------------------------------
// dim_date — Indian fiscal calendar, April to March
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface DateDim {
  dateKey: number;
  fullDate: string;
  year: number;
  quarter: number;
  month: number;
  monthName: string;
  fiscalYear: number;
  fiscalQuarter: number;
  fiscalPeriod: number;
}

/**
 * Fiscal attributes for a calendar month. April is period 1 of the year that
 * starts it, so January–March belong to the previous fiscal year:
 * 25 Jan 2024 → FY 2023-24, quarter 4, period 10.
 */
function fiscalParts(year: number, month: number) {
  const fiscalPeriod = month >= 4 ? month - 3 : month + 9;
  return {
    fiscalYear: month >= 4 ? year : year - 1,
    fiscalQuarter: Math.ceil(fiscalPeriod / 3),
    fiscalPeriod,
  };
}

function buildDateDimension(from: string, to: string): DateDim[] {
  const rows: DateDim[] = [];
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = new Date(`${from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    rows.push({
      dateKey: year * 10000 + month * 100 + day,
      fullDate: d.toISOString().slice(0, 10),
      year,
      quarter: Math.ceil(month / 3),
      month,
      monthName: MONTH_NAMES[month - 1],
      ...fiscalParts(year, month),
    });
  }
  return rows;
}

/** "2024-01-25" → 20240125, or null when the cell is empty or unparseable. */
function toDateKey(value: string | undefined): number | null {
  const t = text(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!iso) return null;
  return Number(iso[1]) * 10000 + Number(iso[2]) * 100 + Number(iso[3]);
}

// ---------------------------------------------------------------------------
// Dimension builders. Each returns rows already carrying their surrogate key,
// so fact rows resolve by lookup and the generated INSERTs need no round-trip
// through the database (see IDENTITY_INSERT in emitDimension).
// ---------------------------------------------------------------------------

interface VendorDim {
  vendorKey: number;
  vendorId: string;
  vendorName: string;
  parentGroupKey: string | null;
  parentCompanyName: string | null;
  country: string | null;
  city: string | null;
  taxId: string | null;
  /** ZTERM default from the supplier master — how an invoice gets its term. */
  paymentTermsKey: string | null;
}

function buildVendors(rows: Row[]): VendorDim[] {
  const seen = new Set<string>();
  const out: VendorDim[] = [];
  for (const row of rows) {
    const vendorId = text(row.vendor_id);
    if (!vendorId || seen.has(vendorId)) continue;
    seen.add(vendorId);
    const group = text(row.parent_company_group);
    out.push({
      vendorKey: out.length + 1,
      vendorId,
      vendorName: text(row.vendor_name) || vendorId,
      parentGroupKey: group || null,
      parentCompanyName: group ? humanizeGroup(group) : null,
      country: text(row.country) || null,
      city: text(row.city) || null,
      // Not present in the supplier extract; left NULL rather than fabricated.
      taxId: null,
      paymentTermsKey: text(row.payment_terms_key) || null,
    });
  }
  return out;
}

interface CategoryDim {
  categoryKey: number;
  materialGroupId: string;
  l1: string;
  l2: string;
}

function buildCategories(rows: Row[]): CategoryDim[] {
  const seen = new Set<string>();
  const out: CategoryDim[] = [];
  for (const row of rows) {
    const code = text(row.category_code) || text(row.material_group_id);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const leaf = text(row.category_l2) || text(row.category_name) || code;
    out.push({
      categoryKey: out.length + 1,
      materialGroupId: code,
      l1: text(row.category_l1) || "Unclassified",
      l2: leaf,
    });
  }
  return out;
}

interface PlantDim {
  plantKey: number;
  plantCode: string;
  plantName: string;
  country: string | null;
  companyCode: string;
}

interface CompanyDim {
  companyKey: number;
  companyCode: string;
  companyName: string;
}

/** Plants and the companies they roll up to; the extract holds both. */
function buildPlantsAndCompanies(rows: Row[]): { plants: PlantDim[]; companies: CompanyDim[] } {
  const plants: PlantDim[] = [];
  const seenPlant = new Set<string>();
  const companyNames = new Map<string, string>();

  for (const row of rows) {
    const plantCode = text(row.plant_code);
    if (!plantCode || seenPlant.has(plantCode)) continue;
    seenPlant.add(plantCode);
    const plantName = text(row.plant_name) || plantCode;
    const companyCode = text(row.company_code) || plantCode.slice(0, 4);
    plants.push({
      plantKey: plants.length + 1,
      plantCode,
      plantName,
      // The extract carries an Indian state in `region` but no ISO country;
      // every plant in it is domestic.
      country: text(row.country) || "IN",
      companyCode,
    });
    if (!companyNames.has(companyCode)) {
      companyNames.set(companyCode, plantName);
    } else {
      warn(
        `dim_company: company ${companyCode} spans several plants — keeping "${companyNames.get(companyCode)}" as its name`
      );
    }
  }

  const companies = [...companyNames.entries()].map(([companyCode, companyName], index) => ({
    companyKey: index + 1,
    companyCode,
    companyName,
  }));
  return { plants, companies };
}

interface PaymentTermDim {
  paymentTermKey: number;
  termCode: string;
  description: string;
  netDueDays: number | null;
  discountDays: number | null;
  discountPercent: number | null;
}

/**
 * Payment terms from two vocabularies: the invoice extract's business codes
 * (NET45, D2N10N45, EOM60) and the supplier master's SAP keys (ZN30…ZN90).
 * Both must exist, because invoices inherit their term from the vendor.
 */
function buildPaymentTerms(invoiceRows: Row[], vendors: VendorDim[]): PaymentTermDim[] {
  const out: PaymentTermDim[] = [];
  const seen = new Set<string>();

  for (const row of invoiceRows) {
    const termCode = text(row.payment_term_code);
    if (!termCode || seen.has(termCode)) continue;
    seen.add(termCode);
    const description = text(row.payment_term_name) || termCode;
    const nominal = text(row.nominal_days);
    // Early-settlement terms only: "D2N10N45" → 2% if paid within 10 days.
    // RET10N60 ("10% retention") and ADV5050 ("50% advance") are not discounts.
    const discountCode = /^D\d+N(\d+)N\d+$/.exec(termCode);
    const discountText = /^([\d.]+)\s*%\s*(\d+)\s+net/i.exec(description);
    out.push({
      paymentTermKey: out.length + 1,
      termCode,
      description,
      netDueDays: nominal === "" ? null : num(nominal),
      discountDays: discountCode ? Number(discountCode[1]) : null,
      discountPercent: discountCode && discountText ? round(Number(discountText[1]), 2) : null,
    });
  }

  // ZN60 → "Net 60 days". Added after the business codes so the invoice
  // extract keeps the lower keys.
  for (const vendor of vendors) {
    const termCode = vendor.paymentTermsKey;
    if (!termCode || seen.has(termCode)) continue;
    seen.add(termCode);
    const days = /(\d+)/.exec(termCode);
    out.push({
      paymentTermKey: out.length + 1,
      termCode,
      description: days ? `Net ${days[1]} days` : termCode,
      netDueDays: days ? Number(days[1]) : null,
      discountDays: null,
      discountPercent: null,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Fact builders
// ---------------------------------------------------------------------------

interface Lookups {
  vendorKey: Map<string, number>;
  categoryKey: Map<string, number>;
  plantKey: Map<string, number>;
  companyKeyByPlant: Map<string, number>;
  paymentTermKey: Map<string, number>;
  vendorTermCode: Map<string, string | null>;
  dateKeys: Set<number>;
}

interface RejectCounts {
  deletedLines: number;
  unresolvedVendor: number;
  unresolvedCategory: number;
  unresolvedPlant: number;
  unresolvedDate: number;
  creditMemosFlipped: number;
}

function newRejects(): RejectCounts {
  return {
    deletedLines: 0,
    unresolvedVendor: 0,
    unresolvedCategory: 0,
    unresolvedPlant: 0,
    unresolvedDate: 0,
    creditMemosFlipped: 0,
  };
}

/**
 * SAP deletion indicator. LOEKZ is a single-character flag that is blank for
 * live lines and 'L' (or 'S') once the line is flagged for deletion — hence
 * "LOEKZ IS NOT NULL" means deleted. The CSV extract exposes the same fact as
 * a boolean `is_deleted`; both spellings are honoured.
 */
function isDeletedLine(row: Row): boolean {
  if ("LOEKZ" in row || "loekz" in row) {
    return text(row.LOEKZ ?? row.loekz) !== "";
  }
  return truthy(row.is_deleted ?? row.deletion_indicator);
}

/**
 * SAP credit-memo test for an invoice document. RSEG/BSEG carry SHKZG
 * ('H' = credit, 'S' = debit) and RBKP carries BLART ('KG' = vendor credit
 * memo). The sample extract has none of these columns, so nothing flips today;
 * the rule is in place for the real extract, and the run summary reports how
 * many rows matched so a silent zero is never mistaken for "handled".
 */
function isCreditMemo(row: Row): boolean {
  const shkzg = text(row.SHKZG ?? row.shkzg).toUpperCase();
  if (shkzg) return shkzg === "H";
  const blart = text(row.BLART ?? row.blart ?? row.document_type).toUpperCase();
  if (blart) return blart === "KG" || blart === "RE_KG";
  return truthy(row.is_credit_memo ?? row.credit_memo);
}

interface PoItemFact {
  vendorKey: number;
  categoryKey: number;
  plantKey: number;
  companyKey: number;
  poDateKey: number;
  poNumber: string;
  poItemNumber: number;
  netValueDoc: number;
  netValueInr: number;
  currency: string;
  quantity: number;
  unitPrice: number | null;
  isContractBacked: boolean;
}

function buildPoItems(rows: Row[], lk: Lookups, rejects: RejectCounts): PoItemFact[] {
  const out: PoItemFact[] = [];
  for (const row of rows) {
    if (isDeletedLine(row)) {
      rejects.deletedLines += 1;
      continue;
    }
    const vendorKey = lk.vendorKey.get(text(row.vendor_id));
    const categoryKey = lk.categoryKey.get(text(row.category_code));
    const plantCode = text(row.plant_code);
    const plantKey = lk.plantKey.get(plantCode);
    const companyKey = lk.companyKeyByPlant.get(plantCode);
    const poDateKey = toDateKey(row.po_date);
    if (vendorKey === undefined) { rejects.unresolvedVendor += 1; continue; }
    if (categoryKey === undefined) { rejects.unresolvedCategory += 1; continue; }
    if (plantKey === undefined || companyKey === undefined) { rejects.unresolvedPlant += 1; continue; }
    if (poDateKey === null || !lk.dateKeys.has(poDateKey)) { rejects.unresolvedDate += 1; continue; }

    const currency = (text(row.currency) || "INR").toUpperCase();
    // No sign flip here: SHKZG/BLART are invoice-document fields, and a PO's
    // own document type (BSART: NB/UB/FO/MK) never denotes a credit memo.
    // The extract stores the INR figure; the document-currency amount is
    // recovered with the same rate the warehouse reports on.
    const netValueInr = round(num(row.net_value_inr ?? row.net_order_value_inr), 2);
    const netValueDoc = round(netValueInr / fxRate(currency), 2);
    const quantity = round(num(row.quantity ?? row.po_quantity), 3);

    out.push({
      vendorKey,
      categoryKey,
      plantKey,
      companyKey,
      poDateKey,
      poNumber: text(row.po_number),
      poItemNumber: Math.round(num(row.po_item ?? row.po_item_number)),
      netValueDoc,
      netValueInr,
      currency,
      quantity,
      unitPrice: quantity > 0 ? round(netValueDoc / quantity, 2) : null,
      isContractBacked: text(row.contract_number) !== "",
    });
  }
  return out;
}

interface InvoiceFact {
  vendorKey: number;
  categoryKey: number;
  plantKey: number;
  companyKey: number;
  paymentTermKey: number | null;
  postingDateKey: number;
  invoiceDateKey: number;
  invoiceNumber: string;
  fiscalYear: number;
  invoiceItemNumber: number;
  poNumber: string | null;
  poItemNumber: number | null;
  grossDoc: number;
  grossInr: number;
  netInr: number;
  currency: string;
  isCreditMemo: boolean;
  paymentBlock: boolean;
}

function buildInvoices(rows: Row[], lk: Lookups, rejects: RejectCounts): InvoiceFact[] {
  const out: InvoiceFact[] = [];
  // The extract is header-level; without an item number every invoice is line 1.
  const itemCounter = new Map<string, number>();

  for (const row of rows) {
    const vendorId = text(row.vendor_id);
    const vendorKey = lk.vendorKey.get(vendorId);
    const categoryKey = lk.categoryKey.get(text(row.category_code));
    const plantCode = text(row.plant_code);
    const plantKey = lk.plantKey.get(plantCode);
    const companyKey = lk.companyKeyByPlant.get(plantCode);
    // No separate posting date in the extract — the ledger date is taken as
    // the document date, which is also how the CSV dashboards read it.
    const invoiceDateKey = toDateKey(row.invoice_date);
    const postingDateKey = toDateKey(row.posting_date) ?? invoiceDateKey;
    if (vendorKey === undefined) { rejects.unresolvedVendor += 1; continue; }
    if (categoryKey === undefined) { rejects.unresolvedCategory += 1; continue; }
    if (plantKey === undefined || companyKey === undefined) { rejects.unresolvedPlant += 1; continue; }
    if (invoiceDateKey === null || postingDateKey === null) { rejects.unresolvedDate += 1; continue; }
    if (!lk.dateKeys.has(invoiceDateKey) || !lk.dateKeys.has(postingDateKey)) {
      rejects.unresolvedDate += 1;
      continue;
    }

    const currency = (text(row.currency) || "INR").toUpperCase();
    const credit = isCreditMemo(row);
    if (credit) rejects.creditMemosFlipped += 1;
    const sign = credit ? -1 : 1;
    const grossInr = round(num(row.invoice_value_inr ?? row.gross_amount_inr) * sign, 2);
    const grossDoc = round(grossInr / fxRate(currency), 2);
    // No tax split in the extract, so net equals gross.
    const netInr = grossInr;

    const invoiceNumber = text(row.invoice_number);
    const nextItem = (itemCounter.get(invoiceNumber) ?? 0) + 1;
    itemCounter.set(invoiceNumber, nextItem);

    const year = Math.floor(postingDateKey / 10000);
    const month = Math.floor((postingDateKey % 10000) / 100);

    out.push({
      vendorKey,
      categoryKey,
      plantKey,
      companyKey,
      paymentTermKey: resolveInvoiceTerm(row, vendorId, lk),
      postingDateKey,
      invoiceDateKey,
      invoiceNumber,
      fiscalYear: fiscalParts(year, month).fiscalYear,
      invoiceItemNumber: Math.round(num(row.invoice_item ?? row.invoice_item_number)) || nextItem,
      poNumber: text(row.po_number) || null,
      poItemNumber: text(row.po_item ?? row.po_item_number) ? Math.round(num(row.po_item ?? row.po_item_number)) : null,
      grossDoc,
      grossInr,
      netInr,
      currency,
      isCreditMemo: credit,
      paymentBlock: truthy(row.payment_block ?? row.ZLSPR ?? row.zlspr),
    });
  }
  return out;
}

/** Term on the invoice if the extract carries one, else the vendor's default. */
function resolveInvoiceTerm(row: Row, vendorId: string, lk: Lookups): number | null {
  const onInvoice = text(row.payment_term_code ?? row.ZTERM ?? row.zterm);
  if (onInvoice) return lk.paymentTermKey.get(onInvoice) ?? null;
  const fromVendor = lk.vendorTermCode.get(vendorId);
  return fromVendor ? lk.paymentTermKey.get(fromVendor) ?? null : null;
}

// ---------------------------------------------------------------------------
// SQL emission
// ---------------------------------------------------------------------------

const warnings: string[] = [];

function warn(message: string): void {
  if (!warnings.includes(message)) warnings.push(message);
}

/**
 * Batched INSERT for one dimension. Surrogate keys are assigned by this script
 * so the fact rows can carry them directly, which needs IDENTITY_INSERT; the
 * identity counter is reseeded afterwards so later manual inserts continue
 * from the right place.
 */
function emitDimension(
  table: string,
  columns: string[],
  rows: Sql[][],
  options: { identity?: boolean; reseedFrom?: number } = {}
): Sql[] {
  const { identity = true, reseedFrom } = options;
  const statements: Sql[] = [
    `PRINT 'Seeding ${table} (${rows.length} rows)';`,
  ];
  if (rows.length === 0) return [...statements, `-- no rows`, ""];
  if (identity) statements.push(`SET IDENTITY_INSERT dbo.${table} ON;`);
  statements.push(...batchedInserts(table, columns, rows));
  if (identity) statements.push(`SET IDENTITY_INSERT dbo.${table} OFF;`);
  if (identity && reseedFrom !== undefined) {
    statements.push(`DBCC CHECKIDENT ('dbo.${table}', RESEED, ${reseedFrom}) WITH NO_INFOMSGS;`);
  }
  statements.push("GO", "");
  return statements;
}

function batchedInserts(table: string, columns: string[], rows: Sql[][]): Sql[] {
  const statements: Sql[] = [];
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    statements.push(
      `INSERT INTO dbo.${table} (${columns.join(", ")}) VALUES`,
      batch.map((values) => `  (${values.join(", ")})`).join(",\n") + ";"
    );
  }
  return statements;
}

function emitFact(table: string, columns: string[], rows: Sql[][]): Sql[] {
  return [
    `PRINT 'Seeding ${table} (${rows.length} rows)';`,
    ...(rows.length === 0 ? ["-- no rows"] : batchedInserts(table, columns, rows)),
    "GO",
    "",
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface Loaded {
  vendors: VendorDim[];
  categories: CategoryDim[];
  plants: PlantDim[];
  companies: CompanyDim[];
  paymentTerms: PaymentTermDim[];
  dates: DateDim[];
  poItems: PoItemFact[];
  invoices: InvoiceFact[];
  poRejects: RejectCounts;
  invoiceRejects: RejectCounts;
  materialCount: number;
  orphanMaterials: number;
}

function load(): Loaded {
  const vendors = buildVendors(readSource("vendors"));
  const categories = buildCategories(readSource("categories"));
  const { plants, companies } = buildPlantsAndCompanies(readSource("plants"));
  const paymentTerms = buildPaymentTerms(readSource("paymentTerms"), vendors);
  const dates = buildDateDimension(DATE_FROM, DATE_TO);

  const categoryKey = new Map(categories.map((c) => [c.materialGroupId, c.categoryKey]));
  const companyKeyByCode = new Map(companies.map((c) => [c.companyCode, c.companyKey]));
  const lookups: Lookups = {
    vendorKey: new Map(vendors.map((v) => [v.vendorId, v.vendorKey])),
    categoryKey,
    plantKey: new Map(plants.map((p) => [p.plantCode, p.plantKey])),
    companyKeyByPlant: new Map(
      plants.flatMap((p) => {
        const key = companyKeyByCode.get(p.companyCode);
        return key === undefined ? [] : [[p.plantCode, key] as [string, number]];
      })
    ),
    paymentTermKey: new Map(paymentTerms.map((t) => [t.termCode, t.paymentTermKey])),
    vendorTermCode: new Map(vendors.map((v) => [v.vendorId, v.paymentTermsKey])),
    dateKeys: new Set(dates.map((d) => d.dateKey)),
  };

  // dim_material is not part of the star schema as specified; it is read to
  // confirm every material's group resolves to a category row.
  const materials = readSource("materials");
  const orphanMaterials = materials.filter((m) => !categoryKey.has(text(m.category_code))).length;

  const poRejects = newRejects();
  const invoiceRejects = newRejects();
  const poItems = buildPoItems(readSource("poItems"), lookups, poRejects);
  const invoices = buildInvoices(readSource("invoices"), lookups, invoiceRejects);

  return {
    vendors, categories, plants, companies, paymentTerms, dates,
    poItems, invoices, poRejects, invoiceRejects,
    materialCount: materials.length,
    orphanMaterials,
  };
}

function renderSeedSql(d: Loaded): string {
  const header = [
    "/* ===========================================================================",
    "   Vedanta Spend Analytics — seed data for the Azure SQL star schema",
    "",
    "   GENERATED FILE — do not edit. Regenerate with:",
    "     npx tsx scripts/seed-azure-sql.ts",
    "",
    "   Run db/schema.sql first. Both facts are cleared before insert, so this",
    "   file is safe to re-run.",
    "",
    `   FX to INR: ${Object.entries(FX_TO_INR).map(([c, r]) => `${c}=${r}`).join(", ")}`,
    `   dim_date:  ${DATE_FROM} .. ${DATE_TO} (Indian fiscal year, April–March)`,
    "   =========================================================================== */",
    "",
    "SET NOCOUNT ON;",
    "GO",
    "",
    "PRINT 'Clearing existing rows (facts first — they hold the foreign keys)';",
    "DELETE FROM dbo.fact_invoices;",
    "DELETE FROM dbo.fact_po_items;",
    "DELETE FROM dbo.dim_date;",
    "DELETE FROM dbo.dim_payment_terms;",
    "DELETE FROM dbo.dim_company;",
    "DELETE FROM dbo.dim_plant;",
    "DELETE FROM dbo.dim_material_category;",
    "DELETE FROM dbo.dim_vendor;",
    "GO",
    "",
  ];

  const body: Sql[] = [
    ...emitDimension(
      "dim_vendor",
      ["vendor_key", "vendor_id", "vendor_name", "parent_group_key", "parent_company_name", "country", "city", "tax_id"],
      d.vendors.map((v) => [
        sqlInt(v.vendorKey),
        sqlString(v.vendorId, false),
        sqlString(v.vendorName),
        sqlString(v.parentGroupKey, false),
        sqlString(v.parentCompanyName),
        sqlString(v.country, false),
        sqlString(v.city),
        sqlString(v.taxId, false),
      ]),
      { reseedFrom: d.vendors.length }
    ),
    ...emitDimension(
      "dim_material_category",
      ["category_key", "material_group_id", "category_l1_name", "category_l2_name"],
      d.categories.map((c) => [
        sqlInt(c.categoryKey),
        sqlString(c.materialGroupId, false),
        sqlString(c.l1),
        sqlString(c.l2),
      ]),
      { reseedFrom: d.categories.length }
    ),
    ...emitDimension(
      "dim_plant",
      ["plant_key", "plant_code", "plant_name", "country"],
      d.plants.map((p) => [
        sqlInt(p.plantKey),
        sqlString(p.plantCode, false),
        sqlString(p.plantName),
        sqlString(p.country, false),
      ]),
      { reseedFrom: d.plants.length }
    ),
    ...emitDimension(
      "dim_company",
      ["company_key", "company_code", "company_name"],
      d.companies.map((c) => [
        sqlInt(c.companyKey),
        sqlString(c.companyCode, false),
        sqlString(c.companyName),
      ]),
      { reseedFrom: d.companies.length }
    ),
    ...emitDimension(
      "dim_payment_terms",
      ["payment_term_key", "term_code", "term_description", "net_due_days", "discount_days_1", "discount_percent_1"],
      d.paymentTerms.map((t) => [
        sqlInt(t.paymentTermKey),
        sqlString(t.termCode, false),
        sqlString(t.description),
        sqlInt(t.netDueDays),
        sqlInt(t.discountDays),
        sqlNumber(t.discountPercent),
      ]),
      { reseedFrom: d.paymentTerms.length }
    ),
    // date_key is a computed YYYYMMDD, not an identity column.
    ...emitDimension(
      "dim_date",
      ["date_key", "full_date", "[year]", "[quarter]", "[month]", "month_name", "fiscal_year", "fiscal_quarter", "fiscal_period"],
      d.dates.map((x) => [
        sqlInt(x.dateKey),
        sqlDate(x.fullDate),
        sqlInt(x.year),
        sqlInt(x.quarter),
        sqlInt(x.month),
        sqlString(x.monthName, false),
        sqlInt(x.fiscalYear),
        sqlInt(x.fiscalQuarter),
        sqlInt(x.fiscalPeriod),
      ]),
      { identity: false }
    ),
    ...emitFact(
      "fact_po_items",
      ["vendor_key", "category_key", "plant_key", "company_key", "po_date_key", "po_number", "po_item_number",
       "net_order_value_doc", "net_order_value_inr", "currency_code", "po_quantity", "unit_price", "is_contract_backed"],
      d.poItems.map((p) => [
        sqlInt(p.vendorKey),
        sqlInt(p.categoryKey),
        sqlInt(p.plantKey),
        sqlInt(p.companyKey),
        sqlInt(p.poDateKey),
        sqlString(p.poNumber, false),
        sqlInt(p.poItemNumber),
        sqlNumber(p.netValueDoc),
        sqlNumber(p.netValueInr),
        sqlString(p.currency, false),
        sqlNumber(p.quantity),
        sqlNumber(p.unitPrice),
        sqlBit(p.isContractBacked),
      ])
    ),
    ...emitFact(
      "fact_invoices",
      ["vendor_key", "category_key", "plant_key", "company_key", "payment_term_key", "posting_date_key",
       "invoice_date_key", "invoice_number", "fiscal_year", "invoice_item_number", "po_number", "po_item_number",
       "gross_amount_doc", "gross_amount_inr", "net_amount_inr", "currency_code", "is_credit_memo", "payment_block_flag"],
      d.invoices.map((i) => [
        sqlInt(i.vendorKey),
        sqlInt(i.categoryKey),
        sqlInt(i.plantKey),
        sqlInt(i.companyKey),
        sqlInt(i.paymentTermKey),
        sqlInt(i.postingDateKey),
        sqlInt(i.invoiceDateKey),
        sqlString(i.invoiceNumber, false),
        sqlInt(i.fiscalYear),
        sqlInt(i.invoiceItemNumber),
        sqlString(i.poNumber, false),
        sqlInt(i.poItemNumber),
        sqlNumber(i.grossDoc),
        sqlNumber(i.grossInr),
        sqlNumber(i.netInr),
        sqlString(i.currency, false),
        sqlBit(i.isCreditMemo),
        sqlBit(i.paymentBlock),
      ])
    ),
    "PRINT 'Seed complete.';",
    "GO",
  ];

  return [...header, ...body].join("\n") + "\n";
}

/**
 * Push the generated script to Azure SQL. `mssql` is not a project dependency
 * — the specifier is resolved at runtime so a missing driver never breaks the
 * file-generating path (nor `tsc`).
 */
async function executeAgainstAzure(sql: string, connectionString: string): Promise<void> {
  const specifier = "mssql";
  let mssql: { connect: (cs: string) => Promise<{ batch: (q: string) => Promise<unknown>; close: () => Promise<void> }> };
  try {
    mssql = (await import(specifier)) as typeof mssql;
  } catch {
    throw new Error(
      "AZURE_SQL_CONNECTION_STRING is set but the `mssql` driver is not installed.\n" +
        "  Install it with:  npm i -D mssql\n" +
        "  db/seed-data.sql was still written and can be run with sqlcmd or Azure Data Studio."
    );
  }

  console.log("\nConnecting to Azure SQL…");
  const pool = await mssql.connect(connectionString);
  try {
    // GO is a client batch separator, not T-SQL — split on it and send each part.
    const batches = sql
      .split(/^\s*GO\s*$/gim)
      .map((batch) => batch.trim())
      .filter((batch) => batch.length > 0);
    console.log(`Executing ${batches.length} batches…`);
    for (const [index, batch] of batches.entries()) {
      try {
        await pool.batch(batch);
      } catch (err) {
        throw new Error(`Batch ${index + 1}/${batches.length} failed: ${(err as Error).message}`);
      }
    }
    console.log("Database seeded.");
  } finally {
    await pool.close();
  }
}

function reportRejects(
  label: string,
  kept: number,
  read: number,
  r: RejectCounts,
  rules: ("deleted" | "creditMemo")[]
): void {
  console.log(`  ${label}: ${kept.toLocaleString()} of ${read.toLocaleString()} rows kept`);
  const lines: [string, number][] = [
    ...(rules.includes("deleted")
      ? ([["deleted lines excluded (LOEKZ / is_deleted)", r.deletedLines]] as [string, number][])
      : []),
    ...(rules.includes("creditMemo")
      ? ([["credit memos sign-flipped (SHKZG='H' / BLART='KG')", r.creditMemosFlipped]] as [string, number][])
      : []),
    ["dropped — vendor not in dim_vendor", r.unresolvedVendor],
    ["dropped — category not in dim_material_category", r.unresolvedCategory],
    ["dropped — plant not in dim_plant", r.unresolvedPlant],
    ["dropped — date outside dim_date", r.unresolvedDate],
  ];
  for (const [rule, count] of lines) {
    console.log(`      ${count === 0 ? "·" : "→"} ${rule}: ${count.toLocaleString()}`);
  }
}

async function main(): Promise<void> {
  console.log("Building Azure SQL star schema seed\n");

  const data = load();

  console.log("Sources");
  for (const [name, path] of resolvedSources) {
    const note = SOURCES[name].note;
    console.log(`  ${name.padEnd(13)} ${path}${note ? `\n      (${note})` : ""}`);
  }

  console.log("\nDimensions");
  console.log(`  dim_vendor            ${data.vendors.length.toLocaleString()}`);
  console.log(`  dim_material_category ${data.categories.length.toLocaleString()}`);
  console.log(`  dim_plant             ${data.plants.length.toLocaleString()}`);
  console.log(`  dim_company           ${data.companies.length.toLocaleString()}`);
  console.log(`  dim_payment_terms     ${data.paymentTerms.length.toLocaleString()}`);
  console.log(`  dim_date              ${data.dates.length.toLocaleString()}  (${DATE_FROM} .. ${DATE_TO})`);

  console.log("\nFacts");
  const poRead = data.poItems.length + data.poRejects.deletedLines + data.poRejects.unresolvedVendor +
    data.poRejects.unresolvedCategory + data.poRejects.unresolvedPlant + data.poRejects.unresolvedDate;
  const invRead = data.invoices.length + data.invoiceRejects.unresolvedVendor +
    data.invoiceRejects.unresolvedCategory + data.invoiceRejects.unresolvedPlant + data.invoiceRejects.unresolvedDate;
  reportRejects("fact_po_items", data.poItems.length, poRead, data.poRejects, ["deleted"]);
  reportRejects("fact_invoices", data.invoices.length, invRead, data.invoiceRejects, ["creditMemo"]);

  console.log(`\n  dim_material cross-check: ${data.materialCount.toLocaleString()} materials, ${data.orphanMaterials} with an unknown material group`);

  if (unknownCurrencies.size > 0) {
    warn(`no FX rate for ${[...unknownCurrencies].join(", ")} — treated as 1.0 (set USD_INR_RATE / EUR_INR_RATE or extend FX_TO_INR)`);
  }
  if (data.poItems.length === 0) warn("fact_po_items is empty — check the PO source");
  if (data.invoices.length === 0) warn("fact_invoices is empty — check the invoice source");

  const sql = renderSeedSql(data);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, sql, "utf-8");
  const sizeMb = (Buffer.byteLength(sql, "utf-8") / 1_048_576).toFixed(1);
  console.log(`\nWrote ${relative(ROOT, OUT_PATH).replace(/\\/g, "/")}  (${sizeMb} MB)`);

  if (warnings.length > 0) {
    console.log("\nWarnings");
    for (const message of warnings) console.log(`  ! ${message}`);
  }

  const connectionString = process.env.AZURE_SQL_CONNECTION_STRING;
  if (!connectionString) {
    console.log("\nAZURE_SQL_CONNECTION_STRING not set — file generated only.");
    console.log("To apply it:  sqlcmd -S <server> -d <db> -G -i db/schema.sql -i db/seed-data.sql");
    return;
  }
  await executeAgainstAzure(sql, connectionString);
}

main().catch((err: unknown) => {
  console.error(`\nSeed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
