"use client";

import { Building2, FileCheck2, ShieldAlert, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { FocusParameterBar } from "@/components/dashboard/focus-parameter-bar";
import { InsightBox } from "@/components/sap/insight-box";
import { CategoryTreemap } from "@/components/sap/category-treemap";
import { TopSuppliersChart } from "@/components/sap/top-suppliers-chart";
import { SpendTrendChart } from "@/components/sap/spend-trend-chart";
import { SpendByBuChart } from "@/components/sap/spend-by-bu-chart";
import { SpendSunburst } from "@/components/sap/spend-sunburst";
import { MetricsTable } from "@/components/sap/metrics-table";
import type {
  HeadlineKpis,
  TreemapNode,
  MonthlyTrendPoint,
  SpikeMarker,
  BuSpendRow,
  SunburstNode,
  MetricsTableRow,
  getTopSuppliersData,
} from "@/lib/sap/aggregate";
import { formatCr, formatInr, formatPercentInr, formatSignedPercentInr } from "@/lib/sap/format-inr";
import { SO_FOCUS_PARAMETERS, SO_FOCUS_PRESETS } from "./focusParams";
import { useSpendOverviewFocus } from "./useSpendOverviewFocus";

interface SpendOverviewCanvasProps {
  kpis: HeadlineKpis;
  insightText: string;
  treemapNodes: TreemapNode[];
  topSuppliers: ReturnType<typeof getTopSuppliersData>;
  trend: MonthlyTrendPoint[];
  spikes: SpikeMarker[];
  buSpend: BuSpendRow[];
  sunburstNodes: SunburstNode[];
  plantNameToCode: Record<string, string>;
  metricsRows: MetricsTableRow[];
}

/**
 * Client-side canvas for the Summary tab: owns the Focus Parameter bar and
 * every widget's isWidgetVisible gate. The page.tsx Server Component still
 * does all data aggregation server-side and passes it in as plain props.
 */
export function SpendOverviewCanvas({
  kpis,
  insightText,
  treemapNodes,
  topSuppliers,
  trend,
  spikes,
  buSpend,
  sunburstNodes,
  plantNameToCode,
  metricsRows,
}: SpendOverviewCanvasProps) {
  const { activeParameters, toggleParameter, applyPreset, isWidgetVisible } = useSpendOverviewFocus();

  return (
    <>
      <FocusParameterBar
        parameters={SO_FOCUS_PARAMETERS}
        presets={SO_FOCUS_PRESETS}
        activeParameters={activeParameters}
        onToggleParameter={toggleParameter}
        onApplyPreset={applyPreset}
      />

      {isWidgetVisible("insight-box") && <InsightBox text={insightText} />}

      <section className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {isWidgetVisible("kpi-spend-trends") && (
          <>
            <KpiCard size="compact" label="Total Spend" value={formatCr(kpis.totalSpendInr)} icon={<Wallet />} accent="blue" />
            <KpiCard size="compact" label="Total PO Count" value={kpis.poCount.toLocaleString()} icon={<FileCheck2 />} />
            <KpiCard size="compact" label="Active Suppliers" value={kpis.activeSupplierCount.toLocaleString()} icon={<Users />} />
            <KpiCard size="compact" label="Avg. PO Value" value={formatInr(kpis.avgPoValueInr)} icon={<FileCheck2 />} />
            <KpiCard
              size="compact"
              label="YoY Spend Change"
              value={formatSignedPercentInr(kpis.yoyChangePercent)}
              icon={kpis.yoyChangePercent > 0 ? <TrendingUp /> : <TrendingDown />}
              accent={kpis.yoyChangePercent > 0 ? "red" : "green"}
            />
          </>
        )}
        {isWidgetVisible("kpi-off-contract") && (
          <KpiCard
            size="compact"
            label="Off-Contract Spend"
            value={formatPercentInr(kpis.offContractPercent)}
            icon={<ShieldAlert />}
            accent={kpis.offContractPercent > 25 ? "red" : "green"}
            hint={kpis.offContractPercent > 25 ? "Above 25% threshold" : "Within threshold"}
          />
        )}
      </section>

      {/* Trailing odd child spans the full row so hiding widgets never leaves a gap. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
        {isWidgetVisible("category-treemap") && (
          <ChartCard className="h-[420px]" title="Spend by Category" description="Click to drill in" icon={<TrendingUp />} accent="blue">
            <CategoryTreemap nodes={treemapNodes} />
          </ChartCard>
        )}
        {isWidgetVisible("top-suppliers-chart") && (
          <ChartCard className="h-[420px]" title="Top 20 Suppliers" description="Stacked by category + Pareto line" icon={<Users />} accent="violet">
            <TopSuppliersChart rows={topSuppliers.rows} allL1={topSuppliers.allL1} top5Percent={topSuppliers.top5Percent} />
          </ChartCard>
        )}
        {isWidgetVisible("spend-trend-chart") && (
          <ChartCard className="h-[420px]" title="Spend Trend" description="Jan 2023 – Dec 2025, full history" icon={<TrendingUp />} accent="blue">
            <SpendTrendChart trend={trend} spikes={spikes} />
          </ChartCard>
        )}
        {isWidgetVisible("spend-by-bu-chart") && (
          <ChartCard className="h-[420px]" title="Spend by Business Unit" description="Click a bar to drill in" icon={<Building2 />} accent="orange">
            <SpendByBuChart rows={buSpend} />
          </ChartCard>
        )}
        {isWidgetVisible("spend-sunburst") && (
          <ChartCard className="h-[420px]" title="Spend Composition" description="BU → Category → Subcategory" icon={<Building2 />} accent="green">
            <SpendSunburst nodes={sunburstNodes} plantNameToCode={plantNameToCode} />
          </ChartCard>
        )}
        {isWidgetVisible("metrics-table") && (
          <ChartCard className="h-[420px]" title="Key Metrics Summary" description="Sortable, exportable" icon={<FileCheck2 />} accent="blue">
            <MetricsTable rows={metricsRows} />
          </ChartCard>
        )}
      </div>
    </>
  );
}
