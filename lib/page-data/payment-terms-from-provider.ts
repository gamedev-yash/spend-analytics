// Payment Terms from the warehouse's fact_payments rows.
//
// Every other core-dashboard loader in this directory issues grouped
// queryWidgetData() calls, because their pages work off supplier/category/
// month aggregates. Payment Terms is different: its entire client-side model
// (selectors.ts) filters and re-aggregates a flat Invoice[] per invoice — date
// range, category, global ultimate, source system, payment term, all cut
// across ~45,000 individual records. queryWidgetData()'s grouped-query shape
// caps at MAX_ROWS (1,000) with no pagination, and IDataProvider.getDatasets()
// always reports rows: [] for a server-backed dataset (AzureSqlAdapter forces
// this — see its getDatasets()), so neither route can return that many
// individual rows.
//
// Instead this fetches app/payment-terms/api/master/route.ts, a dedicated
// endpoint that reads the same sample dataset server-side and ships every row
// — the same fix Supplier Fragmentation's own master route already applies
// to the identical problem. Requesting that route is what "provider" means
// here even though no IDataProvider is actually involved; page.tsx still
// gates the fetch on providerType and runs it through useProviderPageData for
// consistency with the other core dashboards.

import type {
  CategoryDim,
  Invoice,
  PaymentTermDim,
  SourceSystemDim,
} from "@/app/payment-terms/types";
import type { DatasetRow } from "@/types/dataset";

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s === "" ? fallback : s;
}

function textOrNull(value: unknown): string | null {
  const s = text(value);
  return s === "" ? null : s;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface PaymentTermsProviderResult {
  invoices: Invoice[];
  paymentTermDims: PaymentTermDim[];
  categoryDims: CategoryDim[];
  sourceSystemDims: SourceSystemDim[];
}

export async function loadPaymentTermsFromProvider(): Promise<PaymentTermsProviderResult | null> {
  const response = await fetch("/payment-terms/api/master");
  if (!response.ok) throw new Error(`/payment-terms/api/master responded ${response.status}`);
  const { rows } = (await response.json()) as { rows: DatasetRow[] };
  if (rows.length === 0) return null;

  const paymentTermDims = new Map<string, PaymentTermDim>();
  const categoryDims = new Map<string, CategoryDim>();
  const sourceSystemDims = new Map<string, SourceSystemDim>();

  const invoices: Invoice[] = rows.map((row) => {
    const categoryCode = textOrNull(row.category_code);
    // dim_category has only two levels (L1/L2) — L1 doubles as this
    // dashboard's "segment" (a level above category), L2 is the category.
    const categoryName = textOrNull(row.category_l2_name);
    const segmentCode = textOrNull(row.category_l1_name);
    const termCode = textOrNull(row.payment_term_key);
    const companyCode = text(row.company_code);
    const clearingDate = textOrNull(row.clearing_date);
    const globalUltimate = textOrNull(row.parent_company_name);
    const supplierId = text(row.vendor_id);
    const supplierName = text(row.vendor_name, supplierId);
    const netDays = numOrNull(row.net_days);
    const discountPercent = numOrNull(row.discount_percent_1);

    if (categoryCode) {
      categoryDims.set(categoryCode, {
        code: categoryCode,
        name: categoryName ?? categoryCode,
        segment_code: segmentCode ?? "",
        segment_name: segmentCode ?? "",
        level: 2,
      });
    }
    if (termCode) {
      paymentTermDims.set(termCode, {
        code: termCode,
        name: text(row.payment_term_description, termCode),
        nominal_days: netDays ?? 0,
        discount_pct: discountPercent ?? 0,
        discount_days: numOrNull(row.discount_days_1) ?? 0,
        kind: discountPercent && discountPercent > 0 ? "discount" : netDays === 0 ? "immediate" : "standard",
      });
    }
    // Vedanta's SAP landscape is one instance per business unit; company_code
    // is the closest real proxy fact_payments carries for "source system".
    if (!sourceSystemDims.has(companyCode)) {
      sourceSystemDims.set(companyCode, { id: companyCode, name: `SAP — ${companyCode}` });
    }

    return {
      invoice_id: text(row.document_number),
      invoice_date: text(row.invoice_date),
      paid_date: clearingDate,
      paid_days: numOrNull(row.actual_dpo),
      // clearing_date is populated exactly when a payment has actually
      // cleared (data dictionary: "NULL if unpaid/open") — a direct signal,
      // not one derived from the payment_status label.
      is_paid: clearingDate !== null,
      amount: Number(row.invoice_amount_inr) || 0,
      currency: "INR",
      supplier_id: supplierId,
      supplier_name: supplierName,
      // parent_company_group (KONZS) is this warehouse's global-ultimate
      // concept; a vendor with no group is its own ultimate.
      global_ultimate_id: globalUltimate ?? supplierId,
      global_ultimate_name: globalUltimate ?? supplierName,
      category_code: categoryCode,
      category_name: categoryName,
      segment_code: segmentCode,
      segment_name: segmentCode,
      plant_id: text(row.plant_code),
      plant_name: text(row.plant_name),
      region: text(row.region),
      country: "IN",
      source_system_id: companyCode,
      payment_term_code: termCode,
      payment_term_name: termCode ? text(row.payment_term_description, termCode) : null,
      nominal_days: netDays,
    };
  });

  return {
    invoices,
    paymentTermDims: [...paymentTermDims.values()],
    categoryDims: [...categoryDims.values()],
    sourceSystemDims: [...sourceSystemDims.values()],
  };
}
