import invoicesRaw from "@/single-source-risk-mock/data/invoices.json";
import categoriesRaw from "@/single-source-risk-mock/data/categories.json";
import sourceSystemsRaw from "@/single-source-risk-mock/data/source_systems.json";
import type { Invoice, CategoryDim, SourceSystemDim } from "./types";

/**
 * Single source of truth for this dashboard's data. Imported directly from
 * single-source-risk-mock/data/ (the generator's own output directory)
 * rather than copied — generate_data.py writes there, so a copy would drift.
 */
export const invoices = invoicesRaw as Invoice[];
export const categoryDims = categoriesRaw as CategoryDim[];
export const sourceSystemDims = sourceSystemsRaw as SourceSystemDim[];
