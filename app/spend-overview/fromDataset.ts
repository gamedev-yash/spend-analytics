// Client-side equivalent of lib/sap/aggregate.ts for uploaded datasets.
//
// The server aggregation pipeline is "server-only" and bound to the static
// SAP mock tables, so when a CSV is uploaded for this page the same widget
// aggregations (KPIs, treemap, top suppliers, trend, BU split, sunburst,
// metrics table, insight text) are recomputed here in the browser from the
// flat denormalized rows (see scripts/convert-mock-to-csv.ts for the
// reference shape). Honors the same SapFilters the server path uses, so the
// URL-driven filter bar and cross-filter clicks keep working.

import type { Dataset } from "@/context/DatasetsContext";
import { cellBoolean, cellNumber, cellString, findColumn } from "@/lib/dataset-rows";
import type { SapFilters } from "@/lib/sap/types";
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

export interface SpendOverviewData {
  kpis: HeadlineKpis;
  insightText: string;
  treemapNodes: TreemapNode[];
  topSuppliers: { rows: TopSupplierRow[]; top5Percent: number; allL1: string[] };
  trend: MonthlyTrendPoint[];
  spikes: SpikeMarker[];
  buSpend: BuSpendRow[];
  sunburstNodes: SunburstNode[];
  plantNameToCode: Record<string, string>;
  metricsRows: MetricsTableRow[];
}

interface Record_ {
  date: string; // "YYYY-MM-DD"
  vendorId: string;
  vendorKey: string; // parent group ?? vendor name ?? vendor id — grouping key
  vendorName: string;
  l1: string;
  l2: string;
  plantCode: string;
  plantName: string;
  region: string;
  value: number;
  flagged: boolean; // off-contract (no contract number); false when column absent
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function shiftYear(dateStr: string, years: number): string {
  const [y, rest] = [dateStr.slice(0, 4), dateStr.slice(4)];
  return `${Number(y) + years}${rest}`;
}

function inDateRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/** Normalize any parseable date cell to "YYYY-MM-DD". */
function toIsoDate(raw: string): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseRecords(dataset: Dataset): Record_[] | null {
  const cols = {
    date: findColumn(dataset, ["po_date", "date", "invoice_date", "order_date"]),
    value: findColumn(dataset, ["net_value_inr", "amount", "invoice_value_inr", "value", "spend", "total"]),
    vendorId: findColumn(dataset, ["vendor_id", "vendorId", "supplier_id", "supplierId"]),
    vendorName: findColumn(dataset, ["vendor_name", "vendorName", "supplier_name", "supplierName", "vendor", "supplier"]),
    parentGroup: findColumn(dataset, ["parent_company_group", "global_ultimate_name", "parent_group"]),
    l1: findColumn(dataset, ["category_l1", "categoryL1", "category"]),
    l2: findColumn(dataset, ["category_l2", "categoryL2", "category_name", "subcategory"]),
    plantCode: findColumn(dataset, ["plant_code", "plantCode", "plant_id", "bu_code"]),
    plantName: findColumn(dataset, ["plant_name", "plantName", "plant", "business_unit", "site"]),
    region: findColumn(dataset, ["region"]),
    contract: findColumn(dataset, ["contract_number", "contractNumber", "contract"]),
    isDeleted: findColumn(dataset, ["is_deleted", "isDeleted", "deleted"]),
  };

  if (!cols.date || !cols.value) return null;

  const records: Record_[] = [];
  for (const row of dataset.rows) {
    if (cellBoolean(row, cols.isDeleted) === true) continue;
    const date = toIsoDate(cellString(row, cols.date));
    const value = cellNumber(row, cols.value);
    if (date === null || value === null) continue;

    const vendorId = cellString(row, cols.vendorId);
    const vendorName = cellString(row, cols.vendorName);
    const parentGroup = cellString(row, cols.parentGroup);
    const plantCode = cellString(row, cols.plantCode);
    const plantName = cellString(row, cols.plantName);

    records.push({
      date,
      vendorId: vendorId || vendorName || "UNKNOWN",
      vendorKey: parentGroup || vendorName || vendorId || "Unknown Supplier",
      vendorName: vendorName || parentGroup || vendorId || "Unknown Supplier",
      l1: cellString(row, cols.l1) || "Other",
      l2: cellString(row, cols.l2) || "Other",
      plantCode: plantCode || plantName || "UNKNOWN",
      plantName: plantName || plantCode || "Unknown BU",
      region: cellString(row, cols.region) || "Unknown",
      value,
      flagged: cols.contract ? cellString(row, cols.contract) === "" : false,
    });
  }
  return records.length > 0 ? records : null;
}

function applyFilters(records: Record_[], filters: SapFilters): Record_[] {
  const [pathL1, pathL2] = (filters.categoryPath ?? "").split("|");
  return records.filter((r) => {
    if (filters.plants?.length && !filters.plants.includes(r.plantCode)) return false;
    if (filters.categoriesL1?.length && !filters.categoriesL1.includes(r.l1)) return false;
    if (!inDateRange(r.date, filters.dateFrom, filters.dateTo)) return false;
    if (filters.vendorId && r.vendorKey !== filters.vendorId && r.vendorId !== filters.vendorId) return false;
    if (filters.categoryPath) {
      if (pathL2) {
        if (r.l1 !== pathL1 || r.l2 !== pathL2) return false;
      } else if (r.l1 !== pathL1) {
        return false;
      }
    }
    return true;
  });
}

/** Same-length window one year earlier; falls back to the latest full year - 1. */
function priorWindow(records: Record_[], filters: SapFilters): { from: string; to: string } {
  if (filters.dateFrom && filters.dateTo) {
    return { from: shiftYear(filters.dateFrom, -1), to: shiftYear(filters.dateTo, -1) };
  }
  const latestYear = records.reduce((max, r) => Math.max(max, Number(r.date.slice(0, 4))), 0);
  const prior = latestYear - 1;
  return { from: `${prior}-01-01`, to: `${prior}-12-31` };
}

// ---------------------------------------------------------------------------

export function buildSpendOverviewFromDataset(dataset: Dataset, filters: SapFilters): SpendOverviewData | null {
  const allRecords = parseRecords(dataset);
  if (!allRecords) return null;

  const records = applyFilters(allRecords, filters);
  const total = records.reduce((s, r) => s + r.value, 0);
  const prior = priorWindow(allRecords, filters);
  const priorRecords = applyFilters(allRecords, {
    ...filters,
    dateFrom: prior.from,
    dateTo: prior.to,
  });

  // --- KPIs -----------------------------------------------------------------

  const priorTotal = priorRecords.reduce((s, r) => s + r.value, 0);
  const flaggedValue = records.filter((r) => r.flagged).reduce((s, r) => s + r.value, 0);
  const kpis: HeadlineKpis = {
    totalSpendInr: round2(total),
    poCount: records.length,
    activeSupplierCount: new Set(records.map((r) => r.vendorId)).size,
    avgPoValueInr: records.length ? round2(total / records.length) : 0,
    yoyChangePercent:
      filters.dateFrom && filters.dateTo && priorTotal > 0
        ? round2(((total - priorTotal) / priorTotal) * 100)
        : 0,
    offContractPercent: total > 0 ? round2((flaggedValue / total) * 100) : 0,
  };

  // --- Treemap (All Spend -> L1 -> L2) ---------------------------------------

  type Bucket = { value: number; suppliers: Set<string>; count: number };
  function bucketBy(recs: Record_[], keyFn: (r: Record_) => string): Map<string, Bucket> {
    const map = new Map<string, Bucket>();
    for (const r of recs) {
      const key = keyFn(r);
      const entry = map.get(key) ?? { value: 0, suppliers: new Set<string>(), count: 0 };
      entry.value += r.value;
      entry.suppliers.add(r.vendorId);
      entry.count += 1;
      map.set(key, entry);
    }
    return map;
  }

  const safeTotal = total || 1;
  const byL1 = bucketBy(records, (r) => r.l1);
  const byL1Prior = bucketBy(priorRecords, (r) => r.l1);
  const byL2 = bucketBy(records, (r) => `${r.l1}|${r.l2}`);
  const byL2Prior = bucketBy(priorRecords, (r) => `${r.l1}|${r.l2}`);

  const yoyOf = (value: number, priorValue: number | undefined) =>
    priorValue && priorValue > 0 ? round2(((value - priorValue) / priorValue) * 100) : 0;

  const treemapNodes: TreemapNode[] = [
    {
      id: "All Spend",
      label: "All Spend",
      parent: "",
      value: safeTotal,
      yoyChangePercent: 0,
      supplierCount: new Set(records.map((r) => r.vendorId)).size,
      poCount: records.length,
      percentOfTotal: 100,
    },
  ];
  for (const [l1, entry] of byL1.entries()) {
    treemapNodes.push({
      id: l1,
      label: l1,
      parent: "All Spend",
      value: round2(entry.value),
      yoyChangePercent: yoyOf(entry.value, byL1Prior.get(l1)?.value),
      supplierCount: entry.suppliers.size,
      poCount: entry.count,
      percentOfTotal: round2((entry.value / safeTotal) * 100),
    });
  }
  for (const [key, entry] of byL2.entries()) {
    const [l1, l2] = key.split("|");
    treemapNodes.push({
      id: key,
      label: l2,
      parent: l1,
      value: round2(entry.value),
      yoyChangePercent: yoyOf(entry.value, byL2Prior.get(key)?.value),
      supplierCount: entry.suppliers.size,
      poCount: entry.count,
      percentOfTotal: round2((entry.value / safeTotal) * 100),
    });
  }

  // --- Top suppliers (Pareto) -------------------------------------------------

  const groups = new Map<string, { displayName: string; totalValue: number; byL1: Map<string, number> }>();
  for (const r of records) {
    const entry = groups.get(r.vendorKey) ?? { displayName: r.vendorKey, totalValue: 0, byL1: new Map() };
    entry.totalValue += r.value;
    entry.byL1.set(r.l1, (entry.byL1.get(r.l1) ?? 0) + r.value);
    groups.set(r.vendorKey, entry);
  }
  const sortedSuppliers = Array.from(groups.entries())
    .map(([key, v]) => ({
      key,
      displayName: v.displayName,
      totalValue: round2(v.totalValue),
      byL1: Object.fromEntries(Array.from(v.byL1.entries()).map(([l1, val]) => [l1, round2(val)])),
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 20);
  let cumulative = 0;
  const topSupplierRows: TopSupplierRow[] = sortedSuppliers.map((s) => {
    cumulative += s.totalValue;
    return { ...s, cumulativePercent: round2((cumulative / safeTotal) * 100) };
  });
  const top5Value = sortedSuppliers.slice(0, 5).reduce((s, r) => s + r.totalValue, 0);
  const topSuppliers = {
    rows: topSupplierRows,
    top5Percent: round2((top5Value / safeTotal) * 100),
    allL1: Array.from(new Set(records.map((r) => r.l1))),
  };

  // --- Monthly trend (full history of the dataset, ignoring the date filter) ---

  const trendRecords = applyFilters(allRecords, { ...filters, dateFrom: undefined, dateTo: undefined });
  const monthSet = new Set(trendRecords.map((r) => r.date.slice(0, 7)));
  const monthsSorted = Array.from(monthSet).sort();
  const months: string[] = [];
  if (monthsSorted.length > 0) {
    // Fill gaps so the axis is continuous from first to last month (capped at 10 years).
    const [firstY, firstM] = monthsSorted[0].split("-").map(Number);
    const [lastY, lastM] = monthsSorted[monthsSorted.length - 1].split("-").map(Number);
    const lastIdx = lastY * 12 + (lastM - 1);
    let idx = firstY * 12 + (firstM - 1);
    while (idx <= lastIdx && months.length < 120) {
      months.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
      idx += 1;
    }
  }
  const trendBuckets = new Map<string, { total: number; byL1: Map<string, number> }>();
  for (const month of months) trendBuckets.set(month, { total: 0, byL1: new Map() });
  for (const r of trendRecords) {
    const bucket = trendBuckets.get(r.date.slice(0, 7));
    if (!bucket) continue;
    bucket.total += r.value;
    bucket.byL1.set(r.l1, (bucket.byL1.get(r.l1) ?? 0) + r.value);
  }
  const trend: MonthlyTrendPoint[] = months.map((month) => {
    const b = trendBuckets.get(month)!;
    return {
      month,
      total: round2(b.total),
      byL1: Object.fromEntries(Array.from(b.byL1.entries()).map(([l1, v]) => [l1, round2(v)])),
    };
  });

  // Spike detection — same rolling 3-month, 2-sigma rule as the server path.
  const spikes: SpikeMarker[] = [];
  for (let i = 3; i < trend.length; i++) {
    const window = trend.slice(i - 3, i).map((t) => t.total);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
    const std = Math.sqrt(variance);
    if (std > 0 && Math.abs(trend[i].total - mean) > 2 * std) {
      spikes.push({ month: trend[i].month, total: trend[i].total, deviation: round2((trend[i].total - mean) / std) });
    }
  }

  // --- Spend by BU ------------------------------------------------------------

  const byPlant = new Map<string, { plantName: string; region: string; total: number; byL1: Map<string, number> }>();
  for (const r of records) {
    const entry = byPlant.get(r.plantCode) ?? { plantName: r.plantName, region: r.region, total: 0, byL1: new Map() };
    entry.total += r.value;
    entry.byL1.set(r.l1, (entry.byL1.get(r.l1) ?? 0) + r.value);
    byPlant.set(r.plantCode, entry);
  }
  const buSpend: BuSpendRow[] = Array.from(byPlant.entries())
    .map(([plantCode, entry]) => ({
      plantCode,
      plantName: entry.plantName,
      region: entry.region,
      total: round2(entry.total),
      byL1: Object.fromEntries(Array.from(entry.byL1.entries()).map(([l1, v]) => [l1, round2(v)])),
      percentOfTotal: round2((entry.total / safeTotal) * 100),
    }))
    .sort((a, b) => b.total - a.total);

  // --- Sunburst (BU -> L1 -> L2) ------------------------------------------------

  const sunburst = new Map<string, SunburstNode>();
  for (const r of records) {
    const buId = r.plantName;
    const l1Id = `${buId}|${r.l1}`;
    const l2Id = `${l1Id}|${r.l2}`;
    if (!sunburst.has(buId)) sunburst.set(buId, { id: buId, label: buId, parent: "", value: 0 });
    if (!sunburst.has(l1Id)) sunburst.set(l1Id, { id: l1Id, label: r.l1, parent: buId, value: 0 });
    if (!sunburst.has(l2Id)) sunburst.set(l2Id, { id: l2Id, label: r.l2, parent: l1Id, value: 0 });
    sunburst.get(buId)!.value += r.value;
    sunburst.get(l1Id)!.value += r.value;
    sunburst.get(l2Id)!.value += r.value;
  }
  const sunburstNodes = Array.from(sunburst.values()).map((n) => ({ ...n, value: round2(n.value) }));

  // --- Metrics table -------------------------------------------------------------

  const priorByL1 = new Map<string, number>();
  for (const r of priorRecords) priorByL1.set(r.l1, (priorByL1.get(r.l1) ?? 0) + r.value);

  const metricsRows: MetricsTableRow[] = Array.from(byL1.entries())
    .map(([l1, entry]) => {
      const flagged = records.filter((r) => r.l1 === l1 && r.flagged).reduce((s, r) => s + r.value, 0);
      return {
        category: l1,
        totalSpendInr: round2(entry.value),
        percentOfTotal: round2((entry.value / safeTotal) * 100),
        supplierCount: entry.suppliers.size,
        poCount: entry.count,
        avgPoValueInr: entry.count ? round2(entry.value / entry.count) : 0,
        yoyChangePercent: yoyOf(entry.value, priorByL1.get(l1)),
        offContractPercent: entry.value > 0 ? round2((flagged / entry.value) * 100) : 0,
      };
    })
    .sort((a, b) => b.totalSpendInr - a.totalSpendInr);

  // --- Insight text ----------------------------------------------------------------

  const crWhole = (inr: number) => Math.round(inr / 1e7).toLocaleString("en-IN");
  const topCategory = metricsRows[0];
  const topBu = buSpend[0];
  const insightParts = [
    `Total spend for the selected period is ₹${crWhole(kpis.totalSpendInr)} Cr across ${kpis.activeSupplierCount} active suppliers (uploaded dataset: ${dataset.name}).`,
  ];
  if (topCategory) {
    insightParts.push(`${topCategory.category} dominates at ${topCategory.percentOfTotal.toFixed(0)}% of total spend.`);
  }
  if (topBu) {
    insightParts.push(`${topBu.plantName} is the highest-spending BU at ₹${crWhole(topBu.total)} Cr.`);
  }
  if (kpis.offContractPercent > 25) {
    insightParts.push(`Off-contract spend is ${kpis.offContractPercent.toFixed(0)}%, above the 25% threshold — review recommended.`);
  } else {
    insightParts.push(`Off-contract spend is ${kpis.offContractPercent.toFixed(0)}%, within the 25% threshold.`);
  }

  const plantNameToCode = Object.fromEntries(
    Array.from(byPlant.entries()).map(([code, entry]) => [entry.plantName, code])
  );

  return {
    kpis,
    insightText: insightParts.join(" "),
    treemapNodes,
    topSuppliers,
    trend,
    spikes,
    buSpend,
    sunburstNodes,
    plantNameToCode,
    metricsRows,
  };
}
