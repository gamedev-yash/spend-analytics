import "server-only";

// The Data Provider for the core dashboards' AI assistant: one or more named
// row tables per dashboard, built from the same warehouse sample dataset
// every other core-dashboard provider loader reads (lib/server/
// sample-data-source.ts) — never a separate copy. lib/ai/dashboard-query.ts
// runs structured queries against these tables via lib/ai/query-engine.ts;
// nothing above this file knows whether a row array came from bundled JSON,
// a CSV, or a warehouse query — swapping the source only means changing the
// bodies below, not the query engine or the route.
//
// Previously these tables were bespoke, pre-aggregated mock shapes (one for
// tail-spend's Pareto deciles, another for supplier-fragmentation's category
// concentration, ...), each hand-built from a different mock generator. They
// now expose the underlying warehouse tables directly instead — the same
// fact_po_items/fact_invoices/fact_payments/agg_vendor_annual/dim_contract
// rows the dashboards themselves render from — and let the model's own
// groupBy/aggregate query do whatever slicing a question needs, the same way
// query_warehouse used to. That is both simpler (one real source of truth,
// not five hand-rolled ones) and more capable (any grouping the data
// supports, not just the specific breakdowns a mock happened to precompute).

import { getSampleDataset } from "@/lib/server/sample-data-source";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";
import type { Row } from "@/lib/ai/query-engine";

export interface DashboardTable {
  id: string;
  label: string;
  /** One line of guidance shown to the model alongside the column list. */
  description: string;
  rows: Row[];
}

/** A registry dataset's rows, already keyed by its own column ids — no remapping needed. */
function rowsOf(datasetId: string): Row[] {
  return getSampleDataset(datasetId)?.rows ?? [];
}

const PO_ITEMS: DashboardTable = {
  id: "fact_po_items",
  label: "Purchase order line items",
  description:
    "One row per PO line — committed spend. is_contract_backed=0 means off-contract (unmanaged) spend.",
  rows: rowsOf("fact_po_items"),
};

const INVOICES: DashboardTable = {
  id: "fact_invoices",
  label: "Supplier invoice line items",
  description: "One row per invoice line — actual spend. A blank po_number means off-PO (\"maverick\") spend.",
  rows: rowsOf("fact_invoices"),
};

const PAYMENTS: DashboardTable = {
  id: "fact_payments",
  label: "Payment / DPO ledger",
  description:
    "One row per accounting document. actual_dpo, payment_status, and the discount_*_inr trio are precomputed — never re-derive them from dates yourself.",
  rows: rowsOf("fact_payments"),
};

const AGG_VENDOR_ANNUAL: DashboardTable = {
  id: "agg_vendor_annual",
  label: "Pre-aggregated vendor × year spend",
  description:
    "One row per vendor per year, with the Pareto/tail-spend math already computed: spend_rank, cumulative_spend_pct, is_tail, tail_tier. Use this instead of re-deriving concentration from fact_po_items.",
  rows: rowsOf("agg_vendor_annual"),
};

const CONTRACTS: DashboardTable = {
  id: "dim_contract",
  label: "Vendor framework contracts",
  description: "One row per contract: contract_value_inr, is_active, start_date/end_date, by vendor/category/plant.",
  rows: rowsOf("dim_contract"),
};

const DASHBOARD_TABLES: Record<DashboardKey, DashboardTable[]> = {
  "spend-overview": [PO_ITEMS, INVOICES],
  compliance: [PO_ITEMS, INVOICES],
  "payment-terms": [PAYMENTS],
  "tail-spend": [PO_ITEMS, AGG_VENDOR_ANNUAL],
  "supplier-fragmentation": [PO_ITEMS, CONTRACTS],
  "single-source-risk": [PO_ITEMS],
};

export function getDashboardTables(key: DashboardKey): DashboardTable[] {
  return DASHBOARD_TABLES[key];
}
