import "server-only";

import {
  vendors,
  categories,
  plants,
  poItems,
  invoices,
  vendorById,
  categoryByCode,
  L1_CATEGORIES,
  PLANT_LIST,
} from "@/lib/sap/raw-data";
import type { SapFilters, SpendType } from "@/lib/sap/types";

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export function getFilterOptions() {
  return {
    plants: PLANT_LIST.map((p) => ({ code: p.plant_code, name: p.plant_name })),
    categoriesL1: L1_CATEGORIES,
    dateMin: "2023-01-01",
    dateMax: "2025-12-31",
  };
}

interface NormalizedRecord {
  date: string;
  vendorId: string;
  categoryCode: string;
  plantCode: string;
  value: number;
  /** true = PO with no contract_number (off-contract); for invoices, true = no po_number (non-PO spend). */
  flagged: boolean;
  source: "po" | "invoice";
}

function inDateRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function matchesCategoryPath(categoryCode: string, categoryPath?: string): boolean {
  if (!categoryPath) return true;
  const cat = categoryByCode.get(categoryCode);
  if (!cat) return false;
  const [l1, l2] = categoryPath.split("|");
  if (l2) return cat.category_l1 === l1 && cat.category_l2 === l2;
  return cat.category_l1 === l1;
}

function getFilteredPoItems(filters: SapFilters) {
  return poItems.filter((p) => {
    if (p.is_deleted) return false;
    if (filters.plants?.length && !filters.plants.includes(p.plant_code)) return false;
    if (filters.categoriesL1?.length) {
      const cat = categoryByCode.get(p.category_code);
      if (!cat || !filters.categoriesL1.includes(cat.category_l1)) return false;
    }
    if (!inDateRange(p.po_date, filters.dateFrom, filters.dateTo)) return false;
    if (filters.vendorId && p.vendor_id !== filters.vendorId) return false;
    if (!matchesCategoryPath(p.category_code, filters.categoryPath)) return false;
    return true;
  });
}

function getFilteredInvoices(filters: SapFilters) {
  return invoices.filter((inv) => {
    if (filters.plants?.length && !filters.plants.includes(inv.plant_code)) return false;
    if (filters.categoriesL1?.length) {
      const cat = categoryByCode.get(inv.category_code);
      if (!cat || !filters.categoriesL1.includes(cat.category_l1)) return false;
    }
    if (!inDateRange(inv.invoice_date, filters.dateFrom, filters.dateTo)) return false;
    if (filters.vendorId && inv.vendor_id !== filters.vendorId) return false;
    if (!matchesCategoryPath(inv.category_code, filters.categoryPath)) return false;
    return true;
  });
}

/** Normalized records for the currently selected spend basis (PO / Invoice / Both). */
function getActiveRecords(filters: SapFilters, spendType: SpendType = filters.spendType ?? "po"): NormalizedRecord[] {
  const records: NormalizedRecord[] = [];
  if (spendType === "po" || spendType === "both") {
    for (const p of getFilteredPoItems(filters)) {
      records.push({
        date: p.po_date,
        vendorId: p.vendor_id,
        categoryCode: p.category_code,
        plantCode: p.plant_code,
        value: p.net_value_inr,
        flagged: !p.contract_number,
        source: "po",
      });
    }
  }
  if (spendType === "invoice" || spendType === "both") {
    for (const inv of getFilteredInvoices(filters)) {
      records.push({
        date: inv.invoice_date,
        vendorId: inv.vendor_id,
        categoryCode: inv.category_code,
        plantCode: inv.plant_code,
        value: inv.invoice_value_inr,
        flagged: !inv.po_number,
        source: "invoice",
      });
    }
  }
  return records;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function shiftYear(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// KPI headline
// ---------------------------------------------------------------------------

export interface HeadlineKpis {
  totalSpendInr: number;
  invoiceCount: number;
  poCount: number;
  activeSupplierCount: number;
  avgPoValueInr: number;
  yoyChangePercent: number;
  offContractPercent: number;
}

export function getHeadlineKpis(filters: SapFilters): HeadlineKpis {
  const records = getActiveRecords(filters);
  const totalSpendInr = records.reduce((s, r) => s + r.value, 0);
  const poRecords = records.filter((r) => r.source === "po");
  const invoiceCount = getFilteredInvoices(filters).length;
  const activeSupplierCount = new Set(records.map((r) => r.vendorId)).size;
  const avgPoValueInr = records.length ? totalSpendInr / records.length : 0;

  // YoY: current window vs the same-length window one year earlier.
  const priorFilters: SapFilters = {
    ...filters,
    dateFrom: filters.dateFrom ? shiftYear(filters.dateFrom, -1) : undefined,
    dateTo: filters.dateTo ? shiftYear(filters.dateTo, -1) : undefined,
  };
  const priorTotal = filters.dateFrom && filters.dateTo
    ? getActiveRecords(priorFilters).reduce((s, r) => s + r.value, 0)
    : 0;
  const yoyChangePercent = priorTotal > 0 ? round2(((totalSpendInr - priorTotal) / priorTotal) * 100) : 0;

  const offContractValue = poRecords.filter((r) => r.flagged).reduce((s, r) => s + r.value, 0);
  const poTotal = poRecords.reduce((s, r) => s + r.value, 0);
  const offContractPercent = poTotal > 0 ? round2((offContractValue / poTotal) * 100) : 0;

  return {
    totalSpendInr: round2(totalSpendInr),
    invoiceCount,
    poCount: poRecords.length || records.length,
    activeSupplierCount,
    avgPoValueInr: round2(avgPoValueInr),
    yoyChangePercent,
    offContractPercent,
  };
}

// ---------------------------------------------------------------------------
// View 1 — Category Treemap (L1 -> L2)
// ---------------------------------------------------------------------------

export interface TreemapNode {
  id: string;
  label: string;
  parent: string;
  value: number;
  yoyChangePercent: number;
  supplierCount: number;
  poCount: number;
  percentOfTotal: number;
}

export function getCategoryTreemapData(filters: SapFilters): TreemapNode[] {
  const records = getActiveRecords(filters);
  const total = records.reduce((s, r) => s + r.value, 0) || 1;

  const priorFilters: SapFilters = {
    ...filters,
    dateFrom: filters.dateFrom ? shiftYear(filters.dateFrom, -1) : shiftYear("2025-01-01", -1),
    dateTo: filters.dateTo ? shiftYear(filters.dateTo, -1) : shiftYear("2025-12-31", -1),
  };
  const priorRecords = getActiveRecords(priorFilters);

  function bucket(recs: typeof records, keyFn: (categoryCode: string) => string) {
    const map = new Map<string, { value: number; suppliers: Set<string>; count: number }>();
    for (const r of recs) {
      const key = keyFn(r.categoryCode);
      const entry = map.get(key) ?? { value: 0, suppliers: new Set(), count: 0 };
      entry.value += r.value;
      entry.suppliers.add(r.vendorId);
      entry.count += 1;
      map.set(key, entry);
    }
    return map;
  }

  const byL1 = bucket(records, (code) => categoryByCode.get(code)?.category_l1 ?? "Other");
  const byL1Prior = bucket(priorRecords, (code) => categoryByCode.get(code)?.category_l1 ?? "Other");
  const byL2 = bucket(records, (code) => {
    const c = categoryByCode.get(code);
    return c ? `${c.category_l1}|${c.category_l2}` : "Other|Other";
  });
  const byL2Prior = bucket(priorRecords, (code) => {
    const c = categoryByCode.get(code);
    return c ? `${c.category_l1}|${c.category_l2}` : "Other|Other";
  });

  const nodes: TreemapNode[] = [{ id: "All Spend", label: "All Spend", parent: "", value: total, yoyChangePercent: 0, supplierCount: new Set(records.map((r) => r.vendorId)).size, poCount: records.length, percentOfTotal: 100 }];

  for (const [l1, entry] of byL1.entries()) {
    const prior = byL1Prior.get(l1)?.value ?? 0;
    const yoy = prior > 0 ? round2(((entry.value - prior) / prior) * 100) : 0;
    nodes.push({
      id: l1,
      label: l1,
      parent: "All Spend",
      value: round2(entry.value),
      yoyChangePercent: yoy,
      supplierCount: entry.suppliers.size,
      poCount: entry.count,
      percentOfTotal: round2((entry.value / total) * 100),
    });
  }
  for (const [key, entry] of byL2.entries()) {
    const [l1, l2] = key.split("|");
    const prior = byL2Prior.get(key)?.value ?? 0;
    const yoy = prior > 0 ? round2(((entry.value - prior) / prior) * 100) : 0;
    nodes.push({
      id: key,
      label: l2,
      parent: l1,
      value: round2(entry.value),
      yoyChangePercent: yoy,
      supplierCount: entry.suppliers.size,
      poCount: entry.count,
      percentOfTotal: round2((entry.value / total) * 100),
    });
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// View 2 — Top Suppliers (Pareto)
// ---------------------------------------------------------------------------

export interface TopSupplierRow {
  key: string;
  displayName: string;
  totalValue: number;
  byL1: Record<string, number>;
  cumulativePercent: number;
}

export function getTopSuppliersData(filters: SapFilters, limit = 20) {
  const records = getActiveRecords(filters);
  const total = records.reduce((s, r) => s + r.value, 0) || 1;

  const groups = new Map<string, { displayName: string; totalValue: number; byL1: Map<string, number> }>();
  for (const r of records) {
    const vendor = vendorById.get(r.vendorId);
    const key = vendor?.parent_company_group ?? r.vendorId;
    const displayName = vendor?.parent_company_group ?? vendor?.vendor_name ?? r.vendorId;
    const entry = groups.get(key) ?? { displayName, totalValue: 0, byL1: new Map() };
    entry.totalValue += r.value;
    const l1 = categoryByCode.get(r.categoryCode)?.category_l1 ?? "Other";
    entry.byL1.set(l1, (entry.byL1.get(l1) ?? 0) + r.value);
    groups.set(key, entry);
  }

  const sorted = Array.from(groups.entries())
    .map(([key, v]) => ({
      key,
      displayName: v.displayName,
      totalValue: round2(v.totalValue),
      byL1: Object.fromEntries(Array.from(v.byL1.entries()).map(([l1, val]) => [l1, round2(val)])),
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, limit);

  let cumulative = 0;
  const rows: TopSupplierRow[] = sorted.map((s) => {
    cumulative += s.totalValue;
    return { ...s, cumulativePercent: round2((cumulative / total) * 100) };
  });

  const top5Value = sorted.slice(0, 5).reduce((s, r) => s + r.totalValue, 0);
  const top5Percent = round2((top5Value / total) * 100);

  return { rows, top5Percent, allL1: Array.from(new Set(records.map((r) => categoryByCode.get(r.categoryCode)?.category_l1 ?? "Other"))) };
}

// ---------------------------------------------------------------------------
// View 3 — Spend Trend (always full 3-year history — that's its whole point)
// ---------------------------------------------------------------------------

export interface MonthlyTrendPoint {
  month: string; // "2023-01"
  total: number;
  byL1: Record<string, number>;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function allMonths(): string[] {
  const months: string[] = [];
  for (let y = 2023; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

export function getSpendTrendData(filters: SapFilters): MonthlyTrendPoint[] {
  // Ignore the date-range filter here on purpose — trend view always shows the full history.
  const trendFilters: SapFilters = { ...filters, dateFrom: undefined, dateTo: undefined };
  const records = getActiveRecords(trendFilters);
  const buckets = new Map<string, { total: number; byL1: Map<string, number> }>();
  for (const month of allMonths()) buckets.set(month, { total: 0, byL1: new Map() });

  for (const r of records) {
    const key = monthKey(r.date);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += r.value;
    const l1 = categoryByCode.get(r.categoryCode)?.category_l1 ?? "Other";
    bucket.byL1.set(l1, (bucket.byL1.get(l1) ?? 0) + r.value);
  }

  return allMonths().map((month) => {
    const b = buckets.get(month)!;
    return {
      month,
      total: round2(b.total),
      byL1: Object.fromEntries(Array.from(b.byL1.entries()).map(([l1, v]) => [l1, round2(v)])),
    };
  });
}

export interface SpikeMarker {
  month: string;
  total: number;
  deviation: number;
}

/** Months where total spend deviates > 2 std dev from its trailing 3-month average. */
export function getSpikeMarkers(trend: MonthlyTrendPoint[]): SpikeMarker[] {
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
  return spikes;
}

// ---------------------------------------------------------------------------
// View 4 — Spend by Business Unit / Geography
// ---------------------------------------------------------------------------

export interface BuSpendRow {
  plantCode: string;
  plantName: string;
  region: string;
  total: number;
  byL1: Record<string, number>;
  percentOfTotal: number;
}

export function getSpendByBuData(filters: SapFilters): BuSpendRow[] {
  const records = getActiveRecords(filters);
  const total = records.reduce((s, r) => s + r.value, 0) || 1;
  const byPlant = new Map<string, { total: number; byL1: Map<string, number> }>();

  for (const r of records) {
    const entry = byPlant.get(r.plantCode) ?? { total: 0, byL1: new Map() };
    entry.total += r.value;
    const l1 = categoryByCode.get(r.categoryCode)?.category_l1 ?? "Other";
    entry.byL1.set(l1, (entry.byL1.get(l1) ?? 0) + r.value);
    byPlant.set(r.plantCode, entry);
  }

  return plants
    .map((p) => {
      const entry = byPlant.get(p.plant_code) ?? { total: 0, byL1: new Map() };
      return {
        plantCode: p.plant_code,
        plantName: p.plant_name,
        region: p.region,
        total: round2(entry.total),
        byL1: Object.fromEntries(Array.from(entry.byL1.entries()).map(([l1, v]) => [l1, round2(v)])),
        percentOfTotal: round2((entry.total / total) * 100),
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// View 5 — Spend Composition Sunburst (BU -> L1 -> L2)
// ---------------------------------------------------------------------------

export interface SunburstNode {
  id: string;
  label: string;
  parent: string;
  value: number;
}

export function getSunburstData(filters: SapFilters): SunburstNode[] {
  const records = getActiveRecords(filters);
  const nodes = new Map<string, SunburstNode>();

  for (const r of records) {
    const plantName = plants.find((p) => p.plant_code === r.plantCode)?.plant_name ?? r.plantCode;
    const cat = categoryByCode.get(r.categoryCode);
    const l1 = cat?.category_l1 ?? "Other";
    const l2 = cat?.category_l2 ?? "Other";

    const buId = plantName;
    const l1Id = `${buId}|${l1}`;
    const l2Id = `${l1Id}|${l2}`;

    if (!nodes.has(buId)) nodes.set(buId, { id: buId, label: buId, parent: "", value: 0 });
    if (!nodes.has(l1Id)) nodes.set(l1Id, { id: l1Id, label: l1, parent: buId, value: 0 });
    if (!nodes.has(l2Id)) nodes.set(l2Id, { id: l2Id, label: l2, parent: l1Id, value: 0 });

    nodes.get(buId)!.value += r.value;
    nodes.get(l1Id)!.value += r.value;
    nodes.get(l2Id)!.value += r.value;
  }

  return Array.from(nodes.values()).map((n) => ({ ...n, value: round2(n.value) }));
}

// ---------------------------------------------------------------------------
// View 6 — Metrics Summary Table
// ---------------------------------------------------------------------------

export interface MetricsTableRow {
  category: string;
  totalSpendInr: number;
  percentOfTotal: number;
  supplierCount: number;
  poCount: number;
  avgPoValueInr: number;
  yoyChangePercent: number;
  offContractPercent: number;
}

export function getMetricsTableData(filters: SapFilters): MetricsTableRow[] {
  const records = getActiveRecords(filters);
  const poRecords = records.filter((r) => r.source === "po");
  const total = records.reduce((s, r) => s + r.value, 0) || 1;

  const priorFilters: SapFilters = {
    ...filters,
    dateFrom: filters.dateFrom ? shiftYear(filters.dateFrom, -1) : shiftYear("2025-01-01", -1),
    dateTo: filters.dateTo ? shiftYear(filters.dateTo, -1) : shiftYear("2025-12-31", -1),
  };
  const priorRecords = getActiveRecords(priorFilters);

  const byL1 = new Map<string, { total: number; suppliers: Set<string>; count: number; offContract: number; poTotal: number }>();
  for (const l1 of L1_CATEGORIES) byL1.set(l1, { total: 0, suppliers: new Set(), count: 0, offContract: 0, poTotal: 0 });

  for (const r of records) {
    const l1 = categoryByCode.get(r.categoryCode)?.category_l1 ?? "Other";
    const entry = byL1.get(l1);
    if (!entry) continue;
    entry.total += r.value;
    entry.suppliers.add(r.vendorId);
    entry.count += 1;
  }
  for (const r of poRecords) {
    const l1 = categoryByCode.get(r.categoryCode)?.category_l1 ?? "Other";
    const entry = byL1.get(l1);
    if (!entry) continue;
    entry.poTotal += r.value;
    if (r.flagged) entry.offContract += r.value;
  }
  const priorByL1 = new Map<string, number>();
  for (const r of priorRecords) {
    const l1 = categoryByCode.get(r.categoryCode)?.category_l1 ?? "Other";
    priorByL1.set(l1, (priorByL1.get(l1) ?? 0) + r.value);
  }

  return L1_CATEGORIES.map((l1) => {
    const entry = byL1.get(l1)!;
    const prior = priorByL1.get(l1) ?? 0;
    return {
      category: l1,
      totalSpendInr: round2(entry.total),
      percentOfTotal: round2((entry.total / total) * 100),
      supplierCount: entry.suppliers.size,
      poCount: entry.count,
      avgPoValueInr: entry.count ? round2(entry.total / entry.count) : 0,
      yoyChangePercent: prior > 0 ? round2(((entry.total - prior) / prior) * 100) : 0,
      offContractPercent: entry.poTotal > 0 ? round2((entry.offContract / entry.poTotal) * 100) : 0,
    };
  }).sort((a, b) => b.totalSpendInr - a.totalSpendInr);
}

// ---------------------------------------------------------------------------
// Insight summary text
// ---------------------------------------------------------------------------

export function generateInsightText(filters: SapFilters): string {
  const kpis = getHeadlineKpis(filters);
  const table = getMetricsTableData(filters);
  const byBu = getSpendByBuData(filters);
  const topCategory = table[0];
  const topBu = byBu[0];

  const crWhole = (inr: number) => Math.round(inr / 1e7).toLocaleString("en-IN");
  const parts = [
    `Total spend for the selected period is ₹${crWhole(kpis.totalSpendInr)} Cr across ${kpis.activeSupplierCount} active suppliers.`,
  ];
  if (topCategory) {
    parts.push(`${topCategory.category} dominates at ${topCategory.percentOfTotal.toFixed(0)}% of total spend.`);
  }
  if (topBu) {
    parts.push(`${topBu.plantName} is the highest-spending BU at ₹${crWhole(topBu.total)} Cr.`);
  }
  if (kpis.offContractPercent > 25) {
    parts.push(`Off-contract spend is ${kpis.offContractPercent.toFixed(0)}%, above the 25% threshold — review recommended.`);
  } else {
    parts.push(`Off-contract spend is ${kpis.offContractPercent.toFixed(0)}%, within the 25% threshold.`);
  }
  return parts.join(" ");
}

export { categories, vendors };
