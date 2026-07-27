// Rebuilds the tail-spend dashboard's data from an uploaded supplier-grain
// CSV (see scripts/convert-mock-to-csv.ts for the reference shape). Supplier-
// level tables and their category/segment aggregations derive from the rows;
// KPI scalars, trends, and PO/invoice value buckets need grains the CSV
// doesn't carry, so they keep their static mock values (per-widget fallback).

import type { Dataset } from "@/context/DatasetsContext";
import { cellNumber, cellString, findColumn } from "@/lib/dataset-rows";
import {
  tailSpendMock,
  type CategoryTailBreakdown,
  type ConsolidationAction,
  type ConsolidationCandidate,
  type SapCategoryRow,
  type SapSupplierReportRow,
  type SegmentComparison,
  type SpendSegment,
  type SupplierBubblePoint,
  type SupplierSpendRank,
  type TailSpendData,
} from "./tailSpendMock";

interface SupplierRecord {
  supplierId: string;
  supplierName: string;
  category: string;
  segment: SpendSegment;
  poCount: number;
  avgPOValue: number;
  totalSpend: number;
  microPOCount: number | null;
  processingCost: number | null;
  potentialSavings: number | null;
  consolidationScore: number | null;
  recommendedAction: string;
  invoiceCount: number | null;
  plantCount: number | null;
  categoryCount: number | null;
  productCount: number | null;
  costCenterCount: number | null;
}

function normalizeSegment(raw: string): SpendSegment {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("strat")) return "Strategic";
  if (s.startsWith("core")) return "Core";
  return "Tail";
}

function normalizeAction(raw: string, score: number | null): ConsolidationAction {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("consolid")) return "Consolidate";
  if (s.startsWith("contract")) return "Contract";
  if (s.startsWith("monitor")) return "Monitor";
  if (score !== null) {
    if (score >= 84) return "Consolidate";
    if (score >= 70) return "Contract";
  }
  return "Monitor";
}

/** "MRO – Mechanical Consumables" -> "MRO", "Safety & PPE" -> "SAFETY". */
function categoryCode(category: string): string {
  const word = category.split(/[\s,&–-]+/).find(Boolean) ?? category;
  return word.slice(0, 7).toUpperCase();
}

/**
 * Map an uploaded dataset into the full TailSpendData shape, or null when the
 * dataset has no recognizable supplier/spend columns (caller then falls back
 * to the static mock wholesale).
 */
export function buildTailSpendFromDataset(dataset: Dataset): TailSpendData | null {
  const cols = {
    supplierId: findColumn(dataset, ["supplierId", "supplier_id", "vendorId", "vendor_id"]),
    supplierName: findColumn(dataset, ["supplierName", "supplier_name", "supplier", "vendorName", "vendor_name", "vendor", "name"]),
    category: findColumn(dataset, ["category", "categoryName", "category_name", "category_l1"]),
    segment: findColumn(dataset, ["segment", "spendSegment"]),
    poCount: findColumn(dataset, ["poCount", "po_count", "orderCount"]),
    avgPOValue: findColumn(dataset, ["avgPOValue", "avg_po_value", "avgOrderValue", "avgValue"]),
    totalSpend: findColumn(dataset, ["totalSpend", "total_spend", "spend", "totalValue", "amount", "value"]),
    microPOCount: findColumn(dataset, ["microPOCount", "micro_po_count"]),
    processingCost: findColumn(dataset, ["processingCost", "processing_cost"]),
    potentialSavings: findColumn(dataset, ["potentialSavings", "potential_savings"]),
    consolidationScore: findColumn(dataset, ["consolidationScore", "consolidation_score"]),
    recommendedAction: findColumn(dataset, ["recommendedAction", "recommended_action", "action"]),
    invoiceCount: findColumn(dataset, ["invoiceCount", "invoice_count"]),
    plantCount: findColumn(dataset, ["plantCount", "plant_count"]),
    categoryCount: findColumn(dataset, ["categoryCount", "category_count"]),
    productCount: findColumn(dataset, ["productCount", "product_count"]),
    costCenterCount: findColumn(dataset, ["costCenterCount", "cost_center_count"]),
  };

  // Without a supplier name and a spend measure there is nothing to build from.
  if (!cols.supplierName || !cols.totalSpend) return null;

  const records: SupplierRecord[] = [];
  for (let i = 0; i < dataset.rows.length; i++) {
    const row = dataset.rows[i];
    const supplierName = cellString(row, cols.supplierName);
    if (!supplierName) continue;

    const poCount = cellNumber(row, cols.poCount) ?? 0;
    const avgFromCol = cellNumber(row, cols.avgPOValue);
    let totalSpend = cellNumber(row, cols.totalSpend) ?? 0;
    if (totalSpend === 0 && avgFromCol !== null && poCount > 0) totalSpend = avgFromCol * poCount;
    const avgPOValue = avgFromCol ?? (poCount > 0 ? totalSpend / poCount : 0);

    records.push({
      supplierId: cellString(row, cols.supplierId) || `ROW-${i + 1}`,
      supplierName,
      category: cellString(row, cols.category) || "Uncategorized",
      segment: normalizeSegment(cellString(row, cols.segment)),
      poCount,
      avgPOValue,
      totalSpend,
      microPOCount: cellNumber(row, cols.microPOCount),
      processingCost: cellNumber(row, cols.processingCost),
      potentialSavings: cellNumber(row, cols.potentialSavings),
      consolidationScore: cellNumber(row, cols.consolidationScore),
      recommendedAction: cellString(row, cols.recommendedAction),
      invoiceCount: cellNumber(row, cols.invoiceCount),
      plantCount: cellNumber(row, cols.plantCount),
      categoryCount: cellNumber(row, cols.categoryCount),
      productCount: cellNumber(row, cols.productCount),
      costCenterCount: cellNumber(row, cols.costCenterCount),
    });
  }
  if (records.length === 0) return null;

  // --- Supplier-grain tables (direct projections) --------------------------

  const supplierBubbles: SupplierBubblePoint[] = records
    .filter((r) => r.poCount > 0 && r.avgPOValue > 0)
    .map((r) => ({
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      category: r.category,
      poCount: r.poCount,
      avgPOValue: r.avgPOValue,
      totalSpend: r.totalSpend,
      segment: r.segment,
    }));

  const consolidationCandidates: ConsolidationCandidate[] = records
    .filter((r) => r.microPOCount !== null || r.consolidationScore !== null)
    .map((r) => ({
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      category: r.category,
      poCount: r.poCount,
      microPOCount: r.microPOCount ?? 0,
      totalSpend: r.totalSpend,
      avgPOValue: r.avgPOValue,
      processingCost: r.processingCost ?? r.poCount * tailSpendMock.kpi.avgPOProcessingCost,
      potentialSavings: r.potentialSavings ?? 0,
      consolidationScore: r.consolidationScore ?? 0,
      recommendedAction: normalizeAction(r.recommendedAction, r.consolidationScore),
    }))
    .sort((a, b) => b.consolidationScore - a.consolidationScore);

  const sapSupplierReport: SapSupplierReportRow[] = records
    .filter((r) => r.invoiceCount !== null)
    .map((r) => ({
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      invoiceCount: r.invoiceCount ?? 0,
      plantCount: r.plantCount ?? 0,
      categoryCount: r.categoryCount ?? 0,
      productCount: r.productCount ?? 0,
      costCenterCount: r.costCenterCount ?? 0,
      spend: r.totalSpend,
    }))
    .sort((a, b) => b.spend - a.spend);

  const supplierSpendRank: SupplierSpendRank[] = [...records]
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 10)
    .map((r) => ({ supplierId: r.supplierId, supplierName: r.supplierName, totalSpend: r.totalSpend }));

  // --- Category / segment aggregations -------------------------------------

  const byCategory = new Map<string, SupplierRecord[]>();
  for (const r of records) {
    const bucket = byCategory.get(r.category);
    if (bucket) bucket.push(r);
    else byCategory.set(r.category, [r]);
  }

  const categoryBreakdown: CategoryTailBreakdown[] = Array.from(byCategory.entries())
    .map(([category, group]) => {
      const spendBySegment = (segment: SpendSegment) =>
        group.filter((r) => r.segment === segment).reduce((s, r) => s + r.totalSpend, 0);
      const strategicSpend = spendBySegment("Strategic");
      const coreSpend = spendBySegment("Core");
      const tailSpend = spendBySegment("Tail");
      const totalSpend = strategicSpend + coreSpend + tailSpend;
      return {
        category,
        strategicSpend,
        coreSpend,
        tailSpend,
        totalSpend,
        tailPercent: totalSpend > 0 ? Math.round((tailSpend / totalSpend) * 1000) / 10 : 0,
        supplierCount: group.length,
        tailSupplierCount: group.filter((r) => r.segment === "Tail").length,
      };
    })
    .sort((a, b) => b.totalSpend - a.totalSpend);

  const totals = {
    suppliers: records.length,
    poCount: records.reduce((s, r) => s + r.poCount, 0),
    spend: records.reduce((s, r) => s + r.totalSpend, 0),
  };

  const segmentComparison: SegmentComparison[] = (["Strategic", "Core", "Tail"] as const).map((segment) => {
    const group = records.filter((r) => r.segment === segment);
    const poCount = group.reduce((s, r) => s + r.poCount, 0);
    const spendValue = group.reduce((s, r) => s + r.totalSpend, 0);
    const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
    return {
      segment,
      supplierCount: group.length,
      supplierPercent: pct(group.length, totals.suppliers),
      poCount,
      poPercent: pct(poCount, totals.poCount),
      spendValue,
      spendPercent: pct(spendValue, totals.spend),
      avgPOValue: poCount > 0 ? Math.round(spendValue / poCount) : 0,
      processingCost: poCount * tailSpendMock.kpi.avgPOProcessingCost,
    };
  });

  const sapCategoryRows: SapCategoryRow[] = categoryBreakdown.map((c) => ({
    code: categoryCode(c.category),
    category: c.category,
    supplierCount: c.supplierCount,
    spend: c.totalSpend,
  }));

  // --- Merge over the mock for everything the CSV grain can't provide ------

  return {
    ...tailSpendMock,
    supplierBubbles,
    consolidationCandidates,
    sapSupplierReport,
    supplierSpendRank,
    categoryBreakdown,
    segmentComparison,
    sapCategoryRows,
  };
}
