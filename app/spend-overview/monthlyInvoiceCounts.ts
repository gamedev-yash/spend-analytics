import "server-only";

import { invoices, categoryByCode } from "@/lib/sap/raw-data";
import type { SapFilters } from "@/lib/sap/types";

function matchesCategoryPath(categoryCode: string, categoryPath?: string): boolean {
  if (!categoryPath) return true;
  const cat = categoryByCode.get(categoryCode);
  if (!cat) return false;
  const [l1, l2] = categoryPath.split("|");
  if (l2) return cat.category_l1 === l1 && cat.category_l2 === l2;
  return cat.category_l1 === l1;
}

/**
 * Invoice counts per month ("YYYY-MM"), for the Spend Trend chart's invoice
 * line. Ignores the date-range filter on purpose — same as
 * getSpendTrendData, the trend view always shows its own fixed window —
 * but respects every other filter (plant/category/vendor/category path).
 */
export function getMonthlyInvoiceCounts(filters: SapFilters): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const inv of invoices) {
    if (filters.plants?.length && !filters.plants.includes(inv.plant_code)) continue;
    if (filters.categoriesL1?.length) {
      const cat = categoryByCode.get(inv.category_code);
      if (!cat || !filters.categoriesL1.includes(cat.category_l1)) continue;
    }
    if (filters.vendorId && inv.vendor_id !== filters.vendorId) continue;
    if (!matchesCategoryPath(inv.category_code, filters.categoryPath)) continue;
    const month = inv.invoice_date.slice(0, 7);
    counts[month] = (counts[month] ?? 0) + 1;
  }
  return counts;
}
