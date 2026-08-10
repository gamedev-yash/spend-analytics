import "server-only";

// The allowlist that turns a client QueryPayload into SQL. Nothing reaches the
// database unless it is named here: a field the registry does not define is a
// 400, never an interpolated string. Every sqlExpression is a literal written in
// this file, so the only client-supplied values in a query are bound parameters.
//
// Adding a column to a dashboard therefore means adding an entry here — that is
// the point. The registry is also the contract the browser sees: a
// ColumnDefinition carries the same id/name/type triple as lib/infer's
// ColumnMeta, so the frontend's column pickers work unchanged.

export interface ColumnDefinition {
  id: string;
  name: string;
  type: "number" | "date" | "category";
  /** Table (or join alias) the value comes from, e.g. 'fact_po_items'. */
  table: string;
  /** Fully qualified expression, e.g. 'dim_vendor.vendor_name'. */
  sqlExpression: string;
  /** Key in the dataset's allowedJoins that must be joined to read this. */
  requiresJoin?: string;
  distinctCountHint?: number;
}

export interface DatasetDefinition {
  id: string;
  name: string;
  primaryTable: string;
  /** Fact column that dim_date hangs off for time-grain grouping. */
  defaultDateKey: string;
  /**
   * Joinable tables, keyed by alias. When the key differs from `table` the
   * builder emits `AS <alias>` — that is how dim_date appears twice on
   * fact_invoices, once per date role.
   */
  allowedJoins: Record<string, { table: string; on: [string, string] }>;
  columns: Record<string, ColumnDefinition>;
}

/** Schema the registry targets — matches db/schema.sql. */
export const DB_SCHEMA = "dbo";

function column(
  id: string,
  name: string,
  type: ColumnDefinition["type"],
  table: string,
  expression: string,
  requiresJoin?: string,
  distinctCountHint?: number
): ColumnDefinition {
  return { id, name, type, table, sqlExpression: expression, requiresJoin, distinctCountHint };
}

function indexById(columns: ColumnDefinition[]): Record<string, ColumnDefinition> {
  return Object.fromEntries(columns.map((c) => [c.id, c]));
}

// ---------------------------------------------------------------------------
// fact_po_items — committed spend, one row per PO line
// ---------------------------------------------------------------------------

const PO_ITEMS: DatasetDefinition = {
  id: "fact_po_items",
  name: "Purchase Order Items",
  primaryTable: "fact_po_items",
  defaultDateKey: "fact_po_items.po_date_key",
  allowedJoins: {
    dim_vendor: {
      table: "dim_vendor",
      on: ["fact_po_items.vendor_key", "dim_vendor.vendor_key"],
    },
    dim_material_category: {
      table: "dim_material_category",
      on: ["fact_po_items.category_key", "dim_material_category.category_key"],
    },
    dim_plant: {
      table: "dim_plant",
      on: ["fact_po_items.plant_key", "dim_plant.plant_key"],
    },
    dim_company: {
      table: "dim_company",
      on: ["fact_po_items.company_key", "dim_company.company_key"],
    },
    dim_date: {
      table: "dim_date",
      on: ["fact_po_items.po_date_key", "dim_date.date_key"],
    },
  },
  // Headline grouping dimensions come first: declaration order is what the
  // frontend's column pickers and filter heuristic walk.
  columns: indexById([
    // Category
    column("category_l1_name", "Category L1", "category", "dim_material_category", "dim_material_category.category_l1_name", "dim_material_category", 13),
    column("category_l2_name", "Category L2", "category", "dim_material_category", "dim_material_category.category_l2_name", "dim_material_category", 75),
    column("material_group_id", "Material Group", "category", "dim_material_category", "dim_material_category.material_group_id", "dim_material_category", 75),
    // Plant / company
    column("plant_name", "Plant", "category", "dim_plant", "dim_plant.plant_name", "dim_plant", 7),
    column("plant_code", "Plant Code", "category", "dim_plant", "dim_plant.plant_code", "dim_plant", 7),
    // CSV-only, like vendor_is_active above — db/schema.sql's dim_plant has no
    // region column yet.
    column("region", "Region", "category", "dim_plant", "dim_plant.region", "dim_plant", 6),
    column("company_name", "Company", "category", "dim_company", "dim_company.company_name", "dim_company", 7),
    column("company_code", "Company Code", "category", "dim_company", "dim_company.company_code", "dim_company", 7),
    // Vendor
    column("vendor_name", "Vendor", "category", "dim_vendor", "dim_vendor.vendor_name", "dim_vendor", 800),
    column("vendor_id", "Vendor ID", "category", "dim_vendor", "dim_vendor.vendor_id", "dim_vendor", 800),
    column("parent_company_name", "Supplier Group", "category", "dim_vendor", "dim_vendor.parent_company_name", "dim_vendor", 33),
    column("vendor_country", "Vendor Country", "category", "dim_vendor", "dim_vendor.country", "dim_vendor", 9),
    column("vendor_city", "Vendor City", "category", "dim_vendor", "dim_vendor.city", "dim_vendor", 26),
    // db/schema.sql's dim_vendor has no is_active column yet (CSV-only, like
    // fact_payments and friends — see that comment for what this means for
    // Azure SQL mode). Supplier Fragmentation's active-supplier count needs it.
    column("vendor_is_active", "Vendor Active", "category", "dim_vendor", "dim_vendor.is_active", "dim_vendor", 2),
    // Date
    column("po_date", "PO Date", "date", "dim_date", "dim_date.full_date", "dim_date", 1096),
    // Degenerate dimensions
    column("currency_code", "Currency", "category", "fact_po_items", "fact_po_items.currency_code", undefined, 3),
    column("doc_type", "Document Type", "category", "fact_po_items", "fact_po_items.doc_type", undefined, 4),
    column("is_contract_backed", "Contract Backed", "category", "fact_po_items", "fact_po_items.is_contract_backed", undefined, 2),
    column("po_number", "PO Number", "category", "fact_po_items", "fact_po_items.po_number", undefined, 50000),
    column("po_item", "PO Line Item", "category", "fact_po_items", "fact_po_items.po_item", undefined, 12),
    // Measures
    column("net_order_value_inr", "Net Order Value (INR)", "number", "fact_po_items", "fact_po_items.net_order_value_inr"),
    column("net_order_value_doc", "Net Order Value (Doc Currency)", "number", "fact_po_items", "fact_po_items.net_order_value_doc"),
    column("po_quantity", "PO Quantity", "number", "fact_po_items", "fact_po_items.po_quantity"),
    column("unit_price", "Unit Price", "number", "fact_po_items", "fact_po_items.unit_price"),
  ]),
};

// ---------------------------------------------------------------------------
// fact_invoices — actual spend, one row per invoice line
// ---------------------------------------------------------------------------

const INVOICES: DatasetDefinition = {
  id: "fact_invoices",
  name: "Supplier Invoices",
  primaryTable: "fact_invoices",
  defaultDateKey: "fact_invoices.posting_date_key",
  allowedJoins: {
    dim_vendor: {
      table: "dim_vendor",
      on: ["fact_invoices.vendor_key", "dim_vendor.vendor_key"],
    },
    dim_material_category: {
      table: "dim_material_category",
      on: ["fact_invoices.category_key", "dim_material_category.category_key"],
    },
    dim_plant: {
      table: "dim_plant",
      on: ["fact_invoices.plant_key", "dim_plant.plant_key"],
    },
    dim_company: {
      table: "dim_company",
      on: ["fact_invoices.company_key", "dim_company.company_key"],
    },
    dim_payment_terms: {
      table: "dim_payment_terms",
      on: ["fact_invoices.payment_term_key", "dim_payment_terms.payment_term_key"],
    },
    // The ledger date — what period reporting groups on.
    dim_date: {
      table: "dim_date",
      on: ["fact_invoices.posting_date_key", "dim_date.date_key"],
    },
    // Same dimension in its second role: the supplier's document date, aliased
    // so both can appear in one query without an ambiguous reference.
    dim_invoice_date: {
      table: "dim_date",
      on: ["fact_invoices.invoice_date_key", "dim_invoice_date.date_key"],
    },
  },
  columns: indexById([
    // Category
    column("category_l1_name", "Category L1", "category", "dim_material_category", "dim_material_category.category_l1_name", "dim_material_category", 13),
    column("category_l2_name", "Category L2", "category", "dim_material_category", "dim_material_category.category_l2_name", "dim_material_category", 75),
    column("material_group_id", "Material Group", "category", "dim_material_category", "dim_material_category.material_group_id", "dim_material_category", 75),
    // Plant / company
    column("plant_name", "Plant", "category", "dim_plant", "dim_plant.plant_name", "dim_plant", 7),
    column("plant_code", "Plant Code", "category", "dim_plant", "dim_plant.plant_code", "dim_plant", 7),
    column("region", "Region", "category", "dim_plant", "dim_plant.region", "dim_plant", 6),
    column("company_name", "Company", "category", "dim_company", "dim_company.company_name", "dim_company", 7),
    // Payment terms
    column("payment_term_code", "Payment Term", "category", "dim_payment_terms", "dim_payment_terms.term_code", "dim_payment_terms", 15),
    column("payment_term_description", "Payment Term Description", "category", "dim_payment_terms", "dim_payment_terms.term_description", "dim_payment_terms", 15),
    column("net_due_days", "Net Due Days", "number", "dim_payment_terms", "dim_payment_terms.net_due_days", "dim_payment_terms", 7),
    // Vendor
    column("vendor_name", "Vendor", "category", "dim_vendor", "dim_vendor.vendor_name", "dim_vendor", 800),
    column("vendor_id", "Vendor ID", "category", "dim_vendor", "dim_vendor.vendor_id", "dim_vendor", 800),
    column("parent_company_name", "Supplier Group", "category", "dim_vendor", "dim_vendor.parent_company_name", "dim_vendor", 33),
    column("vendor_country", "Vendor Country", "category", "dim_vendor", "dim_vendor.country", "dim_vendor", 9),
    // Dates, one per role
    column("posting_date", "Posting Date", "date", "dim_date", "dim_date.full_date", "dim_date", 1096),
    column("invoice_date", "Invoice Date", "date", "dim_invoice_date", "dim_invoice_date.full_date", "dim_invoice_date", 1096),
    // Degenerate dimensions
    column("currency_code", "Currency", "category", "fact_invoices", "fact_invoices.currency_code", undefined, 3),
    column("is_credit_memo", "Credit Memo", "category", "fact_invoices", "fact_invoices.is_credit_memo", undefined, 2),
    column("payment_block_flag", "Payment Blocked", "category", "fact_invoices", "fact_invoices.payment_block_flag", undefined, 2),
    column("fiscal_year", "Fiscal Year", "number", "fact_invoices", "fact_invoices.fiscal_year", undefined, 4),
    column("invoice_number", "Invoice Number", "category", "fact_invoices", "fact_invoices.invoice_number", undefined, 45000),
    column("po_number", "PO Number", "category", "fact_invoices", "fact_invoices.po_number", undefined, 38000),
    // Measures
    column("gross_amount_inr", "Gross Amount (INR)", "number", "fact_invoices", "fact_invoices.gross_amount_inr"),
    column("gross_amount_doc", "Gross Amount (Doc Currency)", "number", "fact_invoices", "fact_invoices.gross_amount_doc"),
    column("net_amount_inr", "Net Amount (INR)", "number", "fact_invoices", "fact_invoices.net_amount_inr"),
  ]),
};

// ---------------------------------------------------------------------------
// fact_payments — payment/DPO ledger, one row per accounting document
//
// New table, no db/schema.sql analog yet. Its vendor/category/plant/term
// joins target the SAME dim_vendor / dim_material_category / dim_plant /
// dim_payment_terms tables the two facts above use — just via each table's
// natural business key (vendor_id, material_group_id, plant_code, term_code)
// instead of its surrogate _key, since fact_payments carries no surrogate
// keys at all. Those natural keys already carry a UNIQUE constraint in
// db/schema.sql, so the join is valid SQL today even though fact_payments
// itself has no CREATE TABLE there yet — only actually querying this dataset
// in Azure SQL mode would surface that gap, as a clear SQL error, not a
// silent wrong answer.
// ---------------------------------------------------------------------------

const PAYMENTS: DatasetDefinition = {
  id: "fact_payments",
  name: "Vendor Payments",
  primaryTable: "fact_payments",
  // No surrogate date_key / dim_date join exists for this table (see note
  // below), so a timeGrain request with no explicit date dimension throws a
  // clear QueryValidationError rather than silently joining nothing. Passing
  // an explicit date dimension (invoice_date / baseline_date / clearing_date)
  // still works everywhere, including CSV mode's own month/quarter/fiscal-year
  // bucketing, which reads the raw cell value and never consults this key.
  defaultDateKey: "fact_payments.invoice_date",
  allowedJoins: {
    dim_vendor: {
      table: "dim_vendor",
      on: ["fact_payments.vendor_id", "dim_vendor.vendor_id"],
    },
    dim_category: {
      table: "dim_material_category",
      on: ["fact_payments.category_code", "dim_category.material_group_id"],
    },
    dim_plant: {
      table: "dim_plant",
      on: ["fact_payments.plant_code", "dim_plant.plant_code"],
    },
    dim_payment_terms: {
      table: "dim_payment_terms",
      on: ["fact_payments.payment_term_key", "dim_payment_terms.term_code"],
    },
  },
  columns: indexById([
    // Degenerate identity
    column("document_number", "Document Number", "category", "fact_payments", "fact_payments.document_number", undefined, 45000),
    column("document_type", "Document Type", "category", "fact_payments", "fact_payments.document_type", undefined, 3),
    column("company_code", "Company Code", "category", "fact_payments", "fact_payments.company_code", undefined, 7),
    column("fiscal_year", "Fiscal Year", "number", "fact_payments", "fact_payments.fiscal_year", undefined, 3),
    // Vendor
    column("vendor_id", "Vendor ID", "category", "fact_payments", "fact_payments.vendor_id", undefined, 800),
    column("vendor_name", "Vendor", "category", "dim_vendor", "dim_vendor.vendor_name", "dim_vendor", 800),
    column("parent_company_name", "Supplier Group", "category", "dim_vendor", "dim_vendor.parent_company_name", "dim_vendor", 33),
    // Category / plant
    column("category_code", "Category Code", "category", "fact_payments", "fact_payments.category_code", undefined, 75),
    column("category_l1_name", "Category L1", "category", "dim_category", "dim_category.category_l1_name", "dim_category", 13),
    column("category_l2_name", "Category L2", "category", "dim_category", "dim_category.category_l2_name", "dim_category", 75),
    column("plant_code", "Plant Code", "category", "fact_payments", "fact_payments.plant_code", undefined, 7),
    column("plant_name", "Plant", "category", "dim_plant", "dim_plant.plant_name", "dim_plant", 7),
    column("region", "Region", "category", "dim_plant", "dim_plant.region", "dim_plant", 6),
    // Payment terms
    column("payment_term_key", "Payment Term", "category", "fact_payments", "fact_payments.payment_term_key", undefined, 15),
    column("payment_term_description", "Payment Term Description", "category", "dim_payment_terms", "dim_payment_terms.term_description", "dim_payment_terms", 15),
    column("net_days", "Net Due Days", "number", "fact_payments", "fact_payments.net_days", undefined, 7),
    column("discount_days_1", "Discount Days (Tier 1)", "number", "fact_payments", "fact_payments.discount_days_1", undefined, 5),
    column("discount_percent_1", "Discount % (Tier 1)", "number", "fact_payments", "fact_payments.discount_percent_1", undefined, 5),
    // Dates
    column("invoice_date", "Invoice Date", "date", "fact_payments", "fact_payments.invoice_date", undefined, 1096),
    column("baseline_date", "Baseline Date", "date", "fact_payments", "fact_payments.baseline_date", undefined, 1096),
    column("clearing_date", "Clearing Date", "date", "fact_payments", "fact_payments.clearing_date", undefined, 1096),
    column("clearing_document", "Clearing Document", "category", "fact_payments", "fact_payments.clearing_document", undefined, 44530),
    // Status
    column("payment_status", "Payment Status", "category", "fact_payments", "fact_payments.payment_status", undefined, 6),
    // Measures
    column("actual_dpo", "Actual DPO (days)", "number", "fact_payments", "fact_payments.actual_dpo"),
    column("invoice_amount_inr", "Invoice Amount (INR)", "number", "fact_payments", "fact_payments.invoice_amount_inr"),
    column("discount_available_inr", "Discount Available (INR)", "number", "fact_payments", "fact_payments.discount_available_inr"),
    column("discount_captured_inr", "Discount Captured (INR)", "number", "fact_payments", "fact_payments.discount_captured_inr"),
    column("discount_missed_inr", "Discount Missed (INR)", "number", "fact_payments", "fact_payments.discount_missed_inr"),
  ]),
};

// ---------------------------------------------------------------------------
// agg_vendor_annual — pre-aggregated vendor × year spend, for Tail Spend.
// Fully denormalized already (vendor_name / parent_company_group are copied
// in at generation time), so it needs no join to be useful on its own; the
// dim_vendor join below only adds attributes agg_vendor_annual doesn't carry
// itself (country, account_group).
// ---------------------------------------------------------------------------

const AGG_VENDOR_ANNUAL: DatasetDefinition = {
  id: "agg_vendor_annual",
  name: "Vendor Annual Spend Summary",
  primaryTable: "agg_vendor_annual",
  // Grain is a calendar year, not a date — there is no finer date to bucket
  // by, so (as with fact_payments) a bare timeGrain request throws a clear
  // error instead of pretending month/quarter grouping is possible.
  defaultDateKey: "agg_vendor_annual.year",
  allowedJoins: {
    dim_vendor: {
      table: "dim_vendor",
      on: ["agg_vendor_annual.vendor_id", "dim_vendor.vendor_id"],
    },
  },
  columns: indexById([
    column("vendor_id", "Vendor ID", "category", "agg_vendor_annual", "agg_vendor_annual.vendor_id", undefined, 385),
    column("vendor_name", "Vendor", "category", "agg_vendor_annual", "agg_vendor_annual.vendor_name", undefined, 385),
    column("parent_company_group", "Supplier Group", "category", "agg_vendor_annual", "agg_vendor_annual.parent_company_group", undefined, 33),
    column("vendor_country", "Vendor Country", "category", "dim_vendor", "dim_vendor.country", "dim_vendor", 9),
    column("account_group", "Account Group", "category", "dim_vendor", "dim_vendor.account_group", "dim_vendor", 3),
    column("year", "Year", "category", "agg_vendor_annual", "agg_vendor_annual.year", undefined, 3),
    column("spend_rank", "Spend Rank", "number", "agg_vendor_annual", "agg_vendor_annual.spend_rank"),
    column("cumulative_spend_pct", "Cumulative Spend %", "number", "agg_vendor_annual", "agg_vendor_annual.cumulative_spend_pct"),
    column("is_tail", "Is Tail", "category", "agg_vendor_annual", "agg_vendor_annual.is_tail", undefined, 2),
    column("tail_tier", "Tail Tier", "category", "agg_vendor_annual", "agg_vendor_annual.tail_tier", undefined, 5),
    // Measures
    column("total_spend_inr", "Total Spend (INR)", "number", "agg_vendor_annual", "agg_vendor_annual.total_spend_inr"),
    column("po_count", "PO Count", "number", "agg_vendor_annual", "agg_vendor_annual.po_count"),
    column("avg_po_value_inr", "Avg PO Value (INR)", "number", "agg_vendor_annual", "agg_vendor_annual.avg_po_value_inr"),
    column("category_count", "Category Count", "number", "agg_vendor_annual", "agg_vendor_annual.category_count"),
    column("plant_count", "Plant Count", "number", "agg_vendor_annual", "agg_vendor_annual.plant_count"),
  ]),
};

// ---------------------------------------------------------------------------
// dim_contract — framework agreements. Exposed as its own queryable dataset
// (not just a join target) because no fact table carries a contract_number
// FK to hang it off — fact_po_items links to a contract only indirectly, by
// vendor + category + plant + date falling inside the contract's window.
// ---------------------------------------------------------------------------

const CONTRACTS: DatasetDefinition = {
  id: "dim_contract",
  name: "Vendor Contracts",
  primaryTable: "dim_contract",
  defaultDateKey: "dim_contract.start_date",
  allowedJoins: {
    dim_vendor: {
      table: "dim_vendor",
      on: ["dim_contract.vendor_id", "dim_vendor.vendor_id"],
    },
    dim_category: {
      table: "dim_material_category",
      on: ["dim_contract.category_code", "dim_category.material_group_id"],
    },
    dim_plant: {
      table: "dim_plant",
      on: ["dim_contract.plant_code", "dim_plant.plant_code"],
    },
  },
  columns: indexById([
    column("contract_number", "Contract Number", "category", "dim_contract", "dim_contract.contract_number", undefined, 200),
    column("vendor_id", "Vendor ID", "category", "dim_contract", "dim_contract.vendor_id", undefined, 175),
    column("vendor_name", "Vendor", "category", "dim_vendor", "dim_vendor.vendor_name", "dim_vendor", 175),
    column("category_code", "Category Code", "category", "dim_contract", "dim_contract.category_code", undefined, 75),
    column("category_l1_name", "Category L1", "category", "dim_category", "dim_category.category_l1_name", "dim_category", 13),
    column("category_l2_name", "Category L2", "category", "dim_category", "dim_category.category_l2_name", "dim_category", 75),
    column("plant_code", "Plant Code", "category", "dim_contract", "dim_contract.plant_code", undefined, 7),
    column("plant_name", "Plant", "category", "dim_plant", "dim_plant.plant_name", "dim_plant", 7),
    column("region", "Region", "category", "dim_plant", "dim_plant.region", "dim_plant", 6),
    column("start_date", "Start Date", "date", "dim_contract", "dim_contract.start_date", undefined, 200),
    column("end_date", "End Date", "date", "dim_contract", "dim_contract.end_date", undefined, 200),
    column("is_active", "Is Active", "category", "dim_contract", "dim_contract.is_active", undefined, 2),
    // Measure
    column("contract_value_inr", "Contract Value (INR)", "number", "dim_contract", "dim_contract.contract_value_inr"),
  ]),
};

// ---------------------------------------------------------------------------
// dim_material — material master. Same situation as dim_contract: nothing in
// fact_po_items/fact_invoices carries a material_number, so it is only
// reachable as its own dataset, joined to the category dimension.
// ---------------------------------------------------------------------------

const MATERIALS: DatasetDefinition = {
  id: "dim_material",
  name: "Materials",
  primaryTable: "dim_material",
  // Material master carries no date of any kind; see fact_payments' comment
  // for what that means for a bare timeGrain request.
  defaultDateKey: "dim_material.material_number",
  allowedJoins: {
    dim_category: {
      table: "dim_material_category",
      on: ["dim_material.category_code", "dim_category.material_group_id"],
    },
  },
  columns: indexById([
    column("material_number", "Material Number", "category", "dim_material", "dim_material.material_number", undefined, 2156),
    column("material_description", "Material Description", "category", "dim_material", "dim_material.material_description", undefined, 2156),
    column("material_type", "Material Type", "category", "dim_material", "dim_material.material_type", undefined, 4),
    column("category_code", "Category Code", "category", "dim_material", "dim_material.category_code", undefined, 75),
    column("category_l1_name", "Category L1", "category", "dim_category", "dim_category.category_l1_name", "dim_category", 13),
    column("category_l2_name", "Category L2", "category", "dim_category", "dim_category.category_l2_name", "dim_category", 75),
  ]),
};

// ---------------------------------------------------------------------------
// dim_payment_terms — payment term configuration, standalone. Also the join
// target named "dim_payment_terms" on fact_invoices and fact_payments above.
// ---------------------------------------------------------------------------

const PAYMENT_TERMS: DatasetDefinition = {
  id: "dim_payment_terms",
  name: "Payment Terms",
  primaryTable: "dim_payment_terms",
  defaultDateKey: "dim_payment_terms.payment_term_key",
  allowedJoins: {},
  columns: indexById([
    column("payment_term_key", "Payment Term", "category", "dim_payment_terms", "dim_payment_terms.term_code", undefined, 15),
    column("payment_term_description", "Description", "category", "dim_payment_terms", "dim_payment_terms.term_description", undefined, 15),
    column("net_days", "Net Due Days", "number", "dim_payment_terms", "dim_payment_terms.net_due_days"),
    column("discount_days_1", "Discount Days (Tier 1)", "number", "dim_payment_terms", "dim_payment_terms.discount_days_1"),
    column("discount_percent_1", "Discount % (Tier 1)", "number", "dim_payment_terms", "dim_payment_terms.discount_percent_1"),
    column("discount_days_2", "Discount Days (Tier 2)", "number", "dim_payment_terms", "dim_payment_terms.discount_days_2"),
    column("discount_percent_2", "Discount % (Tier 2)", "number", "dim_payment_terms", "dim_payment_terms.discount_percent_2"),
    column("is_discount_term", "Is Discount Term", "category", "dim_payment_terms", "dim_payment_terms.is_discount_term", undefined, 2),
  ]),
};

const DATASETS: Record<string, DatasetDefinition> = {
  [PO_ITEMS.id]: PO_ITEMS,
  [INVOICES.id]: INVOICES,
  [PAYMENTS.id]: PAYMENTS,
  [AGG_VENDOR_ANNUAL.id]: AGG_VENDOR_ANNUAL,
  [CONTRACTS.id]: CONTRACTS,
  [MATERIALS.id]: MATERIALS,
  [PAYMENT_TERMS.id]: PAYMENT_TERMS,
};

export function listDatasets(): DatasetDefinition[] {
  return Object.values(DATASETS);
}

export function getDataset(datasetId: string): DatasetDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(DATASETS, datasetId) ? DATASETS[datasetId] : undefined;
}

export function getColumn(
  dataset: DatasetDefinition,
  columnId: string
): ColumnDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(dataset.columns, columnId)
    ? dataset.columns[columnId]
    : undefined;
}

export function listColumns(dataset: DatasetDefinition): ColumnDefinition[] {
  return Object.values(dataset.columns);
}
