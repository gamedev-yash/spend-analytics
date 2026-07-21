"use client";

import { useMemo, useState, type ReactNode } from "react";
import { tailSpendMock, estimateMicroPOStats } from "./tailSpendMock";
import { TailFilters, DEFAULT_TAIL_FILTERS, ALL_CATEGORIES, type TailFilterState } from "./components/TailFilters";
import {
  SapFilterPanel,
  defaultSapFilters,
  ALL_SUPPLIERS,
  type SapFilterState,
} from "./components/SapFilterPanel";
import { SapKpiRibbon } from "./components/SapKpiRibbon";
import { InvoiceValueBucketChart } from "./components/InvoiceValueBucketChart";
import { SupplierSpendRankChart } from "./components/SupplierSpendRankChart";
import { SpendByInvoiceValueDonut } from "./components/SpendByInvoiceValueDonut";
import { CategorySpendHybrid } from "./components/CategorySpendHybrid";
import { SapDetailTable } from "./components/SapDetailTable";
import { TailKPICards } from "./components/TailKPICards";
import { ParetoCurveChart } from "./components/ParetoCurveChart";
import { TailCategoryChart } from "./components/TailCategoryChart";
import { TailBubbleChart } from "./components/TailBubbleChart";
import { StrategicComparison } from "./components/StrategicComparison";
import { TailTrendChart } from "./components/TailTrendChart";
import { ConsolidationTable } from "./components/ConsolidationTable";
import { MicroPOAnalysis } from "./components/MicroPOAnalysis";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Widget({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-100">{title}</h3>
      {children}
    </div>
  );
}

export default function TailSpendPage() {
  const {
    kpi,
    paretoDeciles,
    categoryBreakdown,
    supplierBubbles,
    segmentComparison,
    monthlyTrend,
    consolidationCandidates,
    poValueBuckets,
    sapKpiRibbon,
    invoiceValueBuckets,
    supplierSpendRank,
    sapCategoryRows,
    sapSupplierReport,
    sapFilterOptions,
  } = tailSpendMock;

  const categoryNames = useMemo(() => categoryBreakdown.map((c) => c.category), [categoryBreakdown]);
  const supplierNames = useMemo(
    () => sapSupplierReport.map((s) => s.supplierName).sort((a, b) => a.localeCompare(b)),
    [sapSupplierReport]
  );

  // --- Tier 1: SAP Spend Control Tower state --------------------------------
  const [sapFilters, setSapFilters] = useState<SapFilterState>(() =>
    defaultSapFilters(sapFilterOptions.dateRanges[0])
  );
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(
    () => new Set(invoiceValueBuckets.map((b) => b.bucketLabel))
  );

  function toggleBucket(bucketLabel: string) {
    setSelectedBuckets((prev) => {
      const allSelected = prev.size === invoiceValueBuckets.length;
      if (allSelected) return new Set([bucketLabel]);
      const next = new Set(prev);
      if (next.has(bucketLabel)) {
        next.delete(bucketLabel);
      } else {
        next.add(bucketLabel);
      }
      return next.size === 0 ? new Set(invoiceValueBuckets.map((b) => b.bucketLabel)) : next;
    });
  }

  const selectedSpendFraction = useMemo(() => {
    const selectedPercent = invoiceValueBuckets
      .filter((b) => selectedBuckets.has(b.bucketLabel))
      .reduce((sum, b) => sum + b.spendPercent, 0);
    return selectedPercent / 100;
  }, [invoiceValueBuckets, selectedBuckets]);

  const scaledSupplierSpendRank = useMemo(
    () =>
      supplierSpendRank
        .filter((s) => sapFilters.supplierGlobalUltimate === ALL_SUPPLIERS || s.supplierName === sapFilters.supplierGlobalUltimate)
        .map((s) => ({ ...s, totalSpend: s.totalSpend * selectedSpendFraction })),
    [supplierSpendRank, sapFilters.supplierGlobalUltimate, selectedSpendFraction]
  );

  const scaledCategoryRows = useMemo(
    () =>
      sapCategoryRows
        .filter((c) => sapFilters.category === ALL_CATEGORIES || c.category === sapFilters.category)
        .map((c) => ({ ...c, spend: c.spend * selectedSpendFraction })),
    [sapCategoryRows, sapFilters.category, selectedSpendFraction]
  );

  const filteredSupplierReport = useMemo(
    () =>
      sapSupplierReport.filter(
        (r) => sapFilters.supplierGlobalUltimate === ALL_SUPPLIERS || r.supplierName === sapFilters.supplierGlobalUltimate
      ),
    [sapSupplierReport, sapFilters.supplierGlobalUltimate]
  );

  // --- Tier 2: Advanced AI & Optimization Insights state --------------------
  const [filters, setFilters] = useState<TailFilterState>(DEFAULT_TAIL_FILTERS);

  const sortedCategories = useMemo(
    () =>
      [...categoryBreakdown]
        .filter((c) => filters.category === ALL_CATEGORIES || c.category === filters.category)
        .sort((a, b) => b.tailPercent - a.tailPercent),
    [categoryBreakdown, filters.category]
  );

  const filteredBubbles = useMemo(
    () =>
      supplierBubbles.filter(
        (s) =>
          (filters.category === ALL_CATEGORIES || s.category === filters.category) &&
          (filters.segment === "All" || s.segment === filters.segment)
      ),
    [supplierBubbles, filters.category, filters.segment]
  );

  const filteredCandidates = useMemo(
    () =>
      consolidationCandidates.filter(
        (c) =>
          (filters.category === ALL_CATEGORIES || c.category === filters.category) &&
          (!filters.microPOOnly || c.microPOCount / c.poCount >= 0.5)
      ),
    [consolidationCandidates, filters.category, filters.microPOOnly]
  );

  const microStats = useMemo(
    () => estimateMicroPOStats(poValueBuckets, filters.microPOThreshold),
    [poValueBuckets, filters.microPOThreshold]
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] rounded-xl bg-slate-950 p-6 text-slate-100 lg:p-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-50">Spend Control Tower</h2>
          <p className="mt-1 text-sm text-slate-400">
            SAP standard spend visibility for Vedanta&apos;s indirect spend base, extended with proactive
            tail-spend optimization insights.
          </p>
        </div>

        {/* ================= TIER 1: SAP Spend Control Tower ================= */}

        <SapKpiRibbon kpi={sapKpiRibbon} />

        <div className="flex flex-col gap-6 lg:flex-row">
          <SapFilterPanel
            value={sapFilters}
            onChange={setSapFilters}
            dateRanges={sapFilterOptions.dateRanges}
            categories={categoryNames}
            suppliers={supplierNames}
            sourceSystems={sapFilterOptions.sourceSystems}
            plantSites={sapFilterOptions.plantSites}
          />

          <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-2">
            <Widget title="Invoice Count by Invoice Value">
              <InvoiceValueBucketChart
                buckets={invoiceValueBuckets}
                selectedBuckets={selectedBuckets}
                onToggleBucket={toggleBucket}
              />
            </Widget>

            <Widget title="Spend by Supplier (Global Ultimate) for Selected Buckets">
              <SupplierSpendRankChart suppliers={scaledSupplierSpendRank} />
            </Widget>

            <Widget title="Spend by Invoice Value">
              <SpendByInvoiceValueDonut buckets={invoiceValueBuckets} selectedBuckets={selectedBuckets} />
            </Widget>

            <Widget title="Spend by Category for Selected Buckets">
              <CategorySpendHybrid categories={scaledCategoryRows} />
            </Widget>
          </div>
        </div>

        <Section title="Supplier (Global Ultimate) Detail Report">
          <SapDetailTable rows={filteredSupplierReport} />
        </Section>

        {/* ================= Tier divider ================= */}
        <div className="flex items-center gap-4 py-2">
          <div className="h-px flex-1 bg-slate-800" />
          <p className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500">
            Extended AI &amp; Value-Add Optimization Insights
          </p>
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        {/* ================= TIER 2: Advanced AI & Tail Spend Optimization ================= */}

        <TailFilters value={filters} onChange={setFilters} categories={categoryNames} />

        <TailKPICards kpi={kpi} microStats={microStats} threshold={filters.microPOThreshold} />

        <Section
          title="80/20 Pareto Distribution"
          description="Suppliers ranked by spend, decile by decile — where the tail begins."
        >
          <ParetoCurveChart deciles={paretoDeciles} threshold={filters.paretoThreshold} />
        </Section>

        <Section
          title="Spend by Category"
          description="Strategic / Core / Tail split per category, ranked by tail-spend share."
        >
          <TailCategoryChart categories={sortedCategories} />
        </Section>

        <Section
          title="Supplier Segmentation Matrix"
          description="PO count vs. avg PO value, sized by total spend."
        >
          <TailBubbleChart suppliers={filteredBubbles} />
        </Section>

        <Section title="Strategic vs. Core vs. Tail" description="How the three segments compare side by side.">
          <StrategicComparison segments={segmentComparison} />
        </Section>

        <Section
          title="12-Month Spend Trend"
          description="Tail spend is climbing steadily while strategic/core swing with capex cycles."
        >
          <TailTrendChart months={monthlyTrend} />
        </Section>

        <Section
          title="Consolidation Candidates"
          description="Tail suppliers ranked by consolidation opportunity — highest potential savings first."
        >
          <ConsolidationTable candidates={filteredCandidates} />
        </Section>

        <Section
          title="Micro-PO Value Distribution"
          description={`${kpi.totalPOCount.toLocaleString("en-IN")} POs bucketed by value — the smallest buckets cost more to process than they're worth.`}
        >
          <MicroPOAnalysis buckets={poValueBuckets} threshold={filters.microPOThreshold} />
        </Section>
      </div>
    </div>
  );
}
