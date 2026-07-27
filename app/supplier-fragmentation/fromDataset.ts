// Rebuilds the supplier-fragmentation dashboard's data from an uploaded
// category-grain CSV (see scripts/convert-mock-to-csv.ts for the reference
// shape). The category concentration table and the KPIs summing over it
// derive from the rows; the remaining widgets (size buckets, top suppliers,
// onboarding trend, duplicate pairs) need grains the CSV doesn't carry, so
// they keep their static mock values (per-widget fallback).

import type { Dataset } from "@/context/DatasetsContext";
import { cellNumber, cellString, findColumn } from "@/lib/dataset-rows";
import { supplierMock, type CategoryConcentration, type SupplierFragmentationData } from "./supplierMock";

/**
 * Map an uploaded dataset into the full SupplierFragmentationData shape, or
 * null when the dataset has no recognizable category/supplier-count columns
 * (caller then falls back to the static mock wholesale).
 */
export function buildSupplierFragmentationFromDataset(dataset: Dataset): SupplierFragmentationData | null {
  const cols = {
    category: findColumn(dataset, ["category", "categoryName", "category_name", "category_l1"]),
    supplierCount: findColumn(dataset, ["supplierCount", "supplier_count", "suppliers"]),
    top3ConcentrationPercent: findColumn(dataset, [
      "top3ConcentrationPercent",
      "top3_concentration_percent",
      "top3Concentration",
      "concentrationPercent",
    ]),
    singleUseSuppliers: findColumn(dataset, [
      "singleUseSuppliers",
      "single_use_suppliers",
      "singleUseSupplierCount",
    ]),
    spendCr: findColumn(dataset, ["spendCr", "spend_cr", "spend", "totalSpend", "amount", "value"]),
  };

  if (!cols.category || !cols.supplierCount) return null;

  const categories: CategoryConcentration[] = [];
  for (const row of dataset.rows) {
    const category = cellString(row, cols.category);
    const supplierCount = cellNumber(row, cols.supplierCount);
    if (!category || supplierCount === null) continue;
    categories.push({
      category,
      supplierCount,
      top3ConcentrationPercent: cellNumber(row, cols.top3ConcentrationPercent) ?? 0,
      singleUseSuppliers: cellNumber(row, cols.singleUseSuppliers) ?? 0,
      spendCr: cellNumber(row, cols.spendCr) ?? 0,
    });
  }
  if (categories.length === 0) return null;

  const totalActiveSuppliers = categories.reduce((s, c) => s + c.supplierCount, 0);
  const singleUseSupplierCount = categories.reduce((s, c) => s + c.singleUseSuppliers, 0);
  const avgSuppliersPerCategory = Math.round(totalActiveSuppliers / categories.length);

  return {
    ...supplierMock,
    categories,
    totalActiveSuppliers,
    singleUseSupplierCount,
    avgSuppliersPerCategory,
  };
}
