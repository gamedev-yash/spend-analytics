"use client";

import { Building2, FileCheck2, Receipt, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { FocusParameterBar } from "@/components/dashboard/focus-parameter-bar";
import { InsightBox } from "@/components/sap/insight-box";
import { CategorySpendList } from "@/components/sap/category-spend-list";
import { SupplierSpendList } from "@/components/sap/supplier-spend-list";
import { SpendTrendChart } from "@/components/sap/spend-trend-chart";
import { SpendByBuChart } from "@/components/sap/spend-by-bu-chart";
import { SupplierDetailReportTable } from "@/components/sap/supplier-detail-report";
import type {
  HeadlineKpis,
  TreemapNode,
  MonthlyTrendPoint,
  BuSpendRow,
  SupplierDetailRow,
  getTopSuppliersData,
} from "@/lib/sap/aggregate";
import { formatCr, formatSignedPercentInr } from "@/lib/sap/format-inr";
import { SO_FOCUS_PARAMETERS, SO_FOCUS_PRESETS } from "./focusParams";
import { useSpendOverviewFocus } from "./useSpendOverviewFocus";
import { useThresholds } from "@/context/ThresholdsContext";
import { thresholdEvaluationTitle } from "@/lib/threshold-format";
import type { ThresholdStatus } from "@/types/thresholds";
import type { AccentColor } from "@/lib/chart-colors";

const STATUS_ACCENT: Record<ThresholdStatus, AccentColor> = {
  success: "green",
  warning: "orange",
  danger: "red",
};

interface SpendOverviewCanvasProps {
  kpis: HeadlineKpis;
  insightText: string;
  treemapNodes: TreemapNode[];
  topSuppliers: ReturnType<typeof getTopSuppliersData>;
  trend: MonthlyTrendPoint[];
  buSpend: BuSpendRow[];
  supplierDetailRows: SupplierDetailRow[];
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
  buSpend,
  supplierDetailRows,
}: SpendOverviewCanvasProps) {
  const { activeParameters, toggleParameter, applyPreset, isWidgetVisible } = useSpendOverviewFocus();
  const { getThreshold, evaluate } = useThresholds();

  const yoyConfig = getThreshold("spend-overview.yoy-growth");
  const yoyStatus = evaluate("spend-overview.yoy-growth", kpis.yoyChangePercent);

  return (
    <>
      <FocusParameterBar
        parameters={SO_FOCUS_PARAMETERS}
        presets={SO_FOCUS_PRESETS}
        activeParameters={activeParameters}
        onToggleParameter={toggleParameter}
        onApplyPreset={applyPreset}
        thresholdsPageKey="spend-overview"
      />

      {isWidgetVisible("insight-box") && <InsightBox text={insightText} />}

      <section className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {isWidgetVisible("kpi-spend-trends") && (
          <>
            <KpiCard size="compact" label="Total Spend" value={formatCr(kpis.totalSpendInr)} icon={<Wallet />} accent="blue" />
            <KpiCard size="compact" label="Invoices" value={kpis.invoiceCount.toLocaleString()} icon={<Receipt />} />
            <KpiCard size="compact" label="Purchase Orders" value={kpis.poCount.toLocaleString()} icon={<FileCheck2 />} />
            <KpiCard size="compact" label="Active Suppliers" value={kpis.activeSupplierCount.toLocaleString()} icon={<Users />} />
            <KpiCard
              size="compact"
              label="YoY Spend Change"
              value={formatSignedPercentInr(kpis.yoyChangePercent)}
              icon={kpis.yoyChangePercent > 0 ? <TrendingUp /> : <TrendingDown />}
              accent={yoyStatus ? STATUS_ACCENT[yoyStatus] : "neutral"}
              status={yoyStatus}
              statusTitle={yoyConfig ? thresholdEvaluationTitle(kpis.yoyChangePercent, yoyConfig) : undefined}
            />
          </>
        )}
      </section>

      {/* Trailing odd child spans the full row so hiding widgets never leaves a gap. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
        {isWidgetVisible("category-treemap") && (
          <ChartCard className="h-[420px]" title="Spend by Category" description="Top categories by spend" icon={<TrendingUp />} accent="blue">
            <CategorySpendList nodes={treemapNodes} />
          </ChartCard>
        )}
        {isWidgetVisible("top-suppliers-chart") && (
          <ChartCard className="h-[420px]" title="Spend by Suppliers" description="All suppliers, scroll for more" icon={<Users />} accent="violet">
            <SupplierSpendList rows={topSuppliers.rows} top5Percent={topSuppliers.top5Percent} />
          </ChartCard>
        )}
        {isWidgetVisible("spend-trend-chart") && (
          <ChartCard className="h-[420px]" title="Spend Trend" description="Jan 2023 – Dec 2025, full history" icon={<TrendingUp />} accent="blue">
            <SpendTrendChart trend={trend} />
          </ChartCard>
        )}
        {isWidgetVisible("spend-by-bu-chart") && (
          <ChartCard className="h-[420px]" title="Spend by Business Unit" description="Total spend per BU" icon={<Building2 />} accent="orange">
            <SpendByBuChart rows={buSpend} />
          </ChartCard>
        )}
        {isWidgetVisible("metrics-table") && (
          <ChartCard className="h-[420px] lg:col-span-2" title="Detailed Report" description="Supplier (Global Ultimate) drill-down, sortable, exportable" icon={<FileCheck2 />} accent="blue">
            <SupplierDetailReportTable
              rows={supplierDetailRows}
              valueColumns={[{ key: "spendInr", label: "Spend", value: (r) => r.spendInr }]}
              csvFilename="spend-overview-detailed-report"
            />
          </ChartCard>
        )}
      </div>
    </>
  );
}
