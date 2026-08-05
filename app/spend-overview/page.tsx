import { SpendOverviewFilters } from "./components/SpendOverviewFilters";
import { SpendOverviewDataBridge } from "./components/SpendOverviewDataBridge";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { DASHBOARD_CANVAS_ID } from "@/lib/snapshot";
import {
  getCascadingFilterOptions,
  getFilterOptions,
  getHeadlineKpis,
  getCategoryTreemapData,
  getTopSuppliersData,
  getSpendTrendData,
  getSpikeMarkers,
  getSpendByBuData,
  getMetricsTableData,
  getSupplierDetailReportData,
  generateInsightText,
} from "@/lib/sap/aggregate";
import { getMonthlyInvoiceCounts } from "./monthlyInvoiceCounts";
import type { SapFilters } from "@/lib/sap/types";

interface PageProps {
  searchParams: Promise<{
    bu?: string;
    cat?: string;
    from?: string;
    to?: string;
    vendor?: string;
    catPath?: string;
  }>;
}

/** Last two full calendar years ending at the dataset's max date, used when no date filter is set. */
function defaultDateRange(dateMax: string): { from: string; to: string } {
  const maxYear = Number(dateMax.slice(0, 4));
  return { from: `${maxYear - 2}-01-01`, to: dateMax };
}

export default async function SpendOverviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filterOptions = getFilterOptions();
  const { from: defaultFrom, to: defaultTo } = defaultDateRange(filterOptions.dateMax);

  const filters: SapFilters = {
    plants: params.bu?.split(",").filter(Boolean),
    categoriesL1: params.cat?.split(",").filter(Boolean),
    dateFrom: params.from ?? defaultFrom,
    dateTo: params.to ?? defaultTo,
    spendType: "po",
    vendorId: params.vendor,
    categoryPath: params.catPath,
  };

  // Cascading options: picking a BU narrows which categories are still
  // offered, and vice versa — computed from the same filtered PO items every
  // other aggregate below reads from, so it can't drift out of sync.
  const cascadingOptions = getCascadingFilterOptions(filters);

  const kpis = getHeadlineKpis(filters);
  const treemapNodes = getCategoryTreemapData(filters);
  const topSuppliers = getTopSuppliersData(filters, 500);
  const trend = getSpendTrendData(filters);
  const invoiceCountByMonth = getMonthlyInvoiceCounts(filters);
  const spikes = getSpikeMarkers(trend);
  const buSpend = getSpendByBuData(filters);
  const metricsRows = getMetricsTableData(filters);
  const supplierDetailRows = getSupplierDetailReportData(filters);
  const insightText = generateInsightText(filters);

  const activeFilterCount =
    (filters.plants?.length ?? 0) +
    (filters.categoriesL1?.length ?? 0) +
    (filters.vendorId ? 1 : 0) +
    (filters.categoryPath ? 1 : 0);

  return (
    <div className="flex flex-col gap-6">
      <SpendOverviewFilters
        plantOptions={cascadingOptions.plants}
        categoryOptions={cascadingOptions.categoriesL1}
        defaultDateFrom={defaultFrom}
        defaultDateTo={defaultTo}
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
            invoiceCountByMonth,
            spikes,
            buSpend,
            metricsRows,
            supplierDetailRows,
          }}
          filters={filters}
        />
      </div>
    </div>
  );
}
