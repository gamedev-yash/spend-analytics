// Makes every sidebar filter on /tail-spend actually change what's on screen.
//
// TailSpendData is a mix of two kinds of numbers:
//   - Row-level tables that carry a real dimension (categoryBreakdown by
//     category, supplierBubbles/sapSupplierReport/supplierSpendRank by
//     supplier, monthlyTrend by month) — these can be filtered EXACTLY.
//   - Pre-aggregated headline scalars (kpi, sapKpiRibbon, paretoDeciles,
//     segmentComparison, invoiceValueBuckets) that have no row-level backing
//     in any of the three data sources (mock, CSV upload, warehouse) — these
//     can only be estimated by PROPORTIONAL SCALING, the same interpolation
//     idiom tailSpendMock.ts already uses for the micro-PO threshold slider
//     (estimateMicroPOStats). A combined "spend fraction" — how much of the
//     portfolio the active filters keep — is computed from whichever exact
//     tables exist, then applied to every headline number.
//
// This runs identically over mock, CSV-derived, and warehouse-derived data:
// it only reads the final TailSpendData shape, so it doesn't need to know
// which of the three produced it.

import type {
  CategoryTailBreakdown,
  ConsolidationCandidate,
  InvoiceValueBucket,
  KPISummary,
  MonthlyTrendPoint,
  ParetoDecile,
  SapCategoryRow,
  SapKpiRibbon,
  SapSupplierReportRow,
  SegmentComparison,
  SupplierBubblePoint,
  SupplierSpendRank,
  TailSpendData,
} from "../tailSpendMock";

export const ALL_CATEGORIES = "All Categories";
export const ALL_SUPPLIERS = "All Suppliers";
export const ALL_PLANTS = "All Plants/Sites";

export interface TailSpendFilterInputs {
  category: string;
  supplierGlobalUltimate: string;
  dateFrom: string;
  dateTo: string;
  selectedBuckets: Set<string>;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug 2025" -> 202508, for numeric range comparison. Unparseable labels return null (kept, never hidden). */
function monthLabelToKey(label: string): number | null {
  const match = /^([A-Za-z]{3})\s+(\d{4})$/.exec(label.trim());
  if (!match) return null;
  const monthIndex = MONTH_NAMES.indexOf(match[1]);
  if (monthIndex < 0) return null;
  return Number(match[2]) * 100 + (monthIndex + 1);
}

/** "2026-01-31" -> 202601. */
function isoDateToKey(iso: string): number {
  return Number(iso.slice(0, 4)) * 100 + Number(iso.slice(5, 7));
}

function monthInRange(label: string, dateFrom: string, dateTo: string): boolean {
  const key = monthLabelToKey(label);
  if (key === null) return true;
  return key >= isoDateToKey(dateFrom) && key <= isoDateToKey(dateTo);
}

function round(value: number): number {
  return Math.round(value);
}

// ---------------------------------------------------------------------------
// Exact filtering — tables with a real category/supplier/month dimension
// ---------------------------------------------------------------------------

function filterByCategory(
  data: TailSpendData,
  category: string
): { categoryBreakdown: CategoryTailBreakdown[]; sapCategoryRows: SapCategoryRow[]; categoryFraction: number } {
  if (category === ALL_CATEGORIES) {
    return { categoryBreakdown: data.categoryBreakdown, sapCategoryRows: data.sapCategoryRows, categoryFraction: 1 };
  }
  const totalSpend = data.categoryBreakdown.reduce((sum, c) => sum + c.totalSpend, 0);
  const categoryBreakdown = data.categoryBreakdown.filter((c) => c.category === category);
  const sapCategoryRows = data.sapCategoryRows.filter((c) => c.category === category);
  const matchedSpend = categoryBreakdown.reduce((sum, c) => sum + c.totalSpend, 0);
  return { categoryBreakdown, sapCategoryRows, categoryFraction: totalSpend > 0 ? matchedSpend / totalSpend : 1 };
}

/**
 * The supplier dimension is scattered across three sample-sized tables
 * (supplierBubbles, sapSupplierReport, supplierSpendRank) rather than one
 * canonical list, so the match — and the fraction it implies — comes from
 * whichever table actually contains the selected name.
 */
function filterBySupplier(
  data: TailSpendData,
  supplier: string
): {
  supplierBubbles: SupplierBubblePoint[];
  consolidationCandidates: ConsolidationCandidate[];
  sapSupplierReport: SapSupplierReportRow[];
  supplierSpendRank: SupplierSpendRank[];
  supplierFraction: number;
} {
  if (supplier === ALL_SUPPLIERS) {
    return {
      supplierBubbles: data.supplierBubbles,
      consolidationCandidates: data.consolidationCandidates,
      sapSupplierReport: data.sapSupplierReport,
      supplierSpendRank: data.supplierSpendRank,
      supplierFraction: 1,
    };
  }

  let supplierFraction = 1;
  const spendLists: { supplierName: string; totalSpend: number }[][] = [
    data.supplierBubbles,
    data.sapSupplierReport.map((r) => ({ supplierName: r.supplierName, totalSpend: r.spend })),
    data.supplierSpendRank,
  ];
  for (const rows of spendLists) {
    const total = rows.reduce((sum, r) => sum + r.totalSpend, 0);
    const matched = rows.filter((r) => r.supplierName === supplier).reduce((sum, r) => sum + r.totalSpend, 0);
    if (total > 0 && matched > 0) {
      supplierFraction = matched / total;
      break;
    }
  }

  return {
    supplierBubbles: data.supplierBubbles.filter((s) => s.supplierName === supplier),
    consolidationCandidates: data.consolidationCandidates.filter((c) => c.supplierName === supplier),
    sapSupplierReport: data.sapSupplierReport.filter((s) => s.supplierName === supplier),
    supplierSpendRank: data.supplierSpendRank.filter((s) => s.supplierName === supplier),
    supplierFraction,
  };
}

function filterByDateRange(
  data: TailSpendData,
  dateFrom: string,
  dateTo: string
): { monthlyTrend: MonthlyTrendPoint[]; dateFraction: number } {
  const all = data.monthlyTrend;
  if (all.length === 0) return { monthlyTrend: all, dateFraction: 1 };

  const totalSpend = all.reduce((sum, m) => sum + m.strategicSpend + m.coreSpend + m.tailSpend, 0);
  const monthlyTrend = all.filter((m) => monthInRange(m.month, dateFrom, dateTo));
  if (monthlyTrend.length === all.length) return { monthlyTrend: all, dateFraction: 1 };

  const matchedSpend = monthlyTrend.reduce((sum, m) => sum + m.strategicSpend + m.coreSpend + m.tailSpend, 0);
  return { monthlyTrend, dateFraction: totalSpend > 0 ? matchedSpend / totalSpend : 1 };
}

// ---------------------------------------------------------------------------
// Proportional scaling — headline numbers with no row-level backing
// ---------------------------------------------------------------------------

function scaleKpi(kpi: KPISummary, factor: number): KPISummary {
  return {
    ...kpi,
    totalAnnualSpend: round(kpi.totalAnnualSpend * factor),
    totalPOCount: round(kpi.totalPOCount * factor),
    totalActiveSuppliers: round(kpi.totalActiveSuppliers * factor),
    tailSpendValue: round(kpi.tailSpendValue * factor),
    tailPOCount: round(kpi.tailPOCount * factor),
    microPOCount: round(kpi.microPOCount * factor),
    microPOProcessingCost: round(kpi.microPOProcessingCost * factor),
    tailSupplierCount: round(kpi.tailSupplierCount * factor),
    singleUseSupplierCount: round(kpi.singleUseSupplierCount * factor),
    potentialConsolidationSavings: round(kpi.potentialConsolidationSavings * factor),
    // tailSpendPercentOfValue, tailSpendPercentOfPOs, microPOPercentOfTotalPOs,
    // microPOThreshold, avgPOProcessingCost: relative shares or unit costs —
    // scaling them would be meaningless, so they carry over unchanged.
  };
}

function scaleSapKpiRibbon(ribbon: SapKpiRibbon, factor: number): SapKpiRibbon {
  return {
    ...ribbon,
    invoiceCount: round(ribbon.invoiceCount * factor),
    supplierCountGlobalUltimate: round(ribbon.supplierCountGlobalUltimate * factor),
    // meanInvoiceAmountPerSupplier / meanInvoicesPerSupplier are per-supplier
    // averages — stable under proportional scaling, left as-is.
  };
}

function scaleParetoDeciles(deciles: ParetoDecile[], factor: number): ParetoDecile[] {
  return deciles.map((d) => ({ ...d, supplierCount: round(d.supplierCount * factor) }));
}

function scaleSegmentComparison(segments: SegmentComparison[], factor: number): SegmentComparison[] {
  return segments.map((s) => ({
    ...s,
    supplierCount: round(s.supplierCount * factor),
    poCount: round(s.poCount * factor),
    spendValue: round(s.spendValue * factor),
    processingCost: round(s.processingCost * factor),
  }));
}

function scaleInvoiceValueBuckets(buckets: InvoiceValueBucket[], factor: number): InvoiceValueBucket[] {
  return buckets.map((b) => ({ ...b, invoiceCount: round(b.invoiceCount * factor), spend: round(b.spend * factor) }));
}

function scaleMonthlyTrend(points: MonthlyTrendPoint[], factor: number): MonthlyTrendPoint[] {
  return points.map((m) => ({
    ...m,
    strategicSpend: round(m.strategicSpend * factor),
    coreSpend: round(m.coreSpend * factor),
    tailSpend: round(m.tailSpend * factor),
  }));
}

/**
 * Category tables are already isolated to the selected category (or left
 * whole for "All"); this scales them by every OTHER active filter
 * (supplier/date/bucket) — generalizing the pre-existing behavior where the
 * category chart already scaled by bucket selection alone.
 */
function scaleCategoryTables(
  categoryBreakdown: CategoryTailBreakdown[],
  sapCategoryRows: SapCategoryRow[],
  factor: number
): { categoryBreakdown: CategoryTailBreakdown[]; sapCategoryRows: SapCategoryRow[] } {
  return {
    categoryBreakdown: categoryBreakdown.map((c) => ({
      ...c,
      strategicSpend: round(c.strategicSpend * factor),
      coreSpend: round(c.coreSpend * factor),
      tailSpend: round(c.tailSpend * factor),
      totalSpend: round(c.totalSpend * factor),
      supplierCount: round(c.supplierCount * factor),
      tailSupplierCount: round(c.tailSupplierCount * factor),
      // tailPercent: ratio of two co-scaled figures, stays valid unchanged.
    })),
    sapCategoryRows: sapCategoryRows.map((c) => ({
      ...c,
      supplierCount: round(c.supplierCount * factor),
      spend: round(c.spend * factor),
    })),
  };
}

/** Same idea as scaleCategoryTables, mirrored for the supplier-dimension tables. */
function scaleSupplierTables(
  supplierBubbles: SupplierBubblePoint[],
  consolidationCandidates: ConsolidationCandidate[],
  sapSupplierReport: SapSupplierReportRow[],
  supplierSpendRank: SupplierSpendRank[],
  factor: number
): {
  supplierBubbles: SupplierBubblePoint[];
  consolidationCandidates: ConsolidationCandidate[];
  sapSupplierReport: SapSupplierReportRow[];
  supplierSpendRank: SupplierSpendRank[];
} {
  return {
    supplierBubbles: supplierBubbles.map((s) => ({
      ...s,
      poCount: round(s.poCount * factor),
      totalSpend: round(s.totalSpend * factor),
    })),
    consolidationCandidates: consolidationCandidates.map((c) => ({
      ...c,
      poCount: round(c.poCount * factor),
      microPOCount: round(c.microPOCount * factor),
      totalSpend: round(c.totalSpend * factor),
      processingCost: round(c.processingCost * factor),
      potentialSavings: round(c.potentialSavings * factor),
    })),
    sapSupplierReport: sapSupplierReport.map((s) => ({
      ...s,
      invoiceCount: round(s.invoiceCount * factor),
      spend: round(s.spend * factor),
    })),
    supplierSpendRank: supplierSpendRank.map((s) => ({ ...s, totalSpend: round(s.totalSpend * factor) })),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Re-derives the full page shape under the active filters. Every table that
 * carries the filtered dimension is filtered exactly; every headline number
 * that doesn't is scaled by the combined fraction those exact filters imply.
 * Plant/BU is deliberately absent here — no TailSpendData field carries real
 * plant identity for mock or warehouse data, so it can't be estimated this
 * way; see fromDataset.ts for the one path (CSV transaction-grain uploads)
 * where plant filtering can be exact instead.
 */
export function applyTailSpendFilters(data: TailSpendData, filters: TailSpendFilterInputs): TailSpendData {
  const { category, supplierGlobalUltimate, dateFrom, dateTo, selectedBuckets } = filters;

  const categoryResult = filterByCategory(data, category);
  const supplierResult = filterBySupplier(data, supplierGlobalUltimate);
  const { monthlyTrend, dateFraction } = filterByDateRange(data, dateFrom, dateTo);

  const allBucketsSelected = selectedBuckets.size >= data.invoiceValueBuckets.length;
  const bucketFraction = allBucketsSelected
    ? 1
    : data.invoiceValueBuckets
        .filter((b) => selectedBuckets.has(b.bucketLabel))
        .reduce((sum, b) => sum + b.spendPercent, 0) / 100;

  // Headline scalars fold in every active filter; the bucket histogram itself
  // must not scale by its own selection (that would be circular), so it only
  // reflects date/category/supplier narrowing.
  const combinedFraction = Math.max(
    0,
    dateFraction * bucketFraction * categoryResult.categoryFraction * supplierResult.supplierFraction
  );
  const nonBucketFraction = Math.max(0, dateFraction * categoryResult.categoryFraction * supplierResult.supplierFraction);
  // Category tables are already isolated to the chosen category; what's left
  // to fold in is everything ELSE — supplier/date/bucket. Mirrored for the
  // supplier tables. This is the same idea the original code used to scale
  // supplier ranking by bucket selection, generalized to every filter.
  const categoryOtherFraction = Math.max(0, dateFraction * bucketFraction * supplierResult.supplierFraction);
  const supplierOtherFraction = Math.max(0, dateFraction * bucketFraction * categoryResult.categoryFraction);

  const categoryTables = scaleCategoryTables(
    categoryResult.categoryBreakdown,
    categoryResult.sapCategoryRows,
    categoryOtherFraction
  );
  const supplierTables = scaleSupplierTables(
    supplierResult.supplierBubbles,
    supplierResult.consolidationCandidates,
    supplierResult.sapSupplierReport,
    supplierResult.supplierSpendRank,
    supplierOtherFraction
  );

  return {
    ...data,
    kpi: scaleKpi(data.kpi, combinedFraction),
    sapKpiRibbon: scaleSapKpiRibbon(data.sapKpiRibbon, combinedFraction),
    paretoDeciles: scaleParetoDeciles(data.paretoDeciles, combinedFraction),
    segmentComparison: scaleSegmentComparison(data.segmentComparison, combinedFraction),
    invoiceValueBuckets: scaleInvoiceValueBuckets(data.invoiceValueBuckets, nonBucketFraction),
    monthlyTrend: scaleMonthlyTrend(monthlyTrend, nonBucketFraction),
    ...categoryTables,
    ...supplierTables,
  };
}
