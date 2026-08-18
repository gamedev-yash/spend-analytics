// Spend-overview metrics from provider aggregates, filtered.
//
// This is an in-route fork of the original lib/page-data/spend-overview-from-provider.ts
// (kept there, unmodified, and no longer used by this page) — recreated here so every
// change needed to make BU/Category/Date/Vendor filters actually reach the warehouse
// query stays inside app/spend-overview/.
//
// Unlike tail-spend there is no row-grain intermediate to reuse: the CSV adapter
// builds a Record_[] and aggregates it eight different ways. So each widget gets
// the grouped query that produces it directly, and the two-dimension results are
// folded into the `byL1` breakdowns the charts expect.
//
// Row budget per query (cap is 1,000):
//   treemap / metrics      category L1 x L2      ~65
//   top suppliers          all suppliers, 1 dim  ~500
//   trend                  36 months x L1        ~470
//   BU split               7 plants x L1         ~91

import type {
  BuSpendRow,
  HeadlineKpis,
  MetricsTableRow,
  MonthlyTrendPoint,
  SpikeMarker,
  SunburstNode,
  SupplierDetailRow,
  TopSupplierRow,
  TreemapNode,
} from "@/lib/sap/aggregate";
import type { SpendOverviewData } from "@/app/spend-overview/fromDataset";
import type { SapFilters } from "@/lib/sap/types";
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
  nest,
  percent,
  round2,
  rowCountQuery,
  toLabel,
  toNumber,
  type QueryRunner,
  type ResultRow,
} from "@/lib/page-data/provider-queries";
import { COUNT_ALL, type IDataProvider, type QueryFilter } from "@/types/data-provider";

/** Now that the chart drops the per-category breakdown, one query can return every supplier. */
const SUPPLIER_ROW_LIMIT = 500;
/** A month whose spend deviates more than this from the mean is flagged. */
const SPIKE_DEVIATION = 0.25;

function contractFilter(backed: boolean): QueryFilter {
  return { field: "is_contract_backed", operator: "eq", value: backed ? 1 : 0 };
}

/** Same-length window one year earlier — mirrors lib/sap/aggregate.ts's shiftYear. */
function shiftYear(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/** The prior-year filters used for every YoY comparison in this module. */
function priorYearFilters(filters: SapFilters): SapFilters {
  return {
    ...filters,
    dateFrom: shiftYear(filters.dateFrom ?? "2025-01-01", -1),
    dateTo: shiftYear(filters.dateTo ?? "2025-12-31", -1),
  };
}

/**
 * Translates the same SapFilters the mock (lib/sap/aggregate.ts) and
 * CSV-upload (fromDataset.ts) paths apply into QueryFilter clauses for the
 * warehouse query API, so all three data sources honor plant/category/date/
 * vendor filters identically.
 *
 * `includeDateRange: false` mirrors getSpendTrendData's intentional choice
 * to ignore the date filter — the trend view always shows full history.
 */
function buildProviderFilters(filters: SapFilters, { includeDateRange = true } = {}): QueryFilter[] {
  const clauses: QueryFilter[] = [];
  if (filters.plants?.length) clauses.push(inFilter("plant_code", filters.plants));
  if (filters.categoriesL1?.length) clauses.push(inFilter("category_l1_name", filters.categoriesL1));
  if (includeDateRange) {
    if (filters.dateFrom) clauses.push({ field: "po_date", operator: "gte", value: filters.dateFrom });
    if (filters.dateTo) clauses.push({ field: "po_date", operator: "lte", value: filters.dateTo });
  }
  if (filters.vendorId) clauses.push({ field: "vendor_name", operator: "eq", value: filters.vendorId });
  if (filters.categoryPath) {
    const [l1, l2] = filters.categoryPath.split("|");
    clauses.push({ field: "category_l1_name", operator: "eq", value: l1 });
    if (l2) clauses.push({ field: "category_l2_name", operator: "eq", value: l2 });
  }
  return clauses;
}

/**
 * fact_po_items exposes both plant_code and plant_name on the same row, so a
 * single cheap grouped query (~7 rows) gives a code -> name lookup without
 * this client-side module importing the server-only raw dimension data.
 */
async function loadPlantCodeToName(runner: QueryRunner): Promise<Map<string, string>> {
  const rows = await runner.run(
    grouped({
      datasetId: PO_ITEMS_DATASET,
      dimensions: ["plant_code", "plant_name"],
      measures: { [ROWS]: [COUNT_ALL, "count"] },
      limit: 200,
    })
  );
  const map = new Map<string, string>();
  for (const row of rows) map.set(toLabel(row.plant_code), toLabel(row.plant_name));
  return map;
}

/**
 * fact_invoices exposes plant_name but not plant_code (see metadata-registry.ts),
 * unlike fact_po_items — so the invoice-count query needs its own filter
 * builder that translates SapFilters.plants (codes) to plant names first.
 */
async function buildInvoiceFilters(runner: QueryRunner, filters: SapFilters): Promise<QueryFilter[]> {
  const clauses: QueryFilter[] = [];
  if (filters.plants?.length) {
    const codeToName = await loadPlantCodeToName(runner);
    const names = filters.plants.map((code) => codeToName.get(code)).filter((n): n is string => Boolean(n));
    if (names.length) clauses.push(inFilter("plant_name", names));
  }
  if (filters.categoriesL1?.length) clauses.push(inFilter("category_l1_name", filters.categoriesL1));
  if (filters.vendorId) clauses.push({ field: "vendor_name", operator: "eq", value: filters.vendorId });
  if (filters.categoryPath) {
    const [l1, l2] = filters.categoryPath.split("|");
    clauses.push({ field: "category_l1_name", operator: "eq", value: l1 });
    if (l2) clauses.push({ field: "category_l2_name", operator: "eq", value: l2 });
  }
  return clauses;
}

/**
 * Invoice counts per month ("YYYY-MM"), for the Spend Trend chart's invoice
 * line. Ignores the date-range filter on purpose, same as loadTrend below.
 */
async function loadMonthlyInvoiceCounts(
  runner: QueryRunner,
  filters: SapFilters
): Promise<Record<string, number>> {
  const invoiceFilters = await buildInvoiceFilters(runner, filters);
  const rows = await runner.run(
    grouped({
      datasetId: INVOICES_DATASET,
      dimensions: ["invoice_date"],
      measures: { [ROWS]: [COUNT_ALL, "count"] },
      filters: invoiceFilters,
      timeGrain: "month",
      limit: 1000,
    })
  );
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const month = toLabel(row.invoice_date);
    if (/^\d{4}-\d{2}$/.test(month)) counts[month] = toNumber(row[ROWS]);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

async function loadKpis(
  runner: QueryRunner,
  filters: SapFilters
): Promise<{ kpis: HeadlineKpis; total: number }> {
  const baseFilters = buildProviderFilters(filters);
  const invoiceFilters = await buildInvoiceFilters(runner, filters);
  const [totals, offContract, byYear, invoiceTotals] = await Promise.all([
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        measures: {
          [VALUE]: ["net_order_value_inr", "sum"],
          [ROWS]: [COUNT_ALL, "count"],
          [SUPPLIERS]: ["vendor_id", "distinct"],
        },
        filters: baseFilters,
      })
    ),
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
        filters: [...baseFilters, contractFilter(false)],
      })
    ),
    // Fiscal-year totals give year-on-year without a second date window; the
    // comparison itself needs full history, so this ignores the date range
    // the same way loadTrend does, but keeps the other filters.
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["po_date"],
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
        filters: buildProviderFilters(filters, { includeDateRange: false }),
        timeGrain: "year",
        sortBy: "po_date",
        direction: "asc",
        limit: 20,
      })
    ),
    // fact_invoices is its own dataset (separate row grain from fact_po_items),
    // so the Invoices KPI needs its own count query rather than reusing poCount.
    runner.run(rowCountQuery(INVOICES_DATASET, invoiceFilters)),
  ]);

  const row = totals[0] ?? {};
  const total = toNumber(row[VALUE]);
  const poCount = toNumber(row[ROWS]);
  const invoiceCount = toNumber((invoiceTotals[0] ?? {})[ROWS]);

  // Compare the last two complete fiscal years present in the data.
  const years = byYear.map((y) => toNumber(y[VALUE]));
  const latest = years.at(-1) ?? 0;
  const previous = years.at(-2) ?? 0;

  return {
    total,
    kpis: {
      totalSpendInr: round2(total),
      invoiceCount,
      poCount,
      activeSupplierCount: toNumber(row[SUPPLIERS]),
      avgPoValueInr: poCount > 0 ? round2(total / poCount) : 0,
      yoyChangePercent: previous > 0 ? round2(((latest - previous) / previous) * 100) : 0,
      offContractPercent: percent(toNumber((offContract[0] ?? {})[VALUE]), total),
    },
  };
}

// ---------------------------------------------------------------------------
// Category hierarchy — treemap, sunburst, metrics table
// ---------------------------------------------------------------------------

interface CategoryAggregates {
  l1Rows: ResultRow[];
  l2Rows: ResultRow[];
  offContractByL1: Map<string, number>;
  priorByL1: Map<string, number>;
}

async function loadCategories(runner: QueryRunner, filters: SapFilters): Promise<CategoryAggregates> {
  const baseFilters = buildProviderFilters(filters);
  const [l1Rows, l2Rows, offContractRows, priorL1Rows] = await Promise.all([
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["category_l1_name"],
        measures: {
          [VALUE]: ["net_order_value_inr", "sum"],
          [ROWS]: [COUNT_ALL, "count"],
          [SUPPLIERS]: ["vendor_id", "distinct"],
        },
        filters: baseFilters,
        sortBy: VALUE,
        limit: 100,
      })
    ),
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["category_l1_name", "category_l2_name"],
        measures: {
          [VALUE]: ["net_order_value_inr", "sum"],
          [ROWS]: [COUNT_ALL, "count"],
          [SUPPLIERS]: ["vendor_id", "distinct"],
        },
        filters: baseFilters,
        sortBy: VALUE,
        limit: 500,
      })
    ),
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["category_l1_name"],
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
        filters: [...baseFilters, contractFilter(false)],
        sortBy: VALUE,
        limit: 100,
      })
    ),
    // Same-length window one year earlier, per L1 — powers the metrics
    // table / treemap's per-category YoY (the headline KPI's YoY is a
    // separate fiscal-year comparison, see loadKpis).
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["category_l1_name"],
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
        filters: buildProviderFilters(priorYearFilters(filters)),
        limit: 100,
      })
    ),
  ]);

  const offContractByL1 = new Map<string, number>();
  for (const row of offContractRows) {
    offContractByL1.set(toLabel(row.category_l1_name), toNumber(row[VALUE]));
  }
  const priorByL1 = new Map<string, number>();
  for (const row of priorL1Rows) {
    priorByL1.set(toLabel(row.category_l1_name), toNumber(row[VALUE]));
  }
  return { l1Rows, l2Rows, offContractByL1, priorByL1 };
}

function buildTreemap(
  aggregates: CategoryAggregates,
  total: number,
  rootSupplierCount: number,
  rootPoCount: number
): TreemapNode[] {
  // Root wrapper node — matches the mock-data (lib/sap/aggregate.ts) and
  // CSV-upload (fromDataset.ts) conventions, both of which nest L1 categories
  // under an explicit "All Spend" root rather than parenting them to "".
  const nodes: TreemapNode[] = [
    {
      id: "All Spend",
      label: "All Spend",
      parent: "",
      value: round2(total),
      yoyChangePercent: 0,
      supplierCount: rootSupplierCount,
      poCount: rootPoCount,
      percentOfTotal: 100,
    },
  ];
  for (const row of aggregates.l1Rows) {
    const label = toLabel(row.category_l1_name);
    const value = toNumber(row[VALUE]);
    const prior = aggregates.priorByL1.get(label) ?? 0;
    nodes.push({
      id: label,
      label,
      parent: "All Spend",
      value: round2(value),
      yoyChangePercent: prior > 0 ? round2(((value - prior) / prior) * 100) : 0,
      supplierCount: toNumber(row[SUPPLIERS]),
      poCount: toNumber(row[ROWS]),
      percentOfTotal: percent(value, total),
    });
  }
  for (const row of aggregates.l2Rows) {
    const parent = toLabel(row.category_l1_name);
    const label = toLabel(row.category_l2_name);
    const value = toNumber(row[VALUE]);
    nodes.push({
      id: `${parent} / ${label}`,
      label,
      parent,
      value: round2(value),
      // The prior-year query only groups by L1 (an L2 breakdown would be a
      // second, much larger query) — L2 nodes carry their parent L1's movement.
      yoyChangePercent: nodes.find((n) => n.id === parent)?.yoyChangePercent ?? 0,
      supplierCount: toNumber(row[SUPPLIERS]),
      poCount: toNumber(row[ROWS]),
      percentOfTotal: percent(value, total),
    });
  }
  return nodes;
}

function buildSunburst(aggregates: CategoryAggregates): SunburstNode[] {
  return [
    ...aggregates.l1Rows.map((row) => {
      const label = toLabel(row.category_l1_name);
      return { id: label, label, parent: "", value: round2(toNumber(row[VALUE])) };
    }),
    ...aggregates.l2Rows.map((row) => {
      const parent = toLabel(row.category_l1_name);
      const label = toLabel(row.category_l2_name);
      return { id: `${parent} / ${label}`, label, parent, value: round2(toNumber(row[VALUE])) };
    }),
  ];
}

function buildMetricsRows(aggregates: CategoryAggregates, total: number): MetricsTableRow[] {
  return aggregates.l1Rows.map((row) => {
    const category = toLabel(row.category_l1_name);
    const value = toNumber(row[VALUE]);
    const poCount = toNumber(row[ROWS]);
    const prior = aggregates.priorByL1.get(category) ?? 0;
    return {
      category,
      totalSpendInr: round2(value),
      percentOfTotal: percent(value, total),
      supplierCount: toNumber(row[SUPPLIERS]),
      poCount,
      avgPoValueInr: poCount > 0 ? round2(value / poCount) : 0,
      yoyChangePercent: prior > 0 ? round2(((value - prior) / prior) * 100) : 0,
      offContractPercent: percent(aggregates.offContractByL1.get(category) ?? 0, value),
    };
  });
}

// ---------------------------------------------------------------------------
// Suppliers, trend, business units
// ---------------------------------------------------------------------------

async function loadTopSuppliers(
  runner: QueryRunner,
  total: number,
  filters: SapFilters
): Promise<{ rows: TopSupplierRow[]; top5Percent: number; allL1: string[] }> {
  // Single query, one row per vendor — the chart no longer stacks by category,
  // so there's no need for a second per-L1 breakdown pass. parent_company_name
  // rides along on the same row (functionally dependent on vendor_name, so it
  // adds no extra groups) and is folded below, mirroring lib/sap/aggregate.ts's
  // getTopSuppliersData so this widget groups by parent company the same way
  // regardless of provider.
  const ranked = await runner.run(
    grouped({
      datasetId: PO_ITEMS_DATASET,
      dimensions: ["vendor_name", "parent_company_name"],
      measures: { [VALUE]: ["net_order_value_inr", "sum"] },
      filters: buildProviderFilters(filters),
      sortBy: VALUE,
      limit: SUPPLIER_ROW_LIMIT,
    })
  );
  if (ranked.length === 0) return { rows: [], top5Percent: 0, allL1: [] };

  const merged = new Map<string, number>();
  for (const row of ranked) {
    const key = toLabel(row.parent_company_name, "") || toLabel(row.vendor_name);
    merged.set(key, (merged.get(key) ?? 0) + toNumber(row[VALUE]));
  }

  let cumulative = 0;
  const rows: TopSupplierRow[] = Array.from(merged.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => {
      cumulative += value;
      return {
        key,
        displayName: key,
        totalValue: round2(value),
        byL1: {},
        cumulativePercent: percent(cumulative, total),
      };
    });

  const top5 = rows.slice(0, 5).reduce((sum, row) => sum + row.totalValue, 0);
  return { rows, top5Percent: percent(top5, total), allL1: [] };
}

/**
 * Supplier-grain "Detailed Report" (SAP Spend Control Tower's own name for
 * this widget) — spend/plants/categories come from POs, the same basis every
 * other widget on this page uses; invoices are a separate row grain, counted
 * from fact_invoices rather than reused from the PO count.
 */
// Vendor-grained, not parent-grained: unlike loadTopSuppliers' single spend
// measure, plants/categories are distinct-counts already computed per vendor
// by the query engine, and summing two vendors' distinct-count results after
// the fact would double-count a plant/category they both used (there's no
// way to re-derive an exact merged distinct count without either raw rows or
// a third query grouped directly by parent — lib/sap/aggregate.ts's CSV path
// gets this for free by building its Sets from raw PO rows, which this
// provider path doesn't have). Left at vendor grain rather than showing a
// merged number that can be wrong on its face (e.g. more plants than exist).
async function loadSupplierDetailReport(runner: QueryRunner, filters: SapFilters): Promise<SupplierDetailRow[]> {
  const invoiceFilters = await buildInvoiceFilters(runner, filters);
  const [poRows, invoiceRows] = await Promise.all([
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["vendor_name"],
        measures: {
          [VALUE]: ["net_order_value_inr", "sum"],
          [PLANTS]: ["plant_code", "distinct"],
          [CATEGORIES]: ["category_l1_name", "distinct"],
        },
        filters: buildProviderFilters(filters),
        sortBy: VALUE,
        limit: SUPPLIER_ROW_LIMIT,
      })
    ),
    runner.run(
      grouped({
        datasetId: INVOICES_DATASET,
        dimensions: ["vendor_name"],
        measures: { docs: ["invoice_number", "distinct"] },
        filters: invoiceFilters,
        limit: SUPPLIER_ROW_LIMIT,
      })
    ),
  ]);

  const rows = new Map<string, SupplierDetailRow>();
  for (const row of poRows) {
    const supplierName = toLabel(row.vendor_name);
    rows.set(supplierName, {
      key: supplierName,
      supplierName,
      invoices: 0,
      plants: toNumber(row[PLANTS]),
      categories: toNumber(row[CATEGORIES]),
      products: null,
      spendInr: round2(toNumber(row[VALUE])),
    });
  }
  for (const row of invoiceRows) {
    const supplierName = toLabel(row.vendor_name);
    const existing = rows.get(supplierName);
    if (existing) existing.invoices = toNumber(row.docs);
    else {
      rows.set(supplierName, {
        key: supplierName,
        supplierName,
        invoices: toNumber(row.docs),
        plants: 0,
        categories: 0,
        products: null,
        spendInr: 0,
      });
    }
  }

  return Array.from(rows.values()).sort((a, b) => b.spendInr - a.spendInr);
}

async function loadTrend(
  runner: QueryRunner,
  filters: SapFilters
): Promise<{ trend: MonthlyTrendPoint[]; spikes: SpikeMarker[] }> {
  // Trend always shows full history — the date range filter is intentionally
  // excluded here, matching getSpendTrendData's documented behavior.
  const rows = await runner.run(
    grouped({
      datasetId: PO_ITEMS_DATASET,
      dimensions: ["po_date", "category_l1_name"],
      measures: { [VALUE]: ["net_order_value_inr", "sum"] },
      filters: buildProviderFilters(filters, { includeDateRange: false }),
      timeGrain: "month",
      sortBy: VALUE,
      limit: 1000,
    })
  );

  const byMonth = nest(rows, "po_date", "category_l1_name");
  const trend: MonthlyTrendPoint[] = [...byMonth.entries()]
    .filter(([month]) => /^\d{4}-\d{2}$/.test(month))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, byL1]) => ({
      month,
      total: round2(Object.values(byL1).reduce((sum, value) => sum + value, 0)),
      byL1,
    }));

  if (trend.length === 0) return { trend, spikes: [] };
  const mean = trend.reduce((sum, point) => sum + point.total, 0) / trend.length;
  const spikes: SpikeMarker[] = trend
    .filter((point) => mean > 0 && Math.abs(point.total - mean) / mean > SPIKE_DEVIATION)
    .map((point) => ({
      month: point.month,
      total: point.total,
      deviation: round2((point.total - mean) / mean),
    }));

  return { trend, spikes };
}

async function loadBuSpend(
  runner: QueryRunner,
  total: number,
  filters: SapFilters
): Promise<{ buSpend: BuSpendRow[]; plantNameToCode: Record<string, string> }> {
  const baseFilters = buildProviderFilters(filters);
  const [plantRows, breakdown] = await Promise.all([
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["plant_name", "plant_code", "region"],
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
        filters: baseFilters,
        sortBy: VALUE,
        limit: 200,
      })
    ),
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["plant_name", "category_l1_name"],
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
        filters: baseFilters,
        sortBy: VALUE,
        limit: 1000,
      })
    ),
  ]);

  const byPlant = nest(breakdown, "plant_name", "category_l1_name");
  const plantNameToCode: Record<string, string> = {};
  const buSpend: BuSpendRow[] = plantRows.map((row) => {
    const plantName = toLabel(row.plant_name);
    const plantCode = toLabel(row.plant_code, plantName);
    const value = toNumber(row[VALUE]);
    plantNameToCode[plantName] = plantCode;
    return {
      plantCode,
      plantName,
      region: toLabel(row.region, ""),
      total: round2(value),
      byL1: byPlant.get(plantName) ?? {},
      percentOfTotal: percent(value, total),
    };
  });

  return { buSpend, plantNameToCode };
}

function buildInsight(kpis: HeadlineKpis, metricsRows: MetricsTableRow[], buSpend: BuSpendRow[]): string {
  const crore = (value: number) => `₹${Math.round(value / 10_000_000).toLocaleString("en-IN")} Cr`;
  const topCategory = metricsRows[0];
  const topBu = buSpend[0];
  const parts = [
    `Total spend is ${crore(kpis.totalSpendInr)} across ${kpis.activeSupplierCount.toLocaleString("en-IN")} active suppliers.`,
  ];
  if (topCategory) {
    parts.push(`${topCategory.category} dominates at ${Math.round(topCategory.percentOfTotal)}% of total spend.`);
  }
  if (topBu) {
    parts.push(`${topBu.plantName} is the highest-spending business unit at ${crore(topBu.total)}.`);
  }
  parts.push(`Off-contract spend is ${Math.round(kpis.offContractPercent)}%.`);
  return parts.join(" ");
}

/**
 * Load the spend-overview page from a warehouse dataset, filtered by the same
 * SapFilters the URL-driven filter bar and cross-filter clicks produce — or
 * null when the filtered dataset is empty (caller falls back to the
 * server-aggregated mock).
 */
export async function loadSpendOverviewFromProvider(
  provider: IDataProvider,
  filters: SapFilters
): Promise<SpendOverviewData | null> {
  const runner = createRunner(provider);

  const { kpis, total } = await loadKpis(runner, filters);
  if (total <= 0 && kpis.poCount === 0) return null;

  const [categories, topSuppliers, trendData, buData, invoiceCountByMonth, supplierDetailRows] = await Promise.all([
    loadCategories(runner, filters),
    loadTopSuppliers(runner, total, filters),
    loadTrend(runner, filters),
    loadBuSpend(runner, total, filters),
    loadMonthlyInvoiceCounts(runner, filters),
    loadSupplierDetailReport(runner, filters),
  ]);

  const metricsRows = buildMetricsRows(categories, total);

  return {
    kpis,
    insightText: buildInsight(kpis, metricsRows, buData.buSpend),
    treemapNodes: buildTreemap(categories, total, kpis.activeSupplierCount, kpis.poCount),
    topSuppliers,
    trend: trendData.trend,
    invoiceCountByMonth,
    spikes: trendData.spikes,
    buSpend: buData.buSpend,
    sunburstNodes: buildSunburst(categories),
    plantNameToCode: buData.plantNameToCode,
    metricsRows,
    supplierDetailRows,
  };
}
