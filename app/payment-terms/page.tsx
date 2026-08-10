"use client";

import { useDatasets } from "@/context/DatasetsContext";
import { PaymentTermsProvider } from "./provider";
import { useProviderPageData } from "@/hooks/use-provider-page-data";
import { loadPaymentTermsFromProvider } from "@/lib/page-data/payment-terms-from-provider";
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
import { PT_FOCUS_PARAMETERS } from "./components/focusParams";
import { usePaymentTermsFocus } from "./components/usePaymentTermsFocus";

/**
 * Shown only while Azure-SQL/warehouse mode is selected but fact_payments
 * has not (yet, or ever) produced rows — e.g. mid-fetch, or a warehouse
 * genuinely empty of payment records — so the page's use of the static
 * mock in that moment doesn't look unexplained. fact_payments (baseline_date,
 * clearing_date, actual_dpo, payment_status) closed the settlement-date gap
 * this note used to describe; once it returns rows, the note disappears and
 * the dashboard reads the warehouse like every other core page.
 */
function WarehouseFallbackNote() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-medium">Showing sample data, not Azure SQL.</p>
      <p className="mt-1 leading-snug text-amber-800 dark:text-amber-300">
        fact_payments returned no rows for this connection, so paid-cycle metrics are falling back to the
        static sample invoices.
      </p>
    </div>
  );
}

export default function PaymentTermsPage() {
  const { activeParameters, toggleParameter, applyPreset, isWidgetVisible } = usePaymentTermsFocus();
  const { providerType } = useDatasets();

  const warehouse = useProviderPageData(
    () => loadPaymentTermsFromProvider(),
    providerType === "azure-sql",
    "payment-terms"
  );

  return (
    // Remounts (via key) exactly when the data source's identity changes —
    // mock on first paint, warehouse rows once loadPaymentTermsFromProvider
    // resolves — so PaymentTermsProvider's useReducer lazy-initializes its
    // date-range/filter state against whichever invoice list is actually
    // active instead of staying pinned to whatever loaded first.
    <PaymentTermsProvider
      key={warehouse.data ? "warehouse" : "static"}
      invoices={warehouse.data?.invoices}
      sourceSystemDims={warehouse.data?.sourceSystemDims}
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
            <ExportSnapshotButton targetId={DASHBOARD_CANVAS_ID} dashboardTitle="Payment Terms" />
          </div>
        </div>

        <div id={DASHBOARD_CANVAS_ID} className="flex flex-col gap-6">
          <FocusParameterBar
            title="Show Sections"
            description="Toggle which parts of the dashboard are visible — these don't change any numbers."
            parameters={PT_FOCUS_PARAMETERS}
            activeParameters={activeParameters}
            onToggleParameter={toggleParameter}
            onSelectAll={() => applyPreset(PT_FOCUS_PARAMETERS.map((parameter) => parameter.id))}
          />

          {providerType === "azure-sql" && !warehouse.data && <WarehouseFallbackNote />}

          {isWidgetVisible("kpi-ribbon") && <KpiRibbon />}
          {/* Trailing odd child spans the full row so hiding/filtering widgets never leaves a gap. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
            {/* Ordered by section (Term Mix, then Payment Performance, then
                Supplier View) so switching a section off never splits a pair. */}
            {isWidgetVisible("category-chart") && <PaymentTermsByCategoryChart />}
            {isWidgetVisible("invoice-count-chart") && <PaymentTermsByInvoiceCountChart />}
            {isWidgetVisible("combo-chart") && <SpendByTermComboChart />}
            {isWidgetVisible("supplier-chart") && <PaymentTermsBySupplierChart />}
          </div>
          {isWidgetVisible("detail-table") && <DetailReportTable />}
        </div>
      </div>
    </PaymentTermsProvider>
  );
}
