/**
 * Fragmentation analytics — a faithful TypeScript port of the Python
 * prototype's utils/metrics.py, operating on the denormalised master PO-line
 * rows under the supplier-grouping toggle:
 *
 *   mode "vendor" → each SAP vendor is one supplier (vendor_id)
 *   mode "parent" → subsidiaries collapse onto their KONZS parent group;
 *                   vendors with no group count as their own singleton group
 *
 * Key concepts
 * ------------
 * HHI (Herfindahl-Hirschman Index): sum of squared supplier spend shares
 * within a category, scaled 0–10000. One supplier → 10000 (concentrated);
 * many equal suppliers → ~0 (fragmented).
 *   HHI < 1500   competitive / fragmented
 *   1500–2500    moderate
 *   > 2500       concentrated
 *
 * Fragmentation score (per category) = 1 − HHI/10000 (0..1, higher = worse).
 * Portfolio Fragmentation Index = spend-weighted mean fragmentation score × 100.
 */

import { formatInr } from "@/lib/sap/format-inr";
import type {
  CategoryStat,
  ConsolidationRow,
  CrossFilter,
  GlobalFilters,
  GroupMode,
  HeatmapData,
  InsightSegment,
  KpiSet,
  MasterRow,
  SankeyData,
  TrendPoint,
} from "./types";

/** Composite-map-key separator — never occurs in names, so keys are unambiguous. */
const SEP = String.fromCharCode(0);

/** Suppliers holding < 5% of a category's spend are its consolidatable "tail". */
export const TAIL_SHARE = 0.05;
/** Savings ramp floor (at 50% supplier-count reduction). */
export const SAVINGS_MIN = 0.05;
/** Savings ramp ceiling (at 100% supplier-count reduction). */
export const SAVINGS_MAX = 0.15;

// ---------------------------------------------------------------------------
// small numeric helpers (pandas semantics)
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** pandas .median(): average of the two middle values for even counts. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Population standard deviation (pandas .std(ddof=0)). */
function popStd(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

// ---------------------------------------------------------------------------
// supplier identity under the grouping toggle
// ---------------------------------------------------------------------------

/**
 * The grouping key for one row. In parent mode a vendor without a
 * parent_company_group is its own singleton group (prefixed to avoid any
 * collision between vendor ids and group names).
 */
export function supplierKey(row: MasterRow, mode: GroupMode): string {
  if (mode === "parent") return row.parent ?? `solo:${row.vendor}`;
  return row.vendor;
}

/**
 * Display names for supplier keys. Vendor mode → vendor names; parent mode →
 * the group name, falling back to the underlying vendor's name for singleton
 * groups (mirrors the prototype's IND-* fallback).
 */
export function supplierNameLookup(rows: MasterRow[], mode: GroupMode): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const row of rows) {
    const key = supplierKey(row, mode);
    if (mode === "vendor" || row.parent === null) {
      lookup.set(key, row.vendorName);
    } else {
      lookup.set(key, row.parent);
    }
  }
  return lookup;
}

// ---------------------------------------------------------------------------
// filtering
// ---------------------------------------------------------------------------

/** Global filter bar → row subset. Empty selections mean "all". */
export function applyFilters(rows: MasterRow[], filters: GlobalFilters): MasterRow[] {
  const { plants, l1s, dateFrom, dateTo } = filters;
  const plantSet = plants.length > 0 ? new Set(plants) : null;
  const l1Set = l1s.length > 0 ? new Set(l1s) : null;
  const useDates = Boolean(dateFrom && dateTo);
  return rows.filter(
    (row) =>
      (!plantSet || plantSet.has(row.plant)) &&
      (!l1Set || l1Set.has(row.l1)) &&
      (!useDates || (row.date >= dateFrom && row.date <= dateTo))
  );
}

/** Click-driven cross-filter applied on top of the global filters. */
export function applyCrossFilter(rows: MasterRow[], cf: CrossFilter | null): MasterRow[] {
  if (!cf) return rows;
  return rows.filter(
    (row) =>
      (!cf.plantName || row.plantName === cf.plantName) &&
      (!cf.categoryL1 || row.l1 === cf.categoryL1) &&
      (!cf.categoryL2 || row.l2 === cf.categoryL2)
  );
}

// ---------------------------------------------------------------------------
// per-category statistics (the HHI core)
// ---------------------------------------------------------------------------

/**
 * One row per L2 category with supplier count, spend, PO count, HHI and
 * fragmentation score. Sorted by category name ascending (pandas groupby
 * order) so "first max" tie-breaks match the prototype.
 */
export function categoryStats(rows: MasterRow[], mode: GroupMode): CategoryStat[] {
  if (rows.length === 0) return [];

  interface Acc {
    categoryL1: string;
    supplierSpend: Map<string, number>;
    poNumbers: Set<string>;
    spend: number;
  }
  const byCategory = new Map<string, Acc>();

  for (const row of rows) {
    let acc = byCategory.get(row.l2);
    if (!acc) {
      acc = { categoryL1: row.l1, supplierSpend: new Map(), poNumbers: new Set(), spend: 0 };
      byCategory.set(row.l2, acc);
    }
    const key = supplierKey(row, mode);
    acc.supplierSpend.set(key, (acc.supplierSpend.get(key) ?? 0) + row.value);
    acc.poNumbers.add(row.po);
    acc.spend += row.value;
  }

  const stats: CategoryStat[] = [];
  for (const [categoryL2, acc] of byCategory) {
    let hhi = 0;
    if (acc.spend > 0) {
      for (const supSpend of acc.supplierSpend.values()) {
        const share = supSpend / acc.spend;
        hhi += share * share;
      }
      hhi *= 10000;
    }
    stats.push({
      categoryL2,
      categoryL1: acc.categoryL1,
      nSuppliers: acc.supplierSpend.size,
      spend: acc.spend,
      nPos: acc.poNumbers.size,
      hhi,
      fragScore: 1 - hhi / 10000,
    });
  }

  stats.sort((a, b) => a.categoryL2.localeCompare(b.categoryL2));
  return stats;
}

// ---------------------------------------------------------------------------
// portfolio KPIs
// ---------------------------------------------------------------------------

/** Spend-weighted mean fragmentation score across categories, 0–100. */
export function fragmentationIndex(stats: CategoryStat[]): number {
  const totalSpend = stats.reduce((s, c) => s + c.spend, 0);
  if (stats.length === 0 || totalSpend === 0) return 0;
  const weighted = stats.reduce((s, c) => s + c.fragScore * c.spend, 0);
  return (weighted / totalSpend) * 100;
}

/**
 * Spend fragmented enough to consolidate: within categories whose supplier
 * count exceeds the portfolio median, the spend going to suppliers that each
 * hold < TAIL_SHARE of the category. Always evaluated at vendor grain
 * (matching the prototype, which hardcodes vendor_id here).
 * Returns [valueInr, flaggedCategoryCount].
 */
export function consolidationOpportunity(rows: MasterRow[]): [number, number] {
  if (rows.length === 0) return [0, 0];
  const stats = categoryStats(rows, "vendor");
  if (stats.length === 0) return [0, 0];

  const medianCount = median(stats.map((c) => c.nSuppliers));
  const fragCats = new Set(stats.filter((c) => c.nSuppliers > medianCount).map((c) => c.categoryL2));
  if (fragCats.size === 0) return [0, 0];

  // per-(category, vendor) spend within flagged categories
  const catTotals = new Map<string, number>();
  const supSpend = new Map<string, { cat: string; spend: number }>();
  for (const row of rows) {
    if (!fragCats.has(row.l2)) continue;
    catTotals.set(row.l2, (catTotals.get(row.l2) ?? 0) + row.value);
    const key = `${row.l2}${SEP}${row.vendor}`;
    const entry = supSpend.get(key);
    if (entry) entry.spend += row.value;
    else supSpend.set(key, { cat: row.l2, spend: row.value });
  }

  let tailSpend = 0;
  for (const { cat, spend } of supSpend.values()) {
    const total = catTotals.get(cat) ?? 0;
    const share = total > 0 ? spend / total : 0;
    if (share < TAIL_SHARE) tailSpend += spend;
  }
  return [tailSpend, fragCats.size];
}

/** All KPI-card values in one object. */
export function kpis(rows: MasterRow[], mode: GroupMode): KpiSet {
  if (rows.length === 0) {
    return {
      totalSuppliers: 0,
      avgSuppliers: 0,
      mostFragName: "-",
      mostFragCount: 0,
      fragIndex: 0,
      consolidationValue: 0,
      consolidationCats: 0,
    };
  }

  const activeSuppliers = new Set<string>();
  for (const row of rows) {
    if (row.active) activeSuppliers.add(supplierKey(row, mode));
  }

  const stats = categoryStats(rows, mode);
  const avgSuppliers = stats.length > 0 ? mean(stats.map((c) => c.nSuppliers)) : 0;

  let mostFragName = "-";
  let mostFragCount = 0;
  for (const stat of stats) {
    if (stat.nSuppliers > mostFragCount) {
      mostFragCount = stat.nSuppliers;
      mostFragName = stat.categoryL2;
    }
  }

  const [consolidationValue, consolidationCats] = consolidationOpportunity(rows);

  return {
    totalSuppliers: activeSuppliers.size,
    avgSuppliers,
    mostFragName,
    mostFragCount,
    fragIndex: fragmentationIndex(stats),
    consolidationValue,
    consolidationCats,
  };
}

// ---------------------------------------------------------------------------
// view builders
// ---------------------------------------------------------------------------

/**
 * BU (rows) × Category L1 (columns) matrix of distinct supplier counts and
 * spend. Columns ordered by total supplier count descending; BU rows sorted
 * ascending.
 */
export function heatmapMatrix(rows: MasterRow[], mode: GroupMode): HeatmapData {
  if (rows.length === 0) {
    return { plantNames: [], l1Order: [], counts: [], spend: [], maxCount: 0 };
  }

  const cellSuppliers = new Map<string, Set<string>>();
  const cellSpend = new Map<string, number>();
  const plantSet = new Set<string>();
  const l1Set = new Set<string>();

  for (const row of rows) {
    plantSet.add(row.plantName);
    l1Set.add(row.l1);
    const key = `${row.plantName}${SEP}${row.l1}`;
    let suppliers = cellSuppliers.get(key);
    if (!suppliers) {
      suppliers = new Set();
      cellSuppliers.set(key, suppliers);
    }
    suppliers.add(supplierKey(row, mode));
    cellSpend.set(key, (cellSpend.get(key) ?? 0) + row.value);
  }

  const plantNames = [...plantSet].sort((a, b) => a.localeCompare(b));
  const columnTotals = new Map<string, number>();
  for (const l1 of l1Set) {
    let total = 0;
    for (const plant of plantNames) {
      total += cellSuppliers.get(`${plant}${SEP}${l1}`)?.size ?? 0;
    }
    columnTotals.set(l1, total);
  }
  const l1Order = [...l1Set].sort(
    (a, b) => (columnTotals.get(b) ?? 0) - (columnTotals.get(a) ?? 0) || a.localeCompare(b)
  );

  let maxCount = 0;
  const counts = plantNames.map((plant) =>
    l1Order.map((l1) => {
      const count = cellSuppliers.get(`${plant}${SEP}${l1}`)?.size ?? 0;
      if (count > maxCount) maxCount = count;
      return count;
    })
  );
  const spend = plantNames.map((plant) => l1Order.map((l1) => cellSpend.get(`${plant}${SEP}${l1}`) ?? 0));

  return { plantNames, l1Order, counts, spend, maxCount };
}

/**
 * Top-N most fragmented L2 categories (descending) plus the median supplier
 * count across ALL categories in the selection.
 */
export function suppliersPerCategory(
  rows: MasterRow[],
  mode: GroupMode,
  topN = 20
): { stats: CategoryStat[]; median: number } {
  const stats = categoryStats(rows, mode);
  if (stats.length === 0) return { stats: [], median: 0 };
  const med = median(stats.map((c) => c.nSuppliers));
  const top = [...stats]
    .sort((a, b) => b.nSuppliers - a.nSuppliers || a.categoryL2.localeCompare(b.categoryL2))
    .slice(0, topN);
  return { stats: top, median: med };
}

/**
 * Sankey data for suppliers serving the SAME L2 category across ≥ minBus
 * business units: BU nodes on the left, the top-N shared suppliers (by spend
 * within the overlap) on the right, link width = spend.
 */
export function crossBuOverlap(
  rows: MasterRow[],
  mode: GroupMode,
  topN = 12,
  minBus = 2
): SankeyData {
  const empty: SankeyData = { nodes: [], links: [] };
  if (rows.length === 0) return empty;

  // supplier × category → distinct BUs
  const pairPlants = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = `${supplierKey(row, mode)}${SEP}${row.l2}`;
    let plants = pairPlants.get(key);
    if (!plants) {
      plants = new Set();
      pairPlants.set(key, plants);
    }
    plants.add(row.plant);
  }

  const sharedSuppliers = new Set<string>();
  const validCats = new Set<string>();
  for (const [key, plants] of pairPlants) {
    if (plants.size >= minBus) {
      const [supplier, category] = key.split(SEP);
      sharedSuppliers.add(supplier);
      validCats.add(category);
    }
  }
  if (sharedSuppliers.size === 0) return empty;

  const sub = rows.filter(
    (row) => sharedSuppliers.has(supplierKey(row, mode)) && validCats.has(row.l2)
  );

  // rank shared suppliers by overlap spend, keep top N
  const supplierSpend = new Map<string, number>();
  for (const row of sub) {
    const key = supplierKey(row, mode);
    supplierSpend.set(key, (supplierSpend.get(key) ?? 0) + row.value);
  }
  const topSuppliers = [...supplierSpend.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key]) => key);
  const topSet = new Set(topSuppliers);

  const sub2 = sub.filter((row) => topSet.has(supplierKey(row, mode)));
  if (sub2.length === 0) return empty;

  // plant → supplier spend links
  const linkSpend = new Map<string, number>();
  const buSet = new Set<string>();
  for (const row of sub2) {
    buSet.add(row.plantName);
    const key = `${row.plantName}${SEP}${supplierKey(row, mode)}`;
    linkSpend.set(key, (linkSpend.get(key) ?? 0) + row.value);
  }

  const buNames = [...buSet].sort((a, b) => a.localeCompare(b));
  const names = supplierNameLookup(rows, mode);

  const nodes: SankeyData["nodes"] = [
    ...buNames.map((name) => ({ name, kind: "bu" as const })),
    ...topSuppliers.map((key) => ({ name: names.get(key) ?? key, kind: "supplier" as const })),
  ];
  const buIndex = new Map(buNames.map((name, i) => [name, i]));
  const supplierIndex = new Map(topSuppliers.map((key, i) => [key, buNames.length + i]));

  const links: SankeyData["links"] = [];
  for (const [key, value] of linkSpend) {
    const [plantName, supplier] = key.split(SEP);
    links.push({
      source: buIndex.get(plantName)!,
      target: supplierIndex.get(supplier)!,
      value,
      label: `${plantName} → ${names.get(supplier) ?? supplier}: ${formatInr(value, 2)}`,
    });
  }
  return { nodes, links };
}

/**
 * Quarterly fragmentation trend: average suppliers-per-category and total
 * supplier count, with quarters flagged where first-time supplier additions
 * spiked above mean + 1 population std dev.
 */
export function trend(rows: MasterRow[], mode: GroupMode): TrendPoint[] {
  if (rows.length === 0) return [];

  interface QuarterAcc {
    label: string;
    categorySuppliers: Map<string, Set<string>>;
    allSuppliers: Set<string>;
  }
  const byQuarter = new Map<string, QuarterAcc>();
  const firstSeen = new Map<string, string>();

  for (const row of rows) {
    const year = row.date.slice(0, 4);
    const q = Math.ceil(Number(row.date.slice(5, 7)) / 3);
    const quarter = `${year}Q${q}`;

    let acc = byQuarter.get(quarter);
    if (!acc) {
      acc = { label: `Q${q}-${year}`, categorySuppliers: new Map(), allSuppliers: new Set() };
      byQuarter.set(quarter, acc);
    }
    const key = supplierKey(row, mode);
    let catSet = acc.categorySuppliers.get(row.l2);
    if (!catSet) {
      catSet = new Set();
      acc.categorySuppliers.set(row.l2, catSet);
    }
    catSet.add(key);
    acc.allSuppliers.add(key);

    const seen = firstSeen.get(key);
    if (!seen || quarter < seen) firstSeen.set(key, quarter);
  }

  const newByQuarter = new Map<string, number>();
  for (const quarter of firstSeen.values()) {
    newByQuarter.set(quarter, (newByQuarter.get(quarter) ?? 0) + 1);
  }

  const points: TrendPoint[] = [...byQuarter.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([quarter, acc]) => ({
      quarter,
      quarterLabel: acc.label,
      avgSuppliers: mean([...acc.categorySuppliers.values()].map((s) => s.size)),
      totalSuppliers: acc.allSuppliers.size,
      newSuppliers: newByQuarter.get(quarter) ?? 0,
      spike: false,
    }));

  const newCounts = points.map((p) => p.newSuppliers);
  const threshold = mean(newCounts) + popStd(newCounts);
  for (const point of points) point.spike = point.newSuppliers > threshold;

  return points;
}

/**
 * Per (L2 category, BU) consolidation-opportunity rows: current vendor count,
 * top-3 vendors with spend share, spend, the count after parent-group
 * consolidation, and estimated savings on a 5%→15% ramp keyed to the
 * supplier-count reduction. Highlighted rows cut the count by > 50%.
 */
export function consolidationTable(rows: MasterRow[]): ConsolidationRow[] {
  if (rows.length === 0) return [];

  interface GroupAcc {
    categoryL2: string;
    plantName: string;
    vendors: Set<string>;
    parents: Set<string>;
    vendorSpend: Map<string, number>;
    totalSpend: number;
  }
  const groups = new Map<string, GroupAcc>();

  for (const row of rows) {
    const key = `${row.l2}${SEP}${row.plantName}`;
    let acc = groups.get(key);
    if (!acc) {
      acc = {
        categoryL2: row.l2,
        plantName: row.plantName,
        vendors: new Set(),
        parents: new Set(),
        vendorSpend: new Map(),
        totalSpend: 0,
      };
      groups.set(key, acc);
    }
    acc.vendors.add(row.vendor);
    acc.parents.add(row.parent ?? `solo:${row.vendor}`);
    acc.vendorSpend.set(row.vendorName, (acc.vendorSpend.get(row.vendorName) ?? 0) + row.value);
    acc.totalSpend += row.value;
  }

  const result: ConsolidationRow[] = [];
  for (const acc of groups.values()) {
    const current = acc.vendors.size;
    const consolidated = acc.parents.size;

    const top3 = [...acc.vendorSpend.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, spend]) => {
        const share = acc.totalSpend > 0 ? (spend / acc.totalSpend) * 100 : 0;
        const short = name.length <= 26 ? name : `${name.slice(0, 24)}…`;
        return `${short} (${share.toFixed(0)}%)`;
      })
      .join("; ");

    const reduction = current > 0 ? 1 - consolidated / current : 0;
    // savings ramp: 5% at 50% reduction → 15% at 100%; scaled down below 50%
    const rate =
      reduction >= 0.5
        ? SAVINGS_MIN + ((SAVINGS_MAX - SAVINGS_MIN) * (reduction - 0.5)) / 0.5
        : SAVINGS_MIN * (reduction / 0.5);

    result.push({
      categoryL2: acc.categoryL2,
      plantName: acc.plantName,
      currentSuppliers: current,
      top3,
      totalSpend: acc.totalSpend,
      consolidatedSuppliers: consolidated,
      reductionPct: Math.round(reduction * 1000) / 10,
      estSavings: acc.totalSpend * rate,
      highlight: reduction > 0.5,
    });
  }

  // deterministic base order (category, BU), then highlight/savings ranking —
  // JS sort is stable, so ties keep the base order like the prototype.
  result.sort(
    (a, b) =>
      a.categoryL2.localeCompare(b.categoryL2) || a.plantName.localeCompare(b.plantName)
  );
  result.sort((a, b) => Number(b.highlight) - Number(a.highlight) || b.estSavings - a.estSavings);
  return result;
}

/**
 * Bubble-chart data: category stats plus the median spend / median supplier
 * count used for the quadrant guides.
 */
export function bubbleData(
  rows: MasterRow[],
  mode: GroupMode
): { stats: CategoryStat[]; medSpend: number; medSup: number } {
  const stats = categoryStats(rows, mode);
  if (stats.length === 0) return { stats, medSpend: 0, medSup: 0 };
  return {
    stats,
    medSpend: median(stats.map((c) => c.spend)),
    medSup: median(stats.map((c) => c.nSuppliers)),
  };
}

// ---------------------------------------------------------------------------
// AI-style insight summary
// ---------------------------------------------------------------------------

/**
 * Short natural-language fragmentation insight comparing the current vendor
 * base to parent-company consolidation. Deterministic string templating (not
 * an LLM call), computed from the global filters only — the transient chart
 * click does not change it.
 */
export function generateInsight(masterRows: MasterRow[], filters: GlobalFilters): InsightSegment[] {
  const rows = applyFilters(masterRows, filters);
  if (rows.length === 0) {
    return [{ text: "No purchasing activity matches the current filters." }];
  }

  const statsVendor = categoryStats(rows, "vendor");
  if (statsVendor.length === 0) {
    return [{ text: "No purchasing activity matches the current filters." }];
  }

  let top = statsVendor[0];
  for (const stat of statsVendor) {
    if (stat.nSuppliers > top.nSuppliers) top = stat;
  }
  const cat = top.categoryL2;
  const nVendors = top.nSuppliers;

  const catRows = rows.filter((row) => row.l2 === cat);
  const buSet = new Set(catRows.map((row) => row.plantName));
  const parentSet = new Set(catRows.map((row) => row.parent ?? `solo:${row.vendor}`));
  const nBu = buSet.size;
  const nParent = parentSet.size;

  // savings estimate for this category if consolidated to parent groups
  const totalSpend = catRows.reduce((s, row) => s + row.value, 0);
  const reduction = nVendors > 0 ? 1 - nParent / nVendors : 0;
  const rate = SAVINGS_MIN + (SAVINGS_MAX - SAVINGS_MIN) * Math.max(0, reduction);
  const savings = totalSpend * rate * (reduction > 0.15 ? 1 : 0.4);

  const [consValue, consCats] = consolidationOpportunity(rows);

  const segments: InsightSegment[] = [
    { text: "Your top fragmentation risk is " },
    { text: cat, strong: true },
    { text: " with " },
    { text: `${nVendors} suppliers`, strong: true },
    { text: " across " },
    { text: `${nBu} business unit${nBu !== 1 ? "s" : ""}`, strong: true },
    { text: ". " },
  ];

  if (nParent < nVendors) {
    segments.push(
      { text: "Consolidating to parent groups reduces this to " },
      { text: String(nParent), strong: true },
      { text: ` (${(reduction * 100).toFixed(0)}% fewer). Estimated annual savings on this category alone: ` },
      { text: formatInr(savings, 2), strong: true },
      { text: ". " }
    );
  } else {
    segments.push({ text: "These are already independent suppliers with no shared parent. " });
  }

  segments.push(
    { text: "Across the portfolio, " },
    { text: `${consCats} categories`, strong: true },
    { text: " are over-fragmented, representing " },
    { text: formatInr(consValue, 2), strong: true },
    { text: " of consolidatable tail spend." }
  );
  return segments;
}
