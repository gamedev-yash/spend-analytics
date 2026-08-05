import { getFilterOptions } from "@/lib/sap/aggregate";
import {
  getComplianceHeadline,
  getOffPoByCategoryData,
  getOffContractByCategoryData,
  getUnmanagedBySupplierData,
  getUnmanagedByBuData,
  getComplianceDetailReportData,
} from "@/lib/sap/compliance";
import { ComplianceFilters, ComplianceSnapshotButton } from "./components/ComplianceFilters";
import { ComplianceCanvas } from "./components/ComplianceCanvas";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { DASHBOARD_CANVAS_ID } from "@/lib/snapshot";
import type { SapFilters } from "@/lib/sap/types";

interface PageProps {
  searchParams: Promise<{
    bu?: string;
    cat?: string;
    from?: string;
    to?: string;
    vendor?: string;
  }>;
}

/** Last two full calendar years ending at the dataset's max date, used when no date filter is set. */
function defaultDateRange(dateMax: string): { from: string; to: string } {
  const maxYear = Number(dateMax.slice(0, 4));
  return { from: `${maxYear - 2}-01-01`, to: dateMax };
}

export default async function CompliancePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filterOptions = getFilterOptions();
  const { from: defaultFrom, to: defaultTo } = defaultDateRange(filterOptions.dateMax);

  const filters: SapFilters = {
    plants: params.bu?.split(",").filter(Boolean),
    categoriesL1: params.cat?.split(",").filter(Boolean),
    dateFrom: params.from ?? defaultFrom,
    dateTo: params.to ?? defaultTo,
    vendorId: params.vendor,
  };

  const headline = getComplianceHeadline(filters);
  const offPoByCategory = getOffPoByCategoryData(filters);
  const offContractByCategory = getOffContractByCategoryData(filters);
  const unmanagedBySupplier = getUnmanagedBySupplierData(filters, 15);
  const unmanagedByBu = getUnmanagedByBuData(filters);
  const detailReportRows = getComplianceDetailReportData(filters);

  const activeFilterCount =
    (filters.plants?.length ?? 0) + (filters.categoriesL1?.length ?? 0) + (filters.vendorId ? 1 : 0);

  return (
    <div className="flex flex-col gap-6">
      <ComplianceFilters
        plantOptions={filterOptions.plants}
        categoryOptions={filterOptions.categoriesL1}
        defaultDateFrom={defaultFrom}
        defaultDateTo={defaultTo}
        dateMin={filterOptions.dateMin}
        dateMax={filterOptions.dateMax}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Compliance — Vedanta</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Unmanaged spend: invoices with no purchase order, or POs with no associated contract.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <ComplianceSnapshotButton defaultDateFrom={defaultFrom} defaultDateTo={defaultTo} />
          <ExportSnapshotButton targetId={DASHBOARD_CANVAS_ID} dashboardTitle="Compliance" />
          <p className="text-xs text-muted-foreground">
            Initiative 18{activeFilterCount > 0 ? ` · ${activeFilterCount} filter(s) active` : ""}
          </p>
        </div>
      </div>

      <div id={DASHBOARD_CANVAS_ID} className="flex flex-col gap-6">
        <ComplianceCanvas
          headline={headline}
          offPoByCategory={offPoByCategory}
          offContractByCategory={offContractByCategory}
          unmanagedBySupplier={unmanagedBySupplier}
          unmanagedByBu={unmanagedByBu}
          detailReportRows={detailReportRows}
        />
      </div>
    </div>
  );
}
