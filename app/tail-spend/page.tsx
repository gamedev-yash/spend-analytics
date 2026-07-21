"use client";

import { useMemo, useState, type ReactNode } from "react";
import { tailSpendMock, estimateMicroPOStats } from "./tailSpendMock";
import { TailFilters, DEFAULT_TAIL_FILTERS, ALL_CATEGORIES, type TailFilterState } from "./components/TailFilters";
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

export default function TailSpendPage() {
  const [filters, setFilters] = useState<TailFilterState>(DEFAULT_TAIL_FILTERS);
  const { kpi, paretoDeciles, categoryBreakdown, supplierBubbles, segmentComparison, monthlyTrend, consolidationCandidates, poValueBuckets } =
    tailSpendMock;

  const categoryNames = useMemo(
    () => categoryBreakdown.map((c) => c.category),
    [categoryBreakdown]
  );

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
          <h2 className="text-2xl font-semibold text-slate-50">Tail Spend Assessment</h2>
          <p className="mt-1 text-sm text-slate-400">
            Supplier consolidation opportunities, micro-PO exposure, and process cost savings across
            Vedanta&apos;s indirect spend base.
          </p>
        </div>

        <TailFilters value={filters} onChange={setFilters} categories={categoryNames} />

        <TailKPICards kpi={kpi} microStats={microStats} threshold={filters.microPOThreshold} />

        <Section
          title="80/20 Pareto Distribution"
          description="Suppliers ranked by spend, decile by decile — where the tail begins."
        >
          <ParetoCurveChart deciles={paretoDeciles} />
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
