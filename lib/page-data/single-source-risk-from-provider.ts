// Single Source Risk from the warehouse's fact_po_items rows.
//
// Same reasoning as payment-terms-from-provider.ts: this page's model
// (selectors.ts) filters a flat Invoice[] per PO line — ~50,000 rows — which
// queryWidgetData()'s 1,000-row cap and IDataProvider.getDatasets() (which
// always reports rows: [] for a server-backed dataset — see
// AzureSqlAdapter.getDatasets()) both have no way to return. This instead
// fetches app/single-source-risk/api/master/route.ts, a dedicated endpoint
// that reads the same sample dataset server-side and ships every row, the
// same fix Supplier Fragmentation's and Payment Terms' master routes apply to
// the identical problem.
//
// Real gap, disclosed rather than papered over: this dashboard's Invoice
// shape carries a product dimension and cost_center_id/cost_center_name, and
// fact_po_items has no material_number FK for either (dim_material only
// relates to a category, not a PO line) — there is no cost-center dimension
// at all. The "Products" widget instead reads category_l2 (75 real
// subcategories, e.g. Bearings, Conveyor Components) via product_id/
// product_name — the finest product-like grain fact_po_items actually
// carries, per the data dictionary. Cost center has no such fallback, so it
// keeps one clearly-labeled sentinel. Category, supplier, plant, and
// global-ultimate concentration — this dashboard's actual subject — are all
// real fact_po_items data.
import type { CategoryDim, Invoice, SourceSystemDim } from "@/app/single-source-risk/types";
import type { DatasetRow } from "@/types/dataset";

const COST_CENTER_NOT_TRACKED = "Not tracked (no cost-center dimension in the warehouse)";

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s === "" ? fallback : s;
}

function textOrNull(value: unknown): string | null {
  const s = text(value);
  return s === "" ? null : s;
}

export interface SingleSourceRiskProviderResult {
  invoices: Invoice[];
  categoryDims: CategoryDim[];
  sourceSystemDims: SourceSystemDim[];
}

export async function loadSingleSourceRiskFromProvider(): Promise<SingleSourceRiskProviderResult | null> {
  const response = await fetch("/single-source-risk/api/master");
  if (!response.ok) throw new Error(`/single-source-risk/api/master responded ${response.status}`);
  const { rows } = (await response.json()) as { rows: DatasetRow[] };
  if (rows.length === 0) return null;

  const categoryDims = new Map<string, CategoryDim>();
  const sourceSystemDims = new Map<string, SourceSystemDim>();

  const invoices: Invoice[] = rows.map((row) => {
    const categoryCode = text(row.material_group_id);
    const categoryName = text(row.category_l2_name, categoryCode);
    // dim_category has only L1/L2 — L1 doubles as this dashboard's "segment".
    const segmentCode = text(row.category_l1_name);
    const globalUltimate = textOrNull(row.parent_company_name);
    const supplierId = text(row.vendor_id);
    const supplierName = text(row.vendor_name, supplierId);
    // Vedanta's SAP landscape is one instance per business unit; company_code
    // is the closest real proxy fact_po_items carries for "source system".
    const companyCode = text(row.company_code);

    if (categoryCode && !categoryDims.has(categoryCode)) {
      categoryDims.set(categoryCode, {
        code: categoryCode,
        name: categoryName,
        segment_code: segmentCode,
        segment_name: segmentCode,
        level: 2,
      });
    }
    if (companyCode && !sourceSystemDims.has(companyCode)) {
      sourceSystemDims.set(companyCode, { id: companyCode, name: `SAP — ${companyCode}` });
    }

    return {
      invoice_id: `${text(row.po_number)}-${text(row.po_item)}`,
      invoice_date: text(row.po_date),
      amount: Number(row.net_order_value_inr) || 0,
      currency: text(row.currency_code, "INR"),
      supplier_id: supplierId,
      supplier_name: supplierName,
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
      // No material_number FK on fact_po_items — category_l2 is the finest
      // product-like grain available, so "Products" is a category view.
      product_id: categoryCode,
      product_name: categoryName,
      cost_center_id: "",
      cost_center_name: COST_CENTER_NOT_TRACKED,
    };
  });

  return {
    invoices,
    categoryDims: [...categoryDims.values()],
    sourceSystemDims: [...sourceSystemDims.values()],
  };
}
