"use client";

import { useDatasets } from "@/context/DatasetsContext";
import { PaymentTermsProvider, usePaymentTerms } from "./provider";
import { ExportSnapshotButton } from "@/components/dashboard/export-snapshot-button";
import { SnapshotHistoryDialog } from "@/components/dashboard/snapshot-history-dialog";
import type { SnapshotState } from "@/lib/local-snapshots";
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
 * This page is the one core dashboard the warehouse cannot yet feed. Its
 * headline metrics — average paid days and standard-terms adherence — need a
 * settlement date per invoice, and fact_invoices carries only the document and
 * posting dates. Rather than derive a paid date that does not exist, the page
 * stays on its static invoice-list source and says so.
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

/** Lives inside PaymentTermsProvider so it can build/restore snapshots against the live provider state. */
function HeaderActions() {
  const { filters, setDateFrom, setDateTo, setCategories, setGlobalUltimates, setSourceSystems, setPlants, setPaymentTerms } =
    usePaymentTerms();

  function buildSnapshot(): SnapshotState {
    return {
      pageId: "payment-terms",
      filters: {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        categories: filters.categoryCodes,
        suppliers: filters.globalUltimateIds,
        plants: filters.plantIds,
        sourceSystems: filters.sourceSystemIds,
        extra: { paymentTermCodes: filters.paymentTermCodes },
      },
      preview: [
        { label: "Date range", value: `${filters.dateFrom} to ${filters.dateTo}` },
        { label: "Category", value: filters.categoryCodes.length ? filters.categoryCodes.join(", ") : "All" },
        {
          label: "Supplier",
          value: filters.globalUltimateIds.length ? `${filters.globalUltimateIds.length} selected` : "All",
        },
        { label: "Payment Term", value: filters.paymentTermCodes.length ? filters.paymentTermCodes.join(", ") : "All" },
      ],
    };
  }

  function restoreSnapshot(state: SnapshotState) {
    const f = state.filters;
    if (f.dateFrom) setDateFrom(f.dateFrom);
    if (f.dateTo) setDateTo(f.dateTo);
    setCategories(f.categories ?? []);
    setGlobalUltimates(f.suppliers ?? []);
    setPlants(f.plants ?? []);
    setSourceSystems(f.sourceSystems ?? []);
    const extra = f.extra ?? {};
    if (Array.isArray(extra.paymentTermCodes)) setPaymentTerms(extra.paymentTermCodes as string[]);
  }

  return (
    <SnapshotHistoryDialog
      dashboardId="payment-terms"
      dashboardLabel="Payment Terms"
      buildSnapshot={buildSnapshot}
      onRestore={restoreSnapshot}
    />
  );
}

export default function PaymentTermsPage() {
  const { activeParameters, toggleParameter, applyPreset, isWidgetVisible } = usePaymentTermsFocus();
  const { providerType } = useDatasets();

  return (
    <PaymentTermsProvider>
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
            <HeaderActions />
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
            thresholdsPageKey="payment-terms"
          />

          {providerType === "azure-sql" && <WarehouseGapNote />}

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
