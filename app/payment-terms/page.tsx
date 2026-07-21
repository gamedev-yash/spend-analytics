import { PaymentTermsProvider } from "./provider";
import { KpiRibbon } from "./components/kpi-ribbon";
import { FilterPanel } from "./components/filter-panel";
import { PaymentTermsByCategoryChart } from "./components/widgets/payment-terms-by-category-chart";
import { PaymentTermsBySupplierChart } from "./components/widgets/payment-terms-by-supplier-chart";
import { SpendByTermComboChart } from "./components/widgets/spend-by-term-combo-chart";
import { PaymentTermsByInvoiceCountChart } from "./components/widgets/payment-terms-by-invoice-count-chart";
import { DetailReportTable } from "./components/detail-report-table";

export default function PaymentTermsPage() {
  return (
    <PaymentTermsProvider>
      <div className="flex flex-col gap-6">
        <KpiRibbon />
        <div className="flex gap-6">
          <FilterPanel />
          <div className="min-w-0 flex-1 space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <PaymentTermsByCategoryChart />
              <PaymentTermsBySupplierChart />
              <SpendByTermComboChart />
              <PaymentTermsByInvoiceCountChart />
            </div>
            <DetailReportTable />
          </div>
        </div>
      </div>
    </PaymentTermsProvider>
  );
}
