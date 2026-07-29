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
  /**
   * Rough distinct-value count, surfaced as ColumnMeta.distinctCount.
   *
   * Only ever drives UI affordances — which columns become filter dropdowns
   * (`filterableColumns`) and how widget suggestions rank (`lib/suggest`) — never
   * a query result, so an estimate that drifts is harmless. Declared rather than
   * measured because a live COUNT(DISTINCT) per column on every metadata load
   * would scan the fact table dozens of times.
   */
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
    column("category_l2_name", "Category L2", "category", "dim_material_category", "dim_material_category.category_l2_name", "dim_material_category", 65),
    column("material_group_id", "Material Group", "category", "dim_material_category", "dim_material_category.material_group_id", "dim_material_category", 65),
    // Plant / company
    column("plant_name", "Plant", "category", "dim_plant", "dim_plant.plant_name", "dim_plant", 7),
    column("plant_code", "Plant Code", "category", "dim_plant", "dim_plant.plant_code", "dim_plant", 7),
    column("company_name", "Company", "category", "dim_company", "dim_company.company_name", "dim_company", 7),
    column("company_code", "Company Code", "category", "dim_company", "dim_company.company_code", "dim_company", 7),
    // Vendor
    column("vendor_name", "Vendor", "category", "dim_vendor", "dim_vendor.vendor_name", "dim_vendor", 160),
    column("vendor_id", "Vendor ID", "category", "dim_vendor", "dim_vendor.vendor_id", "dim_vendor", 160),
    column("parent_company_name", "Supplier Group", "category", "dim_vendor", "dim_vendor.parent_company_name", "dim_vendor", 10),
    column("vendor_country", "Vendor Country", "category", "dim_vendor", "dim_vendor.country", "dim_vendor", 7),
    column("vendor_city", "Vendor City", "category", "dim_vendor", "dim_vendor.city", "dim_vendor", 26),
    // Date
    column("po_date", "PO Date", "date", "dim_date", "dim_date.full_date", "dim_date", 1035),
    // Degenerate dimensions
    column("currency_code", "Currency", "category", "fact_po_items", "fact_po_items.currency_code", undefined, 3),
    column("is_contract_backed", "Contract Backed", "category", "fact_po_items", "fact_po_items.is_contract_backed", undefined, 2),
    column("po_number", "PO Number", "category", "fact_po_items", "fact_po_items.po_number", undefined, 3316),
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
    column("category_l2_name", "Category L2", "category", "dim_material_category", "dim_material_category.category_l2_name", "dim_material_category", 65),
    column("material_group_id", "Material Group", "category", "dim_material_category", "dim_material_category.material_group_id", "dim_material_category", 65),
    // Plant / company
    column("plant_name", "Plant", "category", "dim_plant", "dim_plant.plant_name", "dim_plant", 7),
    column("plant_code", "Plant Code", "category", "dim_plant", "dim_plant.plant_code", "dim_plant", 7),
    column("company_name", "Company", "category", "dim_company", "dim_company.company_name", "dim_company", 7),
    // Payment terms
    column("payment_term_code", "Payment Term", "category", "dim_payment_terms", "dim_payment_terms.term_code", "dim_payment_terms", 51),
    column("payment_term_description", "Payment Term Description", "category", "dim_payment_terms", "dim_payment_terms.term_description", "dim_payment_terms", 51),
    column("net_due_days", "Net Due Days", "number", "dim_payment_terms", "dim_payment_terms.net_due_days", "dim_payment_terms", 28),
    // Vendor
    column("vendor_name", "Vendor", "category", "dim_vendor", "dim_vendor.vendor_name", "dim_vendor", 160),
    column("vendor_id", "Vendor ID", "category", "dim_vendor", "dim_vendor.vendor_id", "dim_vendor", 160),
    column("parent_company_name", "Supplier Group", "category", "dim_vendor", "dim_vendor.parent_company_name", "dim_vendor", 10),
    column("vendor_country", "Vendor Country", "category", "dim_vendor", "dim_vendor.country", "dim_vendor", 7),
    // Dates, one per role
    column("posting_date", "Posting Date", "date", "dim_date", "dim_date.full_date", "dim_date", 1081),
    column("invoice_date", "Invoice Date", "date", "dim_invoice_date", "dim_invoice_date.full_date", "dim_invoice_date", 1081),
    // Degenerate dimensions
    column("currency_code", "Currency", "category", "fact_invoices", "fact_invoices.currency_code", undefined, 3),
    column("is_credit_memo", "Credit Memo", "category", "fact_invoices", "fact_invoices.is_credit_memo", undefined, 2),
    column("payment_block_flag", "Payment Blocked", "category", "fact_invoices", "fact_invoices.payment_block_flag", undefined, 2),
    column("fiscal_year", "Fiscal Year", "number", "fact_invoices", "fact_invoices.fiscal_year", undefined, 4),
    column("invoice_number", "Invoice Number", "category", "fact_invoices", "fact_invoices.invoice_number", undefined, 8779),
    column("po_number", "PO Number", "category", "fact_invoices", "fact_invoices.po_number", undefined, 3068),
    // Measures
    column("gross_amount_inr", "Gross Amount (INR)", "number", "fact_invoices", "fact_invoices.gross_amount_inr"),
    column("gross_amount_doc", "Gross Amount (Doc Currency)", "number", "fact_invoices", "fact_invoices.gross_amount_doc"),
    column("net_amount_inr", "Net Amount (INR)", "number", "fact_invoices", "fact_invoices.net_amount_inr"),
  ]),
};

const DATASETS: Record<string, DatasetDefinition> = {
  [PO_ITEMS.id]: PO_ITEMS,
  [INVOICES.id]: INVOICES,
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
