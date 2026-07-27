"use client";

import { useMemo } from "react";
import { PaymentTermsProvider } from "./provider";
import { buildInvoicesFromDataset } from "./fromDataset";
import { useDatasets } from "@/context/DatasetsContext";
import { DatasetUpload } from "@/components/dashboard/dataset-upload";
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

export default function PaymentTermsPage() {
  const { activeParameters, toggleParameter, applyPreset, isWidgetVisible } = usePaymentTermsFocus();
  const { getDatasetForPage } = useDatasets();
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
          <DatasetUpload pageKey="payment-terms" usingFallback={datasetInvoices === null} />
        </div>

        <FocusParameterBar
          parameters={PT_FOCUS_PARAMETERS}
          presets={PT_FOCUS_PRESETS}
          activeParameters={activeParameters}
          onToggleParameter={toggleParameter}
          onApplyPreset={applyPreset}
        />

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
    </PaymentTermsProvider>
  );
}
