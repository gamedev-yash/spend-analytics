"use client";

import { useMemo } from "react";
import { PaymentTermsProvider } from "./provider";
import { buildInvoicesFromDataset } from "./fromDataset";
import { useDatasets } from "@/context/DatasetsContext";
import { DatasetUpload } from "@/components/dashboard/dataset-upload";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { DASHBOARD_CANVAS_ID } from "@/lib/snapshot";
import { KpiRibbon } from "./components/kpi-ribbon";
import { FilterPanel } from "./components/filter-panel";
import { PaymentTermsByCategoryChart } from "./components/widgets/payment-terms-by-category-chart";
import { PaymentTermsBySupplierChart } from "./components/widgets/payment-terms-by-supplier-chart";
import { SpendByTermComboChart } from "./components/widgets/spend-by-term-combo-chart";
import { PaymentTermsByInvoiceCountChart } from "./components/widgets/payment-terms-by-invoice-count-chart";
import { DetailReportTable } from "./components/detail-report-table";
import { FocusParameterBar } from "@/components/dashboard/focus-parameter-bar";
import { PT_FOCUS_PARAMETERS, PT_FOCUS_PRESETS } from "./components/focusParams";
import { usePaymentTermsFocus } from "./components/usePaymentTermsFocus";

/**
 * This page is the one core dashboard the warehouse cannot yet feed. Its
 * headline metrics — average paid days and standard-terms adherence — need a
 * settlement date per invoice, and fact_invoices carries only the document and
 * posting dates. Rather than derive a paid date that does not exist, the page
 * stays on its invoice-list source and says so.
 */
function WarehouseGapNote() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-medium">Showing sample data, not Azure SQL.</p>
      <p className="mt-1 leading-snug text-amber-800 dark:text-amber-300">
        Paid-cycle metrics need a settlement date per invoice. Migrating this page requires{" "}
        <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-900/60">paid_date_key</code> and{" "}
        <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-900/60">paid_days</code> on{" "}
        <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-900/60">fact_invoices</code>, plus
        global-ultimate and source-system attributes on the vendor dimension. Every other core dashboard reads
        the warehouse in this mode.
      </p>
    </div>
  );
}

export default function PaymentTermsPage() {
  const { activeParameters, toggleParameter, applyPreset, isWidgetVisible } = usePaymentTermsFocus();
  const { getDatasetForPage, providerType } = useDatasets();
  const dataset = getDatasetForPage("payment-terms");

  // Uploaded CSV (when present and usable) replaces the mock invoice list —
  // every widget, KPI, and filter option derives from it. The key remounts
  // the provider so filter state resets against the new data.
  const datasetInvoices = useMemo(
    () => (dataset ? buildInvoicesFromDataset(dataset) : null),
    [dataset]
  );

  return (
    <PaymentTermsProvider
      key={datasetInvoices ? dataset!.id : "static"}
      invoices={datasetInvoices ?? undefined}
    >
      <FilterPanel />
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Payment Terms</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Payment-term coverage and paid-cycle performance across Vedanta&apos;s supplier base, with
              linked drill-down by category, supplier, and term.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <DatasetUpload pageKey="payment-terms" usingFallback={datasetInvoices === null} />
            <ExportSnapshotButton targetId={DASHBOARD_CANVAS_ID} dashboardTitle="Payment Terms" />
          </div>
        </div>

        <div id={DASHBOARD_CANVAS_ID} className="flex flex-col gap-6">
          <FocusParameterBar
            parameters={PT_FOCUS_PARAMETERS}
            presets={PT_FOCUS_PRESETS}
            activeParameters={activeParameters}
            onToggleParameter={toggleParameter}
            onApplyPreset={applyPreset}
            thresholdsPageKey="payment-terms"
          />

          {providerType === "azure-sql" && datasetInvoices === null && <WarehouseGapNote />}

          {isWidgetVisible("kpi-ribbon") && <KpiRibbon />}
          {/* Trailing odd child spans the full row so hiding/filtering widgets never leaves a gap. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
            {isWidgetVisible("category-chart") && <PaymentTermsByCategoryChart />}
            {isWidgetVisible("supplier-chart") && <PaymentTermsBySupplierChart />}
            {isWidgetVisible("combo-chart") && <SpendByTermComboChart />}
            {isWidgetVisible("invoice-count-chart") && <PaymentTermsByInvoiceCountChart />}
          </div>
          {isWidgetVisible("detail-table") && <DetailReportTable />}
        </div>
      </div>
    </PaymentTermsProvider>
  );
}
