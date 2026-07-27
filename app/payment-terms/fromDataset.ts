// Maps an uploaded invoice-grain CSV (see scripts/convert-mock-to-csv.ts for
// the reference shape) into the typed Invoice[] this dashboard's selectors
// operate on. Every widget, KPI, and filter option list derives from the
// invoice list, so a usable upload makes the whole page dataset-driven.

import type { Dataset, DatasetRow } from "@/context/DatasetsContext";
import { cellBoolean, cellNumber, cellString, findColumn } from "@/lib/dataset-rows";
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

function nullableString(row: DatasetRow, column: string | null): string | null {
  const s = cellString(row, column);
  return s === "" ? null : s;
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
    paidDate: findColumn(dataset, ["paid_date", "paidDate"]),
    paidDays: findColumn(dataset, ["paid_days", "paidDays", "days_to_pay"]),
    isPaid: findColumn(dataset, ["is_paid", "isPaid", "paid"]),
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
    paymentTermCode: findColumn(dataset, ["payment_term_code", "paymentTermCode", "payment_term", "paymentTerm"]),
    paymentTermName: findColumn(dataset, ["payment_term_name", "paymentTermName"]),
    nominalDays: findColumn(dataset, ["nominal_days", "nominalDays", "net_days"]),
  };

  if (!cols.invoiceDate || !cols.amount) return null;

  const invoices: Invoice[] = [];
  for (let i = 0; i < dataset.rows.length; i++) {
    const row = dataset.rows[i];
    const invoiceDate = toIsoDate(cellString(row, cols.invoiceDate));
    const amount = cellNumber(row, cols.amount);
    if (invoiceDate === null || amount === null) continue;

    const paidDate = toIsoDate(cellString(row, cols.paidDate));
    const paidDays = cellNumber(row, cols.paidDays);
    const isPaid = cellBoolean(row, cols.isPaid) ?? (paidDate !== null || paidDays !== null);

    const supplierId = cellString(row, cols.supplierId);
    const supplierName = cellString(row, cols.supplierName);
    const globalUltimateId = cellString(row, cols.globalUltimateId);
    const globalUltimateName = cellString(row, cols.globalUltimateName);

    invoices.push({
      invoice_id: cellString(row, cols.invoiceId) || `ROW-${i + 1}`,
      invoice_date: invoiceDate,
      paid_date: isPaid ? paidDate : null,
      paid_days: isPaid ? paidDays : null,
      is_paid: isPaid,
      amount,
      currency: cellString(row, cols.currency) || "INR",
      supplier_id: supplierId || supplierName || "UNKNOWN",
      supplier_name: supplierName || supplierId || "Unknown Supplier",
      global_ultimate_id: globalUltimateId || globalUltimateName || supplierId || supplierName || "UNKNOWN",
      global_ultimate_name: globalUltimateName || globalUltimateId || supplierName || supplierId || "Unknown Supplier",
      category_code: nullableString(row, cols.categoryCode),
      category_name: nullableString(row, cols.categoryName),
      segment_code: nullableString(row, cols.segmentCode),
      segment_name: nullableString(row, cols.segmentName),
      plant_id: cellString(row, cols.plantId) || "UNKNOWN",
      plant_name: cellString(row, cols.plantName) || cellString(row, cols.plantId) || "Unknown Plant",
      region: cellString(row, cols.region) || "Unknown",
      country: cellString(row, cols.country) || "Unknown",
      source_system_id: cellString(row, cols.sourceSystemId) || "UNKNOWN",
      payment_term_code: nullableString(row, cols.paymentTermCode),
      payment_term_name: nullableString(row, cols.paymentTermName),
      nominal_days: cellNumber(row, cols.nominalDays),
    });
  }

  return invoices.length > 0 ? invoices : null;
}
