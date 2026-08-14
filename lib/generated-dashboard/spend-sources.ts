// The platform spend tables offered by "Generate Custom Dashboard"'s
// Spend Analytics branch.
//
// Deliberately a curated subset, not `listDatasets()`: the metadata registry
// is a SQL allowlist (lib/server/metadata-registry.ts) and carries no
// product-facing copy, and two of the tables it exposes — dim_material and
// dim_payment_terms — are configuration lookups with nothing to trend or spend
// to total, so offering them here would only produce a dashboard with no story.
//
// Every `id` must exist in the registry: app/api/spend-datasets/route.ts
// resolves rows through getSampleDataset(id) and 400s on anything not listed
// here, so this file is the allowlist for that endpoint.

export interface SpendSource {
  /** metadata-registry dataset id. */
  id: string;
  label: string;
  description: string;
  /** Headline business fields, shown before any rows are fetched. */
  highlights: string[];
}

export const SPEND_SOURCES: SpendSource[] = [
  {
    id: "fact_po_items",
    label: "Purchase Orders",
    description:
      "One row per PO line — committed spend, quantities and contract coverage.",
    highlights: ["Supplier", "Category", "Plant", "PO Date", "Net Order Value", "Quantity"],
  },
  {
    id: "fact_invoices",
    label: "Supplier Invoices",
    description: "One row per invoice line — actual spend, by posting and invoice date.",
    highlights: ["Supplier", "Category", "Company", "Posting Date", "Gross Amount"],
  },
  {
    id: "fact_payments",
    label: "Vendor Payments",
    description: "Payment ledger with DPO, payment terms and early-payment discounts.",
    highlights: ["Supplier", "Payment Term", "Actual DPO", "Invoice Amount", "Discount Missed"],
  },
  {
    id: "agg_vendor_annual",
    label: "Vendor Annual Spend",
    description: "Pre-aggregated supplier × year spend, with tail tiers and PO counts.",
    highlights: ["Supplier", "Year", "Total Spend", "PO Count", "Tail Tier"],
  },
  {
    id: "dim_contract",
    label: "Vendor Contracts",
    description: "Framework agreements — value, coverage window and owning plant.",
    highlights: ["Contract", "Supplier", "Category", "Start / End Date", "Contract Value"],
  },
];

/** What the Spend Analytics branch opens on. */
export const DEFAULT_SPEND_SOURCE_ID = SPEND_SOURCES[0].id;

export function findSpendSource(id: string): SpendSource | undefined {
  return SPEND_SOURCES.find((source) => source.id === id);
}
