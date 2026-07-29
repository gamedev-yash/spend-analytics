// Rebuilds the tail-spend dashboard's data from an uploaded dataset. Two row
// grains are supported:
//
//   Supplier grain — one row per supplier (the Phase-1 sample CSV shape):
//   supplier tables project straight from rows; consolidation/report fields
//   come from their columns when present.
//
//   Transaction grain — one row per invoice/PO line, e.g. a joined
//   fact_invoices + dim_vendor composite: rows are aggregated per supplier
//   first, then KPIs, Pareto deciles, value buckets, the monthly trend, and
//   consolidation candidates are all derived from the transactions.
//
// When the segment column is absent, suppliers are segmented by cumulative
// spend share (first 50% Strategic, next 30% Core, last 20% Tail — the
// classic tail-spend cut). Whatever a grain can't provide (e.g. the monthly
// trend without dates) keeps its static mock value (per-widget fallback).

import type { Dataset } from "@/context/DatasetsContext";
import { cellNumber, cellString, findColumn } from "@/lib/dataset-rows";
import {
  tailSpendMock,
  type CategoryTailBreakdown,
  type ConsolidationAction,
  type ConsolidationCandidate,
  type InvoiceValueBucket,
  type KPISummary,
  type MonthlyTrendPoint,
  type ParetoDecile,
  type POValueBucket,
  type SapCategoryRow,
  type SapKpiRibbon,
  type SapSupplierReportRow,
  type SegmentComparison,
  type SpendSegment,
  type SupplierBubblePoint,
  type SupplierSpendRank,
  type TailSpendData,
} from "./tailSpendMock";

// ---------------------------------------------------------------------------
// Tunables (mirroring the mock's assumptions)
// ---------------------------------------------------------------------------

/** SAP ECC administrative overhead per PO — same assumption the mock uses. */
const PO_PROCESSING_COST = tailSpendMock.kpi.avgPOProcessingCost;
/** Default micro-PO boundary when the caller doesn't pass a live threshold. */
const DEFAULT_MICRO_PO_THRESHOLD = 25_000;
/** Estimated annual saving per consolidated micro-PO (~68% of processing cost). */
const SAVINGS_PER_MICRO_PO = 3_400;
/** Cumulative-spend-share boundaries for Strategic / Core / Tail segmentation. */
const STRATEGIC_SHARE = 0.5;
const CORE_SHARE = 0.8;

export interface SupplierRecord {
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

/**
 * Supplier-grain intermediate every widget on this page derives from. Producing
 * one of these is the whole job of an input adapter — lib/page-data builds it
 * from provider aggregates, parseDataset below builds it from CSV rows, and
 * buildTailSpendFromParsed turns either into the page's data.
 */
export interface ParsedDataset {
  suppliers: SupplierRecord[];
  /** Individual transaction values — only for transaction-grain datasets. */
  txnValues: number[] | null;
  /** "YYYY-MM" -> per-segment spend — only when the dataset carries dates. */
  monthlySegmentSpend: Map<string, Map<SpendSegment, number>> | null;
  /** True when consolidation fields came from real columns (supplier grain). */
  consolidationFromColumns: boolean;
}

export { DEFAULT_MICRO_PO_THRESHOLD };

function normalizeSegment(raw: string): SpendSegment | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
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

/**
 * "MRO – Mechanical Consumables" -> "MRO", "Safety & PPE" -> "SAFETY".
 *
 * Truncating to the first word collides for real category sets ("Cleaning
 * Supplies" and "Cleaning Equipment" both yield "CLEANIN"), and the SAP
 * category table keys its rows on this code — so `taken` disambiguates with a
 * numeric suffix, keeping every emitted code unique.
 */
export function categoryCode(category: string, taken: Set<string>): string {
  const word = category.split(/[\s,&–-]+/).find(Boolean) ?? category;
  const base = word.slice(0, 7).toUpperCase() || "CAT";
  let code = base;
  let n = 2;
  while (taken.has(code)) code = `${base.slice(0, 6)}${n++}`;
  taken.add(code);
  return code;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** "2025-08" -> "Aug 2025" (the mock's month label format). */
function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[(m ?? 1) - 1] ?? "?"} ${y}`;
}

function toMonthKey(raw: string): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 7);
}

/**
 * Assign Strategic/Core/Tail by cumulative spend share for suppliers whose
 * dataset carries no segment column: rank by spend desc; a supplier belongs
 * to the segment its cumulative share BEFORE it falls in.
 */
function assignSegmentsByShare(records: SupplierRecord[]): void {
  const total = records.reduce((s, r) => s + r.totalSpend, 0);
  if (total <= 0) return;
  const ranked = [...records].sort((a, b) => b.totalSpend - a.totalSpend);
  let cumulative = 0;
  for (const r of ranked) {
    const shareBefore = cumulative / total;
    r.segment = shareBefore < STRATEGIC_SHARE ? "Strategic" : shareBefore < CORE_SHARE ? "Core" : "Tail";
    cumulative += r.totalSpend;
  }
}

// ---------------------------------------------------------------------------
// Parsing — supplier grain vs transaction grain
// ---------------------------------------------------------------------------

function resolveColumns(dataset: Dataset) {
  return {
    supplierId: findColumn(dataset, ["supplierId", "supplier_id", "vendorId", "vendor_id"]),
    supplierName: findColumn(dataset, ["supplierName", "supplier_name", "supplier", "vendorName", "vendor_name", "vendor", "name"]),
    category: findColumn(dataset, ["category", "categoryName", "category_name", "category_l1", "category_code"]),
    segment: findColumn(dataset, ["segment", "spendSegment"]),
    poCount: findColumn(dataset, ["poCount", "po_count", "orderCount"]),
    avgPOValue: findColumn(dataset, ["avgPOValue", "avg_po_value", "avgOrderValue", "avgValue"]),
    value: findColumn(dataset, ["totalSpend", "total_spend", "spend", "invoice_value_inr", "net_value_inr", "totalValue", "amount", "value"]),
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
    // Transaction-grain signals
    date: findColumn(dataset, ["invoice_date", "po_date", "date", "order_date"]),
    txnId: findColumn(dataset, ["invoice_number", "invoice_id", "po_number", "transaction_id"]),
    plant: findColumn(dataset, ["plant_code", "plant_id", "plant_name"]),
    product: findColumn(dataset, ["material_number", "product_id", "product", "material"]),
    costCenter: findColumn(dataset, ["cost_center", "costCenter", "cost_center_id"]),
  };
}

type Cols = ReturnType<typeof resolveColumns>;

function parseDataset(dataset: Dataset, microThreshold: number): ParsedDataset | null {
  const cols = resolveColumns(dataset);

  // Without a supplier name and a spend measure there is nothing to build from.
  if (!cols.supplierName || !cols.value) return null;

  // Transaction grain: has a per-row id or date AND suppliers repeat across rows.
  const nameMeta = dataset.columns.find((c) => c.id === cols.supplierName);
  const suppliersRepeat = (nameMeta?.distinctCount ?? dataset.rows.length) < dataset.rows.length * 0.9;
  const transactional = Boolean(cols.date || cols.txnId) && suppliersRepeat;

  if (transactional) return parseTransactionGrain(dataset, cols, microThreshold);
  return parseSupplierGrain(dataset, cols);
}

function parseSupplierGrain(dataset: Dataset, cols: Cols): ParsedDataset | null {
  const records: SupplierRecord[] = [];
  let sawSegmentColumn = false;

  for (let i = 0; i < dataset.rows.length; i++) {
    const row = dataset.rows[i];
    const supplierName = cellString(row, cols.supplierName);
    if (!supplierName) continue;

    const poCount = cellNumber(row, cols.poCount) ?? 0;
    const avgFromCol = cellNumber(row, cols.avgPOValue);
    let totalSpend = cellNumber(row, cols.value) ?? 0;
    if (totalSpend === 0 && avgFromCol !== null && poCount > 0) totalSpend = avgFromCol * poCount;
    const avgPOValue = avgFromCol ?? (poCount > 0 ? totalSpend / poCount : 0);
    const segment = normalizeSegment(cellString(row, cols.segment));
    if (segment !== null) sawSegmentColumn = true;

    records.push({
      supplierId: cellString(row, cols.supplierId) || `ROW-${i + 1}`,
      supplierName,
      category: cellString(row, cols.category) || "Uncategorized",
      segment: segment ?? "Tail",
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

  if (!sawSegmentColumn) assignSegmentsByShare(records);

  return {
    suppliers: records,
    txnValues: null,
    monthlySegmentSpend: null,
    consolidationFromColumns: true,
  };
}

interface SupplierAccumulator {
  supplierId: string;
  supplierName: string;
  spendByCategory: Map<string, number>;
  totalSpend: number;
  txnCount: number;
  microCount: number;
  plants: Set<string>;
  categories: Set<string>;
  products: Set<string>;
  costCenters: Set<string>;
  monthly: Map<string, number>;
}

function parseTransactionGrain(dataset: Dataset, cols: Cols, microThreshold: number): ParsedDataset | null {
  const bySupplier = new Map<string, SupplierAccumulator>();
  const txnValues: number[] = [];

  for (const row of dataset.rows) {
    const supplierName = cellString(row, cols.supplierName);
    const value = cellNumber(row, cols.value);
    if (!supplierName || value === null) continue;

    const supplierId = cellString(row, cols.supplierId) || supplierName;
    const acc = bySupplier.get(supplierId) ?? {
      supplierId,
      supplierName,
      spendByCategory: new Map<string, number>(),
      totalSpend: 0,
      txnCount: 0,
      microCount: 0,
      plants: new Set<string>(),
      categories: new Set<string>(),
      products: new Set<string>(),
      costCenters: new Set<string>(),
      monthly: new Map<string, number>(),
    };

    acc.totalSpend += value;
    acc.txnCount += 1;
    if (value < microThreshold) acc.microCount += 1;

    const category = cellString(row, cols.category);
    if (category) {
      acc.spendByCategory.set(category, (acc.spendByCategory.get(category) ?? 0) + value);
      acc.categories.add(category);
    }
    const plant = cellString(row, cols.plant);
    if (plant) acc.plants.add(plant);
    const product = cellString(row, cols.product);
    if (product) acc.products.add(product);
    const costCenter = cellString(row, cols.costCenter);
    if (costCenter) acc.costCenters.add(costCenter);

    const month = toMonthKey(cellString(row, cols.date));
    if (month) acc.monthly.set(month, (acc.monthly.get(month) ?? 0) + value);

    txnValues.push(value);
    bySupplier.set(supplierId, acc);
  }
  if (bySupplier.size === 0) return null;

  const records: SupplierRecord[] = Array.from(bySupplier.values()).map((acc) => {
    const dominantCategory =
      Array.from(acc.spendByCategory.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Uncategorized";
    return {
      supplierId: acc.supplierId,
      supplierName: acc.supplierName,
      category: dominantCategory,
      segment: "Tail" as SpendSegment, // reassigned by share below
      poCount: acc.txnCount,
      avgPOValue: acc.txnCount > 0 ? acc.totalSpend / acc.txnCount : 0,
      totalSpend: acc.totalSpend,
      microPOCount: acc.microCount,
      processingCost: null,
      potentialSavings: null,
      consolidationScore: null,
      recommendedAction: "",
      invoiceCount: acc.txnCount,
      plantCount: acc.plants.size || null,
      categoryCount: acc.categories.size || null,
      productCount: acc.products.size || null,
      costCenterCount: acc.costCenters.size || null,
    };
  });

  assignSegmentsByShare(records);

  // Per-month per-segment totals need segments — fold now that they're assigned.
  const segmentById = new Map(records.map((r) => [r.supplierId, r.segment]));
  const monthlySegmentSpend = new Map<string, Map<SpendSegment, number>>();
  let sawMonths = false;
  for (const acc of bySupplier.values()) {
    const segment = segmentById.get(acc.supplierId) ?? "Tail";
    for (const [month, value] of acc.monthly) {
      sawMonths = true;
      const bucket = monthlySegmentSpend.get(month) ?? new Map<SpendSegment, number>();
      bucket.set(segment, (bucket.get(segment) ?? 0) + value);
      monthlySegmentSpend.set(month, bucket);
    }
  }

  return {
    suppliers: records,
    txnValues,
    monthlySegmentSpend: sawMonths ? monthlySegmentSpend : null,
    consolidationFromColumns: false,
  };
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

function deriveParetoDeciles(records: SupplierRecord[], totalSpend: number): ParetoDecile[] {
  const ranked = [...records].sort((a, b) => b.totalSpend - a.totalSpend);
  const buckets = [
    { label: "Top 10%", upTo: 0.1 },
    { label: "10–20%", upTo: 0.2 },
    { label: "20–40%", upTo: 0.4 },
    { label: "40–60%", upTo: 0.6 },
    { label: "60–80%", upTo: 0.8 },
    { label: "80–100%", upTo: 1.0 },
  ];
  let index = 0;
  let cumulativeSpend = 0;
  return buckets.map((bucket) => {
    const end = Math.round(ranked.length * bucket.upTo);
    let spend = 0;
    let count = 0;
    while (index < end) {
      spend += ranked[index].totalSpend;
      count += 1;
      index += 1;
    }
    cumulativeSpend += spend;
    return {
      decileLabel: bucket.label,
      supplierCount: count,
      spendPercentOfTotal: pct(spend, totalSpend),
      cumulativeSpendPercent: pct(cumulativeSpend, totalSpend),
    };
  });
}

interface BucketSpec {
  label: string;
  min: number;
  max: number;
}

const PO_VALUE_BUCKETS: BucketSpec[] = [
  { label: "< ₹5K", min: 0, max: 5_000 },
  { label: "₹5K – ₹25K", min: 5_000, max: 25_000 },
  { label: "₹25K – ₹1L", min: 25_000, max: 100_000 },
  { label: "₹1L – ₹5L", min: 100_000, max: 500_000 },
  { label: "₹5L – ₹25L", min: 500_000, max: 2_500_000 },
  { label: "> ₹25L", min: 2_500_000, max: Infinity },
];

const INVOICE_VALUE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "<1K", min: 0, max: 1_000 },
  { label: "1K-5K", min: 1_000, max: 5_000 },
  { label: "5K-10K", min: 5_000, max: 10_000 },
  { label: "10K-100K", min: 10_000, max: 100_000 },
  { label: "100K-1M", min: 100_000, max: 1_000_000 },
  { label: "1M-5M", min: 1_000_000, max: 5_000_000 },
  { label: ">5M", min: 5_000_000, max: Infinity },
];

/**
 * Bucket spend by unit value. Transaction grain buckets each transaction;
 * supplier grain approximates by placing each supplier's whole PO volume at
 * its average PO value.
 */
function derivePoValueBuckets(
  records: SupplierRecord[],
  txnValues: number[] | null,
  microThreshold: number
): POValueBucket[] {
  const counts = PO_VALUE_BUCKETS.map(() => ({ poCount: 0, totalValue: 0 }));
  if (txnValues) {
    for (const value of txnValues) {
      const i = PO_VALUE_BUCKETS.findIndex((b) => value >= b.min && value < b.max);
      if (i >= 0) {
        counts[i].poCount += 1;
        counts[i].totalValue += value;
      }
    }
  } else {
    for (const r of records) {
      if (r.poCount <= 0) continue;
      const i = PO_VALUE_BUCKETS.findIndex((b) => r.avgPOValue >= b.min && r.avgPOValue < b.max);
      if (i >= 0) {
        counts[i].poCount += r.poCount;
        counts[i].totalValue += r.totalSpend;
      }
    }
  }
  const totalCount = counts.reduce((s, c) => s + c.poCount, 0);
  const totalValue = counts.reduce((s, c) => s + c.totalValue, 0);
  return PO_VALUE_BUCKETS.map((spec, i) => ({
    bucketLabel: spec.label,
    poCount: counts[i].poCount,
    totalValue: Math.round(counts[i].totalValue),
    percentOfPOCount: pct(counts[i].poCount, totalCount),
    percentOfTotalValue: pct(counts[i].totalValue, totalValue),
    processingCost: counts[i].poCount * PO_PROCESSING_COST,
    isMicroPO: spec.max <= microThreshold,
  }));
}

function deriveInvoiceValueBuckets(
  records: SupplierRecord[],
  txnValues: number[] | null,
  totalSpend: number
): InvoiceValueBucket[] {
  const counts = INVOICE_VALUE_BUCKETS.map(() => ({ invoiceCount: 0, spend: 0, suppliers: new Set<string>() }));
  if (txnValues) {
    // Re-walk supplier records for supplier attribution per bucket via avg —
    // exact per-txn supplier attribution is folded in during parsing instead;
    // keep it simple: attribute a supplier to the bucket of its avg value.
    for (const value of txnValues) {
      const i = INVOICE_VALUE_BUCKETS.findIndex((b) => value >= b.min && value < b.max);
      if (i >= 0) {
        counts[i].invoiceCount += 1;
        counts[i].spend += value;
      }
    }
    for (const r of records) {
      const i = INVOICE_VALUE_BUCKETS.findIndex((b) => r.avgPOValue >= b.min && r.avgPOValue < b.max);
      if (i >= 0) counts[i].suppliers.add(r.supplierId);
    }
  } else {
    for (const r of records) {
      const count = r.invoiceCount ?? r.poCount;
      if (count <= 0) continue;
      const i = INVOICE_VALUE_BUCKETS.findIndex((b) => r.avgPOValue >= b.min && r.avgPOValue < b.max);
      if (i >= 0) {
        counts[i].invoiceCount += count;
        counts[i].spend += r.totalSpend;
        counts[i].suppliers.add(r.supplierId);
      }
    }
  }
  return INVOICE_VALUE_BUCKETS.map((spec, i) => ({
    bucketLabel: spec.label,
    invoiceCount: counts[i].invoiceCount,
    invoicesPerSupplier:
      counts[i].suppliers.size > 0
        ? Math.round((counts[i].invoiceCount / counts[i].suppliers.size) * 10) / 10
        : counts[i].invoiceCount,
    spend: Math.round(counts[i].spend),
    spendPercent: Math.round((totalSpend > 0 ? (counts[i].spend / totalSpend) * 100 : 0) * 100) / 100,
  }));
}

function deriveConsolidationCandidates(
  records: SupplierRecord[],
  fromColumns: boolean,
  overallAvgPOValue: number
): ConsolidationCandidate[] {
  if (fromColumns) {
    return records
      .filter((r) => r.microPOCount !== null || r.consolidationScore !== null)
      .map((r) => ({
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        category: r.category,
        poCount: r.poCount,
        microPOCount: r.microPOCount ?? 0,
        totalSpend: r.totalSpend,
        avgPOValue: r.avgPOValue,
        processingCost: r.processingCost ?? r.poCount * PO_PROCESSING_COST,
        potentialSavings: r.potentialSavings ?? 0,
        consolidationScore: r.consolidationScore ?? 0,
        recommendedAction: normalizeAction(r.recommendedAction, r.consolidationScore),
      }))
      .sort((a, b) => b.consolidationScore - a.consolidationScore);
  }

  // Heuristic for transaction-grain data: consolidation opportunity = small
  // orders (micro-PO share when the dataset has micro-POs, otherwise how far
  // below the DATASET'S overall average the supplier's own average order
  // sits — scale-free, so it works at any currency/magnitude) weighted 70%,
  // plus order volume weighted 30%. Savings scale with the share of
  // processing cost a blanket PO/catalog could avoid (up to ~65%, mirroring
  // the mock's ratios).
  return records
    .filter((r) => r.segment === "Tail" && r.poCount >= 5)
    .map((r) => {
      const microShare = r.poCount > 0 ? (r.microPOCount ?? 0) / r.poCount : 0;
      const relativeSmallness =
        overallAvgPOValue > 0 ? 1 - Math.min(r.avgPOValue / overallAvgPOValue, 1) : 0;
      const smallOrderWeight = Math.max(microShare, relativeSmallness);
      const volumeWeight = Math.min(r.poCount / 150, 1);
      const score = Math.round(100 * (0.7 * smallOrderWeight + 0.3 * volumeWeight));
      const processingCost = r.poCount * PO_PROCESSING_COST;
      const potentialSavings =
        (r.microPOCount ?? 0) > 0
          ? (r.microPOCount ?? 0) * SAVINGS_PER_MICRO_PO
          : Math.round(processingCost * 0.65 * smallOrderWeight);
      return {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        category: r.category,
        poCount: r.poCount,
        microPOCount: r.microPOCount ?? 0,
        totalSpend: r.totalSpend,
        avgPOValue: r.avgPOValue,
        processingCost,
        potentialSavings,
        consolidationScore: score,
        recommendedAction: normalizeAction("", score),
      };
    })
    .filter((c) => c.potentialSavings > 0)
    .sort((a, b) => b.consolidationScore - a.consolidationScore)
    .slice(0, 25);
}

function deriveMonthlyTrend(
  monthlySegmentSpend: Map<string, Map<SpendSegment, number>> | null
): MonthlyTrendPoint[] | null {
  if (!monthlySegmentSpend || monthlySegmentSpend.size < 2) return null;
  return Array.from(monthlySegmentSpend.keys())
    .sort()
    .slice(-12)
    .map((month) => {
      const bucket = monthlySegmentSpend.get(month)!;
      return {
        month: monthLabel(month),
        strategicSpend: Math.round(bucket.get("Strategic") ?? 0),
        coreSpend: Math.round(bucket.get("Core") ?? 0),
        tailSpend: Math.round(bucket.get("Tail") ?? 0),
      };
    });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Map an uploaded dataset (raw supplier-grain CSV, transaction-grain CSV, or
 * a joined composite) into the full TailSpendData shape, or null when the
 * dataset has no recognizable supplier/spend columns (caller then falls back
 * to the static mock wholesale).
 */
export function buildTailSpendFromDataset(
  dataset: Dataset,
  microThreshold: number = DEFAULT_MICRO_PO_THRESHOLD
): TailSpendData | null {
  const parsed = parseDataset(dataset, microThreshold);
  if (!parsed) return null;
  return buildTailSpendFromParsed(parsed, microThreshold);
}

/**
 * Derive the full page shape from the supplier-grain intermediate, whichever
 * adapter produced it. Anything the intermediate cannot supply keeps its static
 * mock value, so a partial source still renders a complete page.
 */
export function buildTailSpendFromParsed(
  parsed: ParsedDataset,
  microThreshold: number = DEFAULT_MICRO_PO_THRESHOLD
): TailSpendData | null {
  const records = parsed.suppliers;
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

  const totalPoCount = records.reduce((s, r) => s + r.poCount, 0);
  const totalSpendAll = records.reduce((s, r) => s + r.totalSpend, 0);
  const consolidationCandidates = deriveConsolidationCandidates(
    records,
    parsed.consolidationFromColumns,
    totalPoCount > 0 ? totalSpendAll / totalPoCount : 0
  );

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

  // Ranked by DISPLAY NAME, not id: this chart plots supplierName, and real
  // extracts routinely carry several ids under one name (per-plant entities of
  // the same vendor). Summing them keeps one bar per supplier — and avoids
  // duplicate chart keys, which React rejects.
  const spendBySupplierName = new Map<string, SupplierSpendRank>();
  for (const r of records) {
    const existing = spendBySupplierName.get(r.supplierName);
    if (existing) existing.totalSpend += r.totalSpend;
    else
      spendBySupplierName.set(r.supplierName, {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        totalSpend: r.totalSpend,
      });
  }
  const supplierSpendRank: SupplierSpendRank[] = Array.from(spendBySupplierName.values())
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 10);

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
        tailPercent: pct(tailSpend, totalSpend),
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
    return {
      segment,
      supplierCount: group.length,
      supplierPercent: pct(group.length, totals.suppliers),
      poCount,
      poPercent: pct(poCount, totals.poCount),
      spendValue,
      spendPercent: pct(spendValue, totals.spend),
      avgPOValue: poCount > 0 ? Math.round(spendValue / poCount) : 0,
      processingCost: poCount * PO_PROCESSING_COST,
    };
  });

  const usedCategoryCodes = new Set<string>();
  const sapCategoryRows: SapCategoryRow[] = categoryBreakdown.map((c) => ({
    code: categoryCode(c.category, usedCategoryCodes),
    category: c.category,
    supplierCount: c.supplierCount,
    spend: c.totalSpend,
  }));

  // --- KPIs, Pareto, value buckets, ribbon, trend ---------------------------

  const tailSegment = segmentComparison.find((s) => s.segment === "Tail")!;
  const microPOCount = records.reduce((s, r) => s + (r.microPOCount ?? 0), 0);
  const invoiceCountTotal = records.reduce((s, r) => s + (r.invoiceCount ?? r.poCount), 0);
  const potentialConsolidationSavings = consolidationCandidates.reduce((s, c) => s + c.potentialSavings, 0);

  const kpi: KPISummary = {
    totalAnnualSpend: totals.spend,
    totalPOCount: totals.poCount,
    totalActiveSuppliers: totals.suppliers,
    tailSpendValue: tailSegment.spendValue,
    tailSpendPercentOfValue: tailSegment.spendPercent,
    tailPOCount: tailSegment.poCount,
    tailSpendPercentOfPOs: tailSegment.poPercent,
    microPOThreshold: microThreshold,
    microPOCount,
    microPOPercentOfTotalPOs: pct(microPOCount, totals.poCount),
    microPOProcessingCost: microPOCount * PO_PROCESSING_COST,
    tailSupplierCount: tailSegment.supplierCount,
    singleUseSupplierCount: records.filter((r) => (r.invoiceCount ?? r.poCount) <= 1).length,
    avgPOProcessingCost: PO_PROCESSING_COST,
    potentialConsolidationSavings,
  };

  const sapKpiRibbon: SapKpiRibbon = {
    invoiceCount: invoiceCountTotal,
    supplierCountGlobalUltimate: totals.suppliers,
    meanInvoiceAmountPerSupplier: totals.suppliers > 0 ? Math.round(totals.spend / totals.suppliers) : 0,
    meanInvoicesPerSupplier:
      totals.suppliers > 0 ? Math.round((invoiceCountTotal / totals.suppliers) * 10) / 10 : 0,
  };

  const monthlyTrend = deriveMonthlyTrend(parsed.monthlySegmentSpend);

  // --- Merge over the mock for whatever this grain can't provide -----------

  return {
    ...tailSpendMock,
    kpi,
    paretoDeciles: deriveParetoDeciles(records, totals.spend),
    categoryBreakdown,
    supplierBubbles,
    segmentComparison,
    monthlyTrend: monthlyTrend ?? tailSpendMock.monthlyTrend,
    consolidationCandidates,
    poValueBuckets: derivePoValueBuckets(records, parsed.txnValues, microThreshold),
    sapKpiRibbon,
    invoiceValueBuckets: deriveInvoiceValueBuckets(records, parsed.txnValues, totals.spend),
    supplierSpendRank,
    sapCategoryRows,
    sapSupplierReport,
  };
}
