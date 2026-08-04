"use client";

import {
  AlertTriangle,
  BarChart3,
  CircleDot,
  Grid3x3,
  Share2,
  Table2,
  TrendingUp,
} from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { RevalidatingSection } from "@/components/dashboard/revalidating-section";
import { WidgetGridSkeleton } from "@/components/dashboard/widget-grid-skeleton";
import { useMasterData } from "../lib/use-master-data";
import { ConsolidationOpportunityTable } from "./ConsolidationOpportunityTable";
import { CrossBuSankeyChart } from "./CrossBuSankeyChart";
import { FragmentationBubbleChart } from "./FragmentationBubbleChart";
import { FragmentationControls } from "./FragmentationControls";
import { FragmentationHeatmap } from "./FragmentationHeatmap";
import { FragmentationInsight } from "./FragmentationInsight";
import { FragmentationKpis } from "./FragmentationKpis";
import { FragmentationStoreProvider } from "./fragmentationStore";
import { FragmentationTrendChart } from "./FragmentationTrendChart";
import { SuppliersPerCategoryChart } from "./SuppliersPerCategoryChart";

function Header() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Vedanta · Supplier Spend Analytics
        </p>
        <h2 className="mt-0.5 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Spend Assessment — Supplier Fragmentation
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Initiative 18 · Dashboard 4 of 6 · Where too many suppliers do the same thing
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          SAP ECC on HANA
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
          EKKO · EKPO · LFA1 · T023T · T001W
        </span>
      </div>
    </div>
  );
}

/**
 * Supplier Fragmentation dashboard — TypeScript/Recharts port of the
 * Initiative-18 Python/Dash prototype. One shared route-local store drives
 * the filter bar, the five KPIs, the insight sentence, and all six views;
 * clicking the heatmap / bar / bubble cross-filters everything else.
 */
export function FragmentationDashboard() {
  const { data, loading, revalidating, error, retry } = useMasterData();

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <Header />
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/60 px-6 py-12 text-center dark:border-red-900/50 dark:bg-red-950/20">
          <AlertTriangle className="h-8 w-8 text-red-500" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Could not load the supplier fragmentation dataset
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-6">
        <Header />
        <WidgetGridSkeleton kpiCount={5} widgetCount={6} widgetHeight={360} />
      </div>
    );
  }

  return (
    <FragmentationStoreProvider payload={data}>
      <div className="flex flex-col gap-6">
        <Header />
        <FragmentationControls />
        <RevalidatingSection isRevalidating={revalidating}>
          <FragmentationInsight />
          <FragmentationKpis />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard
              className="h-[440px]"
              title="Fragmentation Heatmap"
              description="Distinct suppliers per Business Unit × Category — click a cell to focus"
              icon={<Grid3x3 />}
              accent="red"
            >
              <FragmentationHeatmap />
            </ChartCard>

            <ChartCard
              className="h-[440px]"
              title="Suppliers per Category"
              description="Top 20 fragmented L2 categories — red exceeds the median · click to focus"
              icon={<BarChart3 />}
              accent="blue"
            >
              <SuppliersPerCategoryChart />
            </ChartCard>

            <ChartCard
              className="h-[440px]"
              title="Fragmentation vs Spend"
              description="Each bubble = L2 category · size = # POs · click to drill down"
              icon={<CircleDot />}
              accent="orange"
            >
              <FragmentationBubbleChart />
            </ChartCard>

            <ChartCard
              className="h-[440px]"
              title="Cross-BU Supplier Overlap"
              description="Same supplier used by multiple BUs for the same category — consolidate contracts"
              icon={<Share2 />}
              accent="violet"
            >
              <CrossBuSankeyChart />
            </ChartCard>

            <ChartCard
              className="h-[440px]"
              title="Fragmentation Trend"
              description="Are we becoming more or less fragmented? ◆ marks new-supplier spikes"
              icon={<TrendingUp />}
              accent="green"
            >
              <FragmentationTrendChart />
            </ChartCard>

            <ChartCard
              className="h-[440px]"
              title="Consolidation Opportunity"
              description="Highlighted rows: parent-grouping cuts supplier count >50% · sortable · CSV export"
              icon={<Table2 />}
              accent="red"
            >
              <ConsolidationOpportunityTable />
            </ChartCard>
          </div>

          <p className="text-center text-xs text-slate-400 dark:text-slate-600">
            Dummy data generated for demonstration — not actual Vedanta procurement records.
          </p>
        </RevalidatingSection>
      </div>
    </FragmentationStoreProvider>
  );
}
