// Spend-overview metrics from provider aggregates.
//
// Unlike tail-spend there is no row-grain intermediate to reuse: the CSV adapter
// builds a Record_[] and aggregates it eight different ways. So each widget gets
// the grouped query that produces it directly, and the two-dimension results are
// folded into the `byL1` breakdowns the charts expect.
//
// Row budget per query (cap is 1,000):
//   treemap / metrics      category L1 x L2      ~65
//   top suppliers          10 suppliers x L1     ~130
//   trend                  36 months x L1        ~470
//   BU split               7 plants x L1         ~91

import type {
  BuSpendRow,
  HeadlineKpis,
  MetricsTableRow,
  MonthlyTrendPoint,
  SpikeMarker,
  SunburstNode,
  TopSupplierRow,
  TreemapNode,
} from "@/lib/sap/aggregate";
import type { SpendOverviewData } from "@/app/spend-overview/fromDataset";
import {
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
  toLabel,
  toNumber,
  type QueryRunner,
  type ResultRow,
} from "@/lib/page-data/provider-queries";
import { COUNT_ALL, type IDataProvider, type QueryFilter } from "@/types/data-provider";

const TOP_SUPPLIERS = 10;
/** A month whose spend deviates more than this from the mean is flagged. */
const SPIKE_DEVIATION = 0.25;

function contractFilter(backed: boolean): QueryFilter {
  return { field: "is_contract_backed", operator: "eq", value: backed ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

async function loadKpis(runner: QueryRunner): Promise<{ kpis: HeadlineKpis; total: number }> {
  const [totals, offContract, byYear] = await Promise.all([
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        measures: {
          [VALUE]: ["net_order_value_inr", "sum"],
          [ROWS]: [COUNT_ALL, "count"],
          [SUPPLIERS]: ["vendor_id", "distinct"],
        },
      })
    ),
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
        filters: [contractFilter(false)],
      })
    ),
    // Fiscal-year totals give year-on-year without a second date window.
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["po_date"],
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
        timeGrain: "year",
        sortBy: "po_date",
        direction: "asc",
        limit: 20,
      })
    ),
  ]);

  const row = totals[0] ?? {};
  const total = toNumber(row[VALUE]);
  const poCount = toNumber(row[ROWS]);

  // Compare the last two complete fiscal years present in the data.
  const years = byYear.map((y) => toNumber(y[VALUE]));
  const latest = years.at(-1) ?? 0;
  const previous = years.at(-2) ?? 0;

  return {
    total,
    kpis: {
      totalSpendInr: round2(total),
      invoiceCount: poCount,
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
}

async function loadCategories(runner: QueryRunner): Promise<CategoryAggregates> {
  const [l1Rows, l2Rows, offContractRows] = await Promise.all([
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["category_l1_name"],
        measures: {
          [VALUE]: ["net_order_value_inr", "sum"],
          [ROWS]: [COUNT_ALL, "count"],
          [SUPPLIERS]: ["vendor_id", "distinct"],
        },
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
        sortBy: VALUE,
        limit: 500,
      })
    ),
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["category_l1_name"],
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
        filters: [contractFilter(false)],
        sortBy: VALUE,
        limit: 100,
      })
    ),
  ]);

  const offContractByL1 = new Map<string, number>();
  for (const row of offContractRows) {
    offContractByL1.set(toLabel(row.category_l1_name), toNumber(row[VALUE]));
  }
  return { l1Rows, l2Rows, offContractByL1 };
}

function buildTreemap(aggregates: CategoryAggregates, total: number): TreemapNode[] {
  const nodes: TreemapNode[] = [];
  for (const row of aggregates.l1Rows) {
    const label = toLabel(row.category_l1_name);
    const value = toNumber(row[VALUE]);
    nodes.push({
      id: label,
      label,
      parent: "",
      value: round2(value),
      // Year-on-year per category needs a second dated window per node; the
      // headline KPI carries the movement instead.
      yoyChangePercent: 0,
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
      yoyChangePercent: 0,
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
    return {
      category,
      totalSpendInr: round2(value),
      percentOfTotal: percent(value, total),
      supplierCount: toNumber(row[SUPPLIERS]),
      poCount,
      avgPoValueInr: poCount > 0 ? round2(value / poCount) : 0,
      yoyChangePercent: 0,
      offContractPercent: percent(aggregates.offContractByL1.get(category) ?? 0, value),
    };
  });
}

// ---------------------------------------------------------------------------
// Suppliers, trend, business units
// ---------------------------------------------------------------------------

async function loadTopSuppliers(
  runner: QueryRunner,
  total: number
): Promise<{ rows: TopSupplierRow[]; top5Percent: number; allL1: string[] }> {
  const ranked = await runner.run(
    grouped({
      datasetId: PO_ITEMS_DATASET,
      dimensions: ["vendor_name"],
      measures: { [VALUE]: ["net_order_value_inr", "sum"] },
      sortBy: VALUE,
      limit: TOP_SUPPLIERS,
    })
  );
  if (ranked.length === 0) return { rows: [], top5Percent: 0, allL1: [] };

  const names = ranked.map((row) => toLabel(row.vendor_name));
  // Second pass restricted to the winners, so the L1 breakdown stays small.
  const breakdown = await runner.run(
    grouped({
      datasetId: PO_ITEMS_DATASET,
      dimensions: ["vendor_name", "category_l1_name"],
      measures: { [VALUE]: ["net_order_value_inr", "sum"] },
      filters: [inFilter("vendor_name", names)],
      sortBy: VALUE,
      limit: 1000,
    })
  );
  const bySupplier = nest(breakdown, "vendor_name", "category_l1_name");

  const allL1 = [...new Set(breakdown.map((row) => toLabel(row.category_l1_name)))].sort();
  let cumulative = 0;
  const rows: TopSupplierRow[] = ranked.map((row) => {
    const key = toLabel(row.vendor_name);
    const value = toNumber(row[VALUE]);
    cumulative += value;
    return {
      key,
      displayName: key,
      totalValue: round2(value),
      byL1: bySupplier.get(key) ?? {},
      cumulativePercent: percent(cumulative, total),
    };
  });

  const top5 = rows.slice(0, 5).reduce((sum, row) => sum + row.totalValue, 0);
  return { rows, top5Percent: percent(top5, total), allL1 };
}

async function loadTrend(runner: QueryRunner): Promise<{ trend: MonthlyTrendPoint[]; spikes: SpikeMarker[] }> {
  const rows = await runner.run(
    grouped({
      datasetId: PO_ITEMS_DATASET,
      dimensions: ["po_date", "category_l1_name"],
      measures: { [VALUE]: ["net_order_value_inr", "sum"] },
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
  total: number
): Promise<{ buSpend: BuSpendRow[]; plantNameToCode: Record<string, string> }> {
  const [plantRows, breakdown] = await Promise.all([
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["plant_name", "plant_code"],
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
        sortBy: VALUE,
        limit: 200,
      })
    ),
    runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        dimensions: ["plant_name", "category_l1_name"],
        measures: { [VALUE]: ["net_order_value_inr", "sum"] },
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
      // The star schema keeps region on the plant's state, which dim_plant does
      // not expose as a column; the plant name carries the BU identity.
      region: "",
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
    parts.push(`${topBu.plantName} is the highest-spending BU at ${crore(topBu.total)}.`);
  }
  parts.push(`Off-contract spend is ${Math.round(kpis.offContractPercent)}%.`);
  return parts.join(" ");
}

/**
 * Load the spend-overview page from a warehouse dataset, or null when the
 * dataset is empty (caller falls back to the server-aggregated mock).
 */
export async function loadSpendOverviewFromProvider(
  provider: IDataProvider
): Promise<SpendOverviewData | null> {
  const runner = createRunner(provider);

  const { kpis, total } = await loadKpis(runner);
  if (total <= 0 && kpis.poCount === 0) return null;

  const [categories, topSuppliers, trendData, buData] = await Promise.all([
    loadCategories(runner),
    loadTopSuppliers(runner, total),
    loadTrend(runner),
    loadBuSpend(runner, total),
  ]);

  const metricsRows = buildMetricsRows(categories, total);

  return {
    kpis,
    insightText: buildInsight(kpis, metricsRows, buData.buSpend),
    treemapNodes: buildTreemap(categories, total),
    topSuppliers,
    trend: trendData.trend,
    spikes: trendData.spikes,
    buSpend: buData.buSpend,
    sunburstNodes: buildSunburst(categories),
    plantNameToCode: buData.plantNameToCode,
    metricsRows,
  };
}
