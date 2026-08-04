// Builds the tail-spend page's supplier-grain intermediate from provider
// aggregates instead of CSV rows, then hands it to the existing
// buildTailSpendFromParsed — so Pareto deciles, segmentation, bubbles, and the
// consolidation table are derived by exactly the code the CSV path uses.
//
// Queries issued (all bounded well under the 1,000-row cap):
//   1. per-supplier spend / PO count / plant + category breadth   (~160 rows)
//   2. per-supplier micro-PO count, filtered below the threshold  (~160 rows)
//   3. per-supplier primary category, ranked by spend            (≤1000 rows)
//   4. monthly spend per supplier segment                        (see below)
//   5-n. one count+sum per PO-value bucket                       (1 row each)

import {
  buildTailSpendFromParsed,
  categoryCode,
  type ParsedDataset,
  type SupplierRecord,
} from "@/app/tail-spend/fromDataset";
import type {
  CategoryTailBreakdown,
  SapCategoryRow,
  SpendSegment,
  TailSpendData,
} from "@/app/tail-spend/tailSpendMock";
import {
  CATEGORIES,
  INVOICES_DATASET,
  PLANTS,
  PO_ITEMS_DATASET,
  ROWS,
  SUPPLIERS,
  VALUE,
  createRunner,
  grouped,
  inFilter,
  percent,
  toLabel,
  toNumber,
  type QueryRunner,
  type ResultRow,
} from "@/lib/page-data/provider-queries";
import { COUNT_ALL, type IDataProvider } from "@/types/data-provider";

/** Suppliers the page ranks. 1000 is the provider cap; the base has ~160. */
const SUPPLIER_LIMIT = 1000;

/** Cumulative-spend-share boundaries, mirroring fromDataset's segmentation. */
const STRATEGIC_SHARE = 0.5;
const CORE_SHARE = 0.8;

/**
 * The value bands the PO/invoice distribution widgets use. Each becomes one
 * filtered aggregate, which is how a histogram is built without shipping every
 * transaction value to the browser.
 */
const VALUE_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: "<1K", min: 0, max: 1_000 },
  { label: "1K-5K", min: 1_000, max: 5_000 },
  { label: "5K-10K", min: 5_000, max: 10_000 },
  { label: "10K-100K", min: 10_000, max: 100_000 },
  { label: "100K-1M", min: 100_000, max: 1_000_000 },
  { label: "1M-5M", min: 1_000_000, max: 5_000_000 },
  { label: ">5M", min: 5_000_000, max: null },
];

export interface ProviderBucket {
  label: string;
  count: number;
  spend: number;
}

export interface TailSpendProviderResult {
  data: TailSpendData;
  /** Value-band histogram, for the widgets that plot a distribution. */
  buckets: ProviderBucket[];
  /** Payloads issued — surfaced so a page can report what it queried. */
  issued: number;
}

async function loadSupplierRecords(runner: QueryRunner, microThreshold: number): Promise<SupplierRecord[]> {
  const [spendRows, microRows, categoryRows, invoiceRows] = await Promise.all([
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["vendor_name"],
        measures: {
          [VALUE]: ["net_order_value_inr", "sum"],
          [ROWS]: [COUNT_ALL, "count"],
          [PLANTS]: ["plant_code", "distinct"],
          [CATEGORIES]: ["material_group_id", "distinct"],
          docs: ["po_number", "distinct"],
        },
        sortBy: VALUE,
        limit: SUPPLIER_LIMIT,
      })
    ),
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["vendor_name"],
        measures: { [ROWS]: [COUNT_ALL, "count"] },
        filters: [{ field: "net_order_value_inr", operator: "lt", value: microThreshold }],
        sortBy: ROWS,
        limit: SUPPLIER_LIMIT,
      })
    ),
    // Ranked by spend, so each supplier's biggest category lands before its
    // smaller ones and the first row seen per supplier is its primary.
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["vendor_name", "category_l1_name"],
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
        sortBy: VALUE,
        limit: SUPPLIER_LIMIT,
      })
    ),
    // Real invoice counts come from fact_invoices. Counting PO documents here
    // instead would label a purchase-order count "Invoices" on the KPI ribbon.
    runner.run(
      grouped({
        datasetId: INVOICES_DATASET,
        dimensions: ["vendor_name"],
        measures: { docs: ["invoice_number", "distinct"] },
        sortBy: "docs",
        limit: SUPPLIER_LIMIT,
      })
    ),
  ]);

  const microBySupplier = new Map<string, number>();
  for (const row of microRows) microBySupplier.set(toLabel(row.vendor_name), toNumber(row[ROWS]));

  const invoicesBySupplier = new Map<string, number>();
  for (const row of invoiceRows) invoicesBySupplier.set(toLabel(row.vendor_name), toNumber(row.docs));

  const primaryCategory = new Map<string, string>();
  for (const row of categoryRows) {
    const supplier = toLabel(row.vendor_name);
    if (!primaryCategory.has(supplier)) primaryCategory.set(supplier, toLabel(row.category_l1_name));
  }

  const records: SupplierRecord[] = spendRows.map((row) => {
    const supplierName = toLabel(row.vendor_name);
    const totalSpend = toNumber(row[VALUE]);
    const poCount = toNumber(row[ROWS]);
    return {
      supplierId: supplierName,
      supplierName,
      category: primaryCategory.get(supplierName) ?? "Unclassified",
      // Overwritten below once the cumulative shares are known.
      segment: "Tail",
      poCount,
      avgPOValue: poCount > 0 ? totalSpend / poCount : 0,
      totalSpend,
      microPOCount: microBySupplier.get(supplierName) ?? 0,
      // Consolidation economics are modelled, not stored, so the shared
      // derivation computes them from PO counts.
      processingCost: null,
      potentialSavings: null,
      consolidationScore: null,
      recommendedAction: "",
      // Falls back to distinct POs for a supplier with no invoices yet.
      invoiceCount: invoicesBySupplier.get(supplierName) ?? toNumber(row.docs),
      plantCount: toNumber(row[PLANTS]),
      categoryCount: toNumber(row[CATEGORIES]),
      // Not in the star schema: no material or cost-centre grain on the fact.
      productCount: null,
      costCenterCount: null,
    };
  });

  assignSegments(records);
  return records;
}

/** Strategic / Core / Tail by cumulative spend share — same rule as the CSV path. */
function assignSegments(records: SupplierRecord[]): void {
  const total = records.reduce((sum, record) => sum + record.totalSpend, 0);
  if (total <= 0) return;
  const ranked = [...records].sort((a, b) => b.totalSpend - a.totalSpend);
  let cumulative = 0;
  for (const record of ranked) {
    cumulative += record.totalSpend;
    const share = cumulative / total;
    record.segment = share <= STRATEGIC_SHARE ? "Strategic" : share <= CORE_SHARE ? "Core" : "Tail";
  }
}

/**
 * Monthly spend split by segment. Segments are a property of the supplier, so
 * this groups by month × supplier and re-buckets — bounded by taking only the
 * suppliers that carry the spend.
 */
async function loadMonthlySegmentSpend(
  runner: QueryRunner,
  records: SupplierRecord[]
): Promise<Map<string, Map<SpendSegment, number>> | null> {
  const segmentOf = new Map(records.map((r) => [r.supplierName, r.segment]));
  const rows = await runner.run(
    grouped({
      datasetId: PO_ITEMS_DATASET,
      dimensions: ["po_date", "vendor_name"],
      measures: { [VALUE]: ["net_order_value_inr", "sum"] },
      timeGrain: "month",
      sortBy: VALUE,
      limit: 1000,
    })
  );
  if (rows.length === 0) return null;

  const monthly = new Map<string, Map<SpendSegment, number>>();
  for (const row of rows) {
    const month = toLabel(row.po_date, "");
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const segment = segmentOf.get(toLabel(row.vendor_name)) ?? "Tail";
    const bucket = monthly.get(month) ?? new Map<SpendSegment, number>();
    bucket.set(segment, (bucket.get(segment) ?? 0) + toNumber(row[VALUE]));
    monthly.set(month, bucket);
  }
  return monthly.size >= 2 ? monthly : null;
}

/** One filtered aggregate per value band — a histogram without fetching rows. */
async function loadValueBuckets(runner: QueryRunner): Promise<ProviderBucket[]> {
  const results = await Promise.all(
    VALUE_BUCKETS.map(async (bucket) => {
      const filters = [
        { field: "net_order_value_inr", operator: "gte" as const, value: bucket.min },
        ...(bucket.max === null
          ? []
          : [{ field: "net_order_value_inr", operator: "lt" as const, value: bucket.max }]),
      ];
      const rows: ResultRow[] = await runner.run(
        grouped({
          datasetId: PO_ITEMS_DATASET,
          measures: { [ROWS]: [COUNT_ALL, "count"], [VALUE]: ["net_order_value_inr", "sum"] },
          filters,
        })
      );
      const row = rows[0] ?? {};
      return { label: bucket.label, count: toNumber(row[ROWS]), spend: toNumber(row[VALUE]) };
    })
  );
  return results;
}

/**
 * Exact per-category spend, split by supplier segment.
 *
 * The supplier-grain intermediate cannot express this: it carries one primary
 * category per supplier, so deriving category totals from it attributes a
 * supplier's whole spend to its largest category and overstates the big ones. A
 * transaction-grain source knows better, so the categories are queried directly
 * and spliced over the derived values.
 *
 * One query per segment, narrowed by that segment's suppliers — exact, and
 * bounded at three queries of ~13 rows however many suppliers there are.
 */
async function loadCategoryBreakdown(
  runner: QueryRunner,
  records: SupplierRecord[]
): Promise<{ categoryBreakdown: CategoryTailBreakdown[]; sapCategoryRows: SapCategoryRow[] } | null> {
  const segments: SpendSegment[] = ["Strategic", "Core", "Tail"];
  const byCategory = new Map<
    string,
    { strategicSpend: number; coreSpend: number; tailSpend: number; suppliers: number; tailSuppliers: number }
  >();

  const perSegment = await Promise.all(
    segments.map(async (segment) => {
      const names = records.filter((r) => r.segment === segment).map((r) => r.supplierName);
      if (names.length === 0) return { segment, rows: [] as ResultRow[] };
      const rows = await runner.run(
        grouped({
          datasetId: PO_ITEMS_DATASET,
          dimensions: ["category_l1_name"],
          measures: {
            [VALUE]: ["net_order_value_inr", "sum"],
            [SUPPLIERS]: ["vendor_id", "distinct"],
          },
          filters: [inFilter("vendor_name", names)],
          sortBy: VALUE,
          limit: 200,
        })
      );
      return { segment, rows };
    })
  );

  for (const { segment, rows } of perSegment) {
    for (const row of rows) {
      const category = toLabel(row.category_l1_name);
      const bucket =
        byCategory.get(category) ??
        { strategicSpend: 0, coreSpend: 0, tailSpend: 0, suppliers: 0, tailSuppliers: 0 };
      const spend = toNumber(row[VALUE]);
      const suppliers = toNumber(row[SUPPLIERS]);
      if (segment === "Strategic") bucket.strategicSpend += spend;
      else if (segment === "Core") bucket.coreSpend += spend;
      else {
        bucket.tailSpend += spend;
        bucket.tailSuppliers += suppliers;
      }
      bucket.suppliers += suppliers;
      byCategory.set(category, bucket);
    }
  }

  if (byCategory.size === 0) return null;

  const categoryBreakdown: CategoryTailBreakdown[] = [...byCategory.entries()]
    .map(([category, bucket]) => {
      const totalSpend = bucket.strategicSpend + bucket.coreSpend + bucket.tailSpend;
      return {
        category,
        strategicSpend: bucket.strategicSpend,
        coreSpend: bucket.coreSpend,
        tailSpend: bucket.tailSpend,
        totalSpend,
        tailPercent: percent(bucket.tailSpend, totalSpend),
        supplierCount: bucket.suppliers,
        tailSupplierCount: bucket.tailSuppliers,
      };
    })
    .sort((a, b) => b.totalSpend - a.totalSpend);

  const taken = new Set<string>();
  const sapCategoryRows: SapCategoryRow[] = categoryBreakdown.map((c) => ({
    code: categoryCode(c.category, taken),
    category: c.category,
    supplierCount: c.supplierCount,
    spend: c.totalSpend,
  }));

  return { categoryBreakdown, sapCategoryRows };
}

/**
 * Load the tail-spend page from a warehouse dataset. Returns null when the
 * dataset yields no suppliers, so the caller falls back to the static mock.
 */
export async function loadTailSpendFromProvider(
  provider: IDataProvider,
  microThreshold: number
): Promise<TailSpendProviderResult | null> {
  const runner = createRunner(provider);
  const records = await loadSupplierRecords(runner, microThreshold);
  if (records.length === 0) return null;

  const [monthlySegmentSpend, buckets, categories] = await Promise.all([
    loadMonthlySegmentSpend(runner, records),
    loadValueBuckets(runner),
    loadCategoryBreakdown(runner, records),
  ]);

  const parsed: ParsedDataset = {
    suppliers: records,
    // Individual transaction values never leave the database; the bucket
    // aggregates above stand in for them.
    txnValues: null,
    monthlySegmentSpend,
    consolidationFromColumns: false,
  };

  const derived = buildTailSpendFromParsed(parsed, microThreshold);
  if (!derived) return null;

  // Exact category figures replace the ones derived from primary categories.
  const data = categories ? { ...derived, ...categories } : derived;
  return { data, buckets, issued: runner.issued.length };
}
