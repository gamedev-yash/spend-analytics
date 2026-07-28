import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { SpendOverviewFilters } from "@/components/sap/spend-overview-filters";
import { SpendOverviewDataBridge } from "./components/SpendOverviewDataBridge";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { DASHBOARD_CANVAS_ID } from "@/lib/snapshot";
import { plants } from "@/lib/sap/raw-data";
import {
  getFilterOptions,
  getHeadlineKpis,
  getCategoryTreemapData,
  getTopSuppliersData,
  getSpendTrendData,
  getSpikeMarkers,
  getSpendByBuData,
  getSunburstData,
  getMetricsTableData,
  generateInsightText,
} from "@/lib/sap/aggregate";
import type { SapFilters, SpendType } from "@/lib/sap/types";

interface PageProps {
  searchParams: Promise<{
    bu?: string;
    cat?: string;
    from?: string;
    to?: string;
    spend?: string;
    vendor?: string;
    catPath?: string;
  }>;
}

export default async function SpendOverviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters: SapFilters = {
    plants: params.bu?.split(",").filter(Boolean),
    categoriesL1: params.cat?.split(",").filter(Boolean),
    dateFrom: params.from,
    dateTo: params.to,
    spendType: (params.spend as SpendType) ?? "po",
    vendorId: params.vendor,
    categoryPath: params.catPath,
  };

  const filterOptions = getFilterOptions();
  const kpis = getHeadlineKpis(filters);
  const treemapNodes = getCategoryTreemapData(filters);
  const topSuppliers = getTopSuppliersData(filters, 20);
  const trend = getSpendTrendData(filters);
  const spikes = getSpikeMarkers(trend);
  const buSpend = getSpendByBuData(filters);
  const sunburstNodes = getSunburstData(filters);
  const metricsRows = getMetricsTableData(filters);
  const insightText = generateInsightText(filters);
  const plantNameToCode = Object.fromEntries(plants.map((p) => [p.plant_name, p.plant_code]));

  const activeFilterCount =
    (filters.plants?.length ?? 0) +
    (filters.categoriesL1?.length ?? 0) +
    (filters.vendorId ? 1 : 0) +
    (filters.categoryPath ? 1 : 0);

  return (
    <div className="flex flex-col gap-6">
      <SpendOverviewFilters
        plantOptions={filterOptions.plants}
        categoryOptions={filterOptions.categoriesL1}
        dateMin={filterOptions.dateMin}
        dateMax={filterOptions.dateMax}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Spend Overview — Vedanta
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enterprise-wide spend visibility across business units, categories, and suppliers.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <DashboardTabs />
          <ExportSnapshotButton targetId={DASHBOARD_CANVAS_ID} dashboardTitle="Spend Overview" />
          <p className="text-xs text-muted-foreground">
            Initiative 18 · Dashboard 1 of 6{activeFilterCount > 0 ? ` · ${activeFilterCount} filter(s) active` : ""}
          </p>
        </div>
      </div>

      <div id={DASHBOARD_CANVAS_ID} className="flex flex-col gap-6">
        <SpendOverviewDataBridge
          serverData={{
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
          }}
          filters={filters}
        />
      </div>
    </div>
  );
}
