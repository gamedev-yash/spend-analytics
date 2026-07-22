import invoicesRaw from "@/payment-terms-mock/data/invoices.json";
import paymentTermsRaw from "@/payment-terms-mock/data/payment_terms.json";
import categoriesRaw from "@/payment-terms-mock/data/categories.json";
import sourceSystemsRaw from "@/payment-terms-mock/data/source_systems.json";
import type { Invoice, PaymentTermDim, CategoryDim, SourceSystemDim } from "./types";

/**
 * Single source of truth for this dashboard's data. Imported directly from
 * payment-terms-mock/data/ (the generator's own output directory) rather than
 * copied — generate_data.py writes there, so a copy would just drift.
 */
export const invoices = invoicesRaw as Invoice[];
export const paymentTermDims = paymentTermsRaw as PaymentTermDim[];
export const categoryDims = categoriesRaw as CategoryDim[];
export const sourceSystemDims = sourceSystemsRaw as SourceSystemDim[];
