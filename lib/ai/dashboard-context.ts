import "server-only";

import { getHeadlineKpis } from "@/lib/sap/aggregate";
import { getComplianceHeadline } from "@/lib/sap/compliance";
import { computeKpis, aggregateByPaymentTerm } from "@/app/payment-terms/selectors";
import { invoices as paymentTermsInvoices } from "@/app/payment-terms/data";
import { tailSpendMock } from "@/app/tail-spend/tailSpendMock";
import { supplierMock } from "@/app/supplier-fragmentation/supplierMock";
import type { DashboardKey } from "@/lib/ai/dashboard-registry";

function fmtCr(inr: number): string {
  return `₹${Math.round(inr / 1e7).toLocaleString("en-IN")} Cr`;
}

/**
 * Real, current data for exactly one dashboard — computed from the same
 * aggregate functions / mock data each dashboard page itself renders from.
 * Never raw rows, and never any other dashboard's numbers, so the chat
 * endpoint can ground answers in this text without needing to trust the
 * model to keep dashboards separate on its own.
 */
export function buildDashboardContext(key: DashboardKey): string {
  switch (key) {
    case "spend-overview": {
      const kpis = getHeadlineKpis({});
      return [
        `Total Spend: ${fmtCr(kpis.totalSpendInr)}`,
        `PO Count: ${kpis.poCount.toLocaleString("en-IN")}`,
        `Active Suppliers: ${kpis.activeSupplierCount.toLocaleString("en-IN")}`,
        `Avg PO Value: ₹${Math.round(kpis.avgPoValueInr).toLocaleString("en-IN")}`,
        `YoY Spend Change: ${kpis.yoyChangePercent}%`,
      ].join("\n");
    }

    case "compliance": {
      const compliance = getComplianceHeadline({});
      return [
        `Unmanaged Spend: ${fmtCr(compliance.unmanagedSpendInr)} (${compliance.unmanagedSpendPercent}% of total spend)`,
        `Off-PO Spend: ${fmtCr(compliance.offPoSpendInr)}`,
        `Off-Contract Spend: ${fmtCr(compliance.offContractSpendInr)}`,
        `Unmanaged Invoices: ${compliance.unmanagedInvoiceCount.toLocaleString("en-IN")}`,
        `Unmanaged Suppliers: ${compliance.unmanagedSupplierCount.toLocaleString("en-IN")}`,
      ].join("\n");
    }

    case "payment-terms": {
      const kpis = computeKpis(paymentTermsInvoices);
      const topTerms = aggregateByPaymentTerm(paymentTermsInvoices)
        .sort((a, b) => b.invoiceCount - a.invoiceCount)
        .slice(0, 6)
        .map(
          (t) =>
            `  - ${t.label}: nominal ${t.nominalDays ?? "—"}d, avg paid ${
              t.avgPaidDays !== null ? t.avgPaidDays.toFixed(1) : "—"
            }d, ${t.invoiceCount} invoices`
        );
      return [
        `Distinct Payment Terms Used: ${kpis.distinctPaymentTerms}`,
        `Average Paid Cycle Days: ${kpis.avgPaidDays !== null ? kpis.avgPaidDays.toFixed(1) : "—"}`,
        `Top payment terms by invoice count:`,
        ...topTerms,
      ].join("\n");
    }

    case "tail-spend": {
      const k = tailSpendMock.kpi;
      return [
        `Total Annual Spend: ${fmtCr(k.totalAnnualSpend)}`,
        `Total PO Count: ${k.totalPOCount.toLocaleString("en-IN")}`,
        `Active Suppliers: ${k.totalActiveSuppliers.toLocaleString("en-IN")}`,
        `Tail Spend Value: ${fmtCr(k.tailSpendValue)} (${k.tailSpendPercentOfValue}% of total value, ${k.tailSpendPercentOfPOs}% of POs)`,
        `Micro-PO Count: ${k.microPOCount.toLocaleString("en-IN")} (${k.microPOPercentOfTotalPOs}% of total POs), processing cost ${fmtCr(k.microPOProcessingCost)}`,
        `Tail Supplier Count: ${k.tailSupplierCount.toLocaleString("en-IN")}, of which single-use: ${k.singleUseSupplierCount.toLocaleString("en-IN")}`,
        `Avg PO Processing Cost: ₹${k.avgPOProcessingCost.toLocaleString("en-IN")}`,
        `Potential Consolidation Savings: ${fmtCr(k.potentialConsolidationSavings)}`,
      ].join("\n");
    }

    case "supplier-fragmentation": {
      const s = supplierMock;
      const byCategory = s.categories
        .slice()
        .sort((a, b) => b.top3ConcentrationPercent - a.top3ConcentrationPercent)
        .map(
          (c) =>
            `  - ${c.category}: ${c.supplierCount} suppliers, top-3 concentration ${c.top3ConcentrationPercent}%, ${c.singleUseSuppliers} single-use, ₹${c.spendCr} Cr`
        );
      return [
        `Total Active Suppliers: ${s.totalActiveSuppliers.toLocaleString("en-IN")}`,
        `Single-Use Suppliers: ${s.singleUseSupplierCount.toLocaleString("en-IN")}`,
        `Top-10 Supplier Concentration: ${s.top10ConcentrationPercent}%`,
        `Avg Suppliers per Category: ${s.avgSuppliersPerCategory}`,
        `Duplicate Supplier Pairs: ${s.duplicatePairCount}`,
        `New Suppliers (last 12 months): ${s.newSuppliersLast12M}`,
        `By category:`,
        ...byCategory,
      ].join("\n");
    }
  }
}
