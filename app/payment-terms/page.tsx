"use client";

import { PaymentTermsProvider } from "./provider";
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

  return (
    <PaymentTermsProvider>
      <FilterPanel />
      <div className="flex w-full flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Payment Terms</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Payment-term coverage and paid-cycle performance across Vedanta&apos;s supplier base, with
            linked drill-down by category, supplier, and term.
          </p>
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
