// Supplier-fragmentation metrics from provider aggregates.
//
// "Single-use suppliers" is a count of counts — suppliers with exactly one PO in
// a category — which no single GROUP BY yields. Rather than pull every
// (category, supplier) pair and risk the row cap, this groups by supplier within
// each category: one bounded query per category, whose ~160 rows also give the
// top-3 concentration share for free.

import {
  supplierMock,
  type CategoryConcentration,
  type SupplierFragmentationData,
} from "@/app/supplier-fragmentation/supplierMock";
import {
  PO_ITEMS_DATASET,
  ROWS,
  SUPPLIERS,
  VALUE,
  createRunner,
  grouped,
  percent,
  toLabel,
  toNumber,
  type QueryRunner,
} from "@/lib/page-data/provider-queries";
import { COUNT_ALL, type IDataProvider } from "@/types/data-provider";

/** Categories detailed per page load — the table shows far fewer than this. */
const CATEGORY_LIMIT = 20;

const CRORE = 10_000_000;

async function loadCategoryDetail(
  runner: QueryRunner,
  category: string
): Promise<Omit<CategoryConcentration, "category">> {
  const rows = await runner.run(
    grouped({
      datasetId: PO_ITEMS_DATASET,
      dimensions: ["vendor_name"],
      measures: { [VALUE]: ["net_order_value_inr", "sum"], [ROWS]: [COUNT_ALL, "count"] },
      filters: [{ field: "category_l1_name", operator: "eq", value: category }],
      sortBy: VALUE,
      limit: 1000,
    })
  );

  const spend = rows.reduce((sum, row) => sum + toNumber(row[VALUE]), 0);
  const top3 = rows.slice(0, 3).reduce((sum, row) => sum + toNumber(row[VALUE]), 0);
  const singleUse = rows.filter((row) => toNumber(row[ROWS]) === 1).length;

  return {
    supplierCount: rows.length,
    top3ConcentrationPercent: Math.round(percent(top3, spend)),
    singleUseSuppliers: singleUse,
    spendCr: Math.round((spend / CRORE) * 10) / 10,
  };
}

/**
 * Load the supplier-fragmentation page from a warehouse dataset, or null when
 * the dataset yields no categories (caller falls back to the static mock).
 *
 * Widgets needing grains the star schema does not carry — size buckets,
 * onboarding trend, duplicate-name pairs — keep their mock values, the same
 * per-widget fallback the CSV adapter uses.
 */
export async function loadSupplierFragmentationFromProvider(
  provider: IDataProvider
): Promise<SupplierFragmentationData | null> {
  const runner = createRunner(provider);

  const categoryRows = await runner.run(
    grouped({
      datasetId: PO_ITEMS_DATASET,
      dimensions: ["category_l1_name"],
      measures: {
        [VALUE]: ["net_order_value_inr", "sum"],
        [SUPPLIERS]: ["vendor_id", "distinct"],
      },
      sortBy: VALUE,
      limit: CATEGORY_LIMIT,
    })
  );
  if (categoryRows.length === 0) return null;

  const names = categoryRows.map((row) => toLabel(row.category_l1_name));
  const details = await Promise.all(names.map((name) => loadCategoryDetail(runner, name)));

  const categories: CategoryConcentration[] = names.map((category, index) => ({
    category,
    ...details[index],
  }));

  const totalActiveSuppliers = categories.reduce((sum, c) => sum + c.supplierCount, 0);
  const singleUseSupplierCount = categories.reduce((sum, c) => sum + c.singleUseSuppliers, 0);

  return {
    ...supplierMock,
    categories,
    totalActiveSuppliers,
    singleUseSupplierCount,
    avgSuppliersPerCategory: Math.round(totalActiveSuppliers / categories.length),
  };
}
