// Maps an uploaded invoice-grain CSV into the typed Invoice[] this
// dashboard's selectors operate on. Every widget, KPI, and filter option
// list derives from the invoice list, so a usable upload makes the whole
// page dataset-driven.

import type { Dataset } from "@/context/DatasetsContext";
import { cellNumber, cellString, findColumn } from "@/lib/dataset-rows";
import type { Invoice } from "./types";

/** Normalize to "YYYY-MM-DD" (window logic slices "YYYY-MM"); null if unparseable. */
function toIsoDate(raw: string): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/**
 * Map an uploaded dataset into Invoice[], or null when the dataset has no
 * recognizable invoice date/amount columns (caller then falls back to the
 * static mock invoices wholesale).
 */
export function buildInvoicesFromDataset(dataset: Dataset): Invoice[] | null {
  const cols = {
    invoiceId: findColumn(dataset, ["invoice_id", "invoiceId", "invoice_number", "invoiceNumber", "id"]),
    invoiceDate: findColumn(dataset, ["invoice_date", "invoiceDate", "date"]),
    amount: findColumn(dataset, ["amount", "invoice_value_inr", "invoiceValue", "value", "spend", "total"]),
    currency: findColumn(dataset, ["currency"]),
    supplierId: findColumn(dataset, ["supplier_id", "supplierId", "vendor_id", "vendorId"]),
    supplierName: findColumn(dataset, ["supplier_name", "supplierName", "vendor_name", "vendorName", "supplier"]),
    globalUltimateId: findColumn(dataset, ["global_ultimate_id", "globalUltimateId", "parent_id"]),
    globalUltimateName: findColumn(dataset, ["global_ultimate_name", "globalUltimateName", "parent_company_group", "parent_name"]),
    categoryCode: findColumn(dataset, ["category_code", "categoryCode"]),
    categoryName: findColumn(dataset, ["category_name", "categoryName", "category"]),
    segmentCode: findColumn(dataset, ["segment_code", "segmentCode"]),
    segmentName: findColumn(dataset, ["segment_name", "segmentName", "segment"]),
    plantId: findColumn(dataset, ["plant_id", "plantId", "plant_code", "plantCode"]),
    plantName: findColumn(dataset, ["plant_name", "plantName", "plant", "site"]),
    region: findColumn(dataset, ["region"]),
    country: findColumn(dataset, ["country"]),
    sourceSystemId: findColumn(dataset, ["source_system_id", "sourceSystemId", "source_system", "sourceSystem"]),
    productId: findColumn(dataset, ["product_id", "productId", "material_number", "materialNumber"]),
    productName: findColumn(dataset, ["product_name", "productName", "material_description", "materialDescription", "product"]),
    costCenterId: findColumn(dataset, ["cost_center_id", "costCenterId", "cost_center_code"]),
    costCenterName: findColumn(dataset, ["cost_center_name", "costCenterName", "cost_center", "costCenter"]),
  };

  if (!cols.invoiceDate || !cols.amount) return null;

  const invoices: Invoice[] = [];
  for (let i = 0; i < dataset.rows.length; i++) {
    const row = dataset.rows[i];
    const invoiceDate = toIsoDate(cellString(row, cols.invoiceDate));
    const amount = cellNumber(row, cols.amount);
    if (invoiceDate === null || amount === null) continue;

    const supplierId = cellString(row, cols.supplierId);
    const supplierName = cellString(row, cols.supplierName);
    const globalUltimateId = cellString(row, cols.globalUltimateId);
    const globalUltimateName = cellString(row, cols.globalUltimateName);
    const categoryCode = cellString(row, cols.categoryCode);
    const categoryName = cellString(row, cols.categoryName);
    const productId = cellString(row, cols.productId);
    const productName = cellString(row, cols.productName);
    const costCenterId = cellString(row, cols.costCenterId);
    const costCenterName = cellString(row, cols.costCenterName);

    invoices.push({
      invoice_id: cellString(row, cols.invoiceId) || `ROW-${i + 1}`,
      invoice_date: invoiceDate,
      amount,
      currency: cellString(row, cols.currency) || "USD",
      supplier_id: supplierId || supplierName || "UNKNOWN",
      supplier_name: supplierName || supplierId || "Unknown Supplier",
      global_ultimate_id: globalUltimateId || globalUltimateName || supplierId || supplierName || "UNKNOWN",
      global_ultimate_name: globalUltimateName || globalUltimateId || supplierName || supplierId || "Unknown Supplier",
      category_code: categoryCode || categoryName || "UNKNOWN",
      category_name: categoryName || categoryCode || "Unknown Category",
      segment_code: cellString(row, cols.segmentCode) || "UNKNOWN",
      segment_name: cellString(row, cols.segmentName) || "Unknown Segment",
      plant_id: cellString(row, cols.plantId) || "UNKNOWN",
      plant_name: cellString(row, cols.plantName) || cellString(row, cols.plantId) || "Unknown Plant",
      region: cellString(row, cols.region) || "Unknown",
      country: cellString(row, cols.country) || "Unknown",
      source_system_id: cellString(row, cols.sourceSystemId) || "UNKNOWN",
      product_id: productId || productName || "UNKNOWN",
      product_name: productName || productId || "Unknown Product",
      cost_center_id: costCenterId || costCenterName || "UNKNOWN",
      cost_center_name: costCenterName || costCenterId || "Unknown Cost Center",
    });
  }

  return invoices.length > 0 ? invoices : null;
}
