import "server-only";

// The Data Provider for the 5 core dashboards' AI assistant: one or more named
// row tables per dashboard, built from the same underlying data each dashboard
// page itself renders from (never a separate copy). lib/ai/dashboard-query.ts
// runs structured queries against these tables via lib/ai/query-engine.ts;
// nothing above this file knows whether a row array came from bundled JSON, a
// CSV, or (once real SAP data lands) a warehouse query — swapping the source
// only means changing the bodies below, not the query engine or the route.

import { poItems, invoices as sapInvoices, vendorById, categoryByCode, plantByCode } from "@/lib/sap/raw-data";
import { invoices as paymentTermsInvoices } from "@/app/payment-terms/data";
import { tailSpendMock } from "@/app/tail-spend/tailSpendMock";
import { supplierMock } from "@/app/supplier-fragmentation/supplierMock";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";
import type { Row } from "@/lib/ai/query-engine";

export interface DashboardTable {
  id: string;
  label: string;
  /** One line of guidance shown to the model alongside the column list. */
  description: string;
  rows: Row[];
}

function asRows<T extends object>(list: readonly T[]): Row[] {
  return list as unknown as Row[];
}

// ---------------------------------------------------------------------------
// spend-overview & compliance share these two tables — both dashboards report
// on the exact same PO/invoice data, just sliced differently, and must agree.
// ---------------------------------------------------------------------------

const purchaseOrderRows: Row[] = poItems
  .filter((p) => !p.is_deleted)
  .map((p) => {
    const vendor = vendorById.get(p.vendor_id);
    const category = categoryByCode.get(p.category_code);
    const plant = plantByCode.get(p.plant_code);
    return {
      po_number: p.po_number,
      vendor_name: vendor?.vendor_name ?? p.vendor_id,
      parent_company_group: vendor?.parent_company_group ?? vendor?.vendor_name ?? p.vendor_id,
      category_l1: category?.category_l1 ?? "Other",
      category_l2: category?.category_l2 ?? "Other",
      plant_name: plant?.plant_name ?? p.plant_code,
      region: plant?.region ?? "Unknown",
      po_date: p.po_date,
      net_value_inr: p.net_value_inr,
      quantity: p.quantity,
      currency: p.currency,
      doc_type: p.doc_type,
      has_contract: p.contract_number !== null,
    };
  });

const invoiceRows: Row[] = sapInvoices.map((inv) => {
  const vendor = vendorById.get(inv.vendor_id);
  const category = categoryByCode.get(inv.category_code);
  const plant = plantByCode.get(inv.plant_code);
  return {
    invoice_number: inv.invoice_number,
    vendor_name: vendor?.vendor_name ?? inv.vendor_id,
    parent_company_group: vendor?.parent_company_group ?? vendor?.vendor_name ?? inv.vendor_id,
    category_l1: category?.category_l1 ?? "Other",
    category_l2: category?.category_l2 ?? "Other",
    plant_name: plant?.plant_name ?? inv.plant_code,
    region: plant?.region ?? "Unknown",
    invoice_date: inv.invoice_date,
    invoice_value_inr: inv.invoice_value_inr,
    has_po: inv.po_number !== null,
  };
});

const PURCHASE_ORDERS: DashboardTable = {
  id: "purchase_orders",
  label: "Purchase order line items",
  description: "One row per PO line. has_contract=false means off-contract (unmanaged) spend.",
  rows: purchaseOrderRows,
};

const INVOICES: DashboardTable = {
  id: "invoices",
  label: "Supplier invoice line items",
  description: "One row per invoice. has_po=false means off-PO (unmanaged) spend.",
  rows: invoiceRows,
};

// ---------------------------------------------------------------------------
// payment-terms
// ---------------------------------------------------------------------------

const PAYMENT_TERMS_INVOICES: DashboardTable = {
  id: "invoices",
  label: "Invoices with payment-term and paid-cycle detail",
  description: "One row per invoice, with actual paid_days measured against the nominal payment term.",
  rows: paymentTermsInvoices.map((inv) => ({
    invoice_id: inv.invoice_id,
    invoice_date: inv.invoice_date,
    paid_date: inv.paid_date,
    paid_days: inv.paid_days,
    is_paid: inv.is_paid,
    amount: inv.amount,
    currency: inv.currency,
    supplier_name: inv.supplier_name,
    global_ultimate_name: inv.global_ultimate_name,
    category_name: inv.category_name ?? "Uncategorized",
    segment_name: inv.segment_name ?? "Unsegmented",
    plant_name: inv.plant_name,
    region: inv.region,
    country: inv.country,
    payment_term_name: inv.payment_term_name ?? "Unspecified",
    nominal_days: inv.nominal_days,
  })),
};

// ---------------------------------------------------------------------------
// tail-spend
// ---------------------------------------------------------------------------

const TAIL_SPEND_TABLES: DashboardTable[] = [
  {
    id: "category_breakdown",
    label: "Spend by category, split into strategic/core/tail",
    description: "One row per procurement category.",
    rows: asRows(tailSpendMock.categoryBreakdown),
  },
  {
    id: "suppliers",
    label: "Supplier-level spend and segment",
    description: "One row per supplier, with its spend segment (Strategic/Core/Tail).",
    rows: asRows(tailSpendMock.supplierBubbles),
  },
  {
    id: "consolidation_candidates",
    label: "Suppliers ranked as consolidation candidates",
    description: "One row per candidate supplier, with potential savings and a recommended action.",
    rows: asRows(tailSpendMock.consolidationCandidates),
  },
  {
    id: "po_value_buckets",
    label: "PO value distribution buckets",
    description: "One row per PO value bucket (e.g. '< ₹5K'), across all purchase orders.",
    rows: asRows(tailSpendMock.poValueBuckets),
  },
  {
    id: "segment_comparison",
    label: "Strategic vs Core vs Tail segment comparison",
    description: "One row per spend segment.",
    rows: asRows(tailSpendMock.segmentComparison),
  },
  {
    id: "monthly_trend",
    label: "Monthly spend trend by segment",
    description: "One row per month.",
    rows: asRows(tailSpendMock.monthlyTrend),
  },
  {
    id: "pareto_deciles",
    label: "Supplier spend concentration by decile",
    description: "One row per supplier decile (Top 10%, 10-20%, ...).",
    rows: asRows(tailSpendMock.paretoDeciles),
  },
];

// ---------------------------------------------------------------------------
// supplier-fragmentation
// ---------------------------------------------------------------------------

const SUPPLIER_FRAGMENTATION_TABLES: DashboardTable[] = [
  {
    id: "categories",
    label: "Supplier concentration by category",
    description: "One row per category.",
    rows: asRows(supplierMock.categories),
  },
  {
    id: "size_buckets",
    label: "Suppliers grouped by spend size bucket",
    description: "One row per spend-size bucket.",
    rows: asRows(supplierMock.sizeBuckets),
  },
  {
    id: "top_suppliers",
    label: "Top suppliers by spend, with cumulative share",
    description: "One row per top supplier.",
    rows: asRows(supplierMock.topSuppliers),
  },
  {
    id: "monthly_onboarding",
    label: "New supplier onboarding by month",
    description: "One row per month.",
    rows: asRows(supplierMock.monthlyOnboarding),
  },
  {
    id: "duplicate_pairs",
    label: "Likely duplicate supplier records",
    description: "One row per candidate duplicate pair.",
    rows: asRows(supplierMock.duplicatePairs),
  },
];

// ---------------------------------------------------------------------------

const DASHBOARD_TABLES: Record<DashboardKey, DashboardTable[]> = {
  "spend-overview": [PURCHASE_ORDERS, INVOICES],
  compliance: [PURCHASE_ORDERS, INVOICES],
  "payment-terms": [PAYMENT_TERMS_INVOICES],
  "tail-spend": TAIL_SPEND_TABLES,
  "supplier-fragmentation": SUPPLIER_FRAGMENTATION_TABLES,
};

export function getDashboardTables(key: DashboardKey): DashboardTable[] {
  return DASHBOARD_TABLES[key];
}
