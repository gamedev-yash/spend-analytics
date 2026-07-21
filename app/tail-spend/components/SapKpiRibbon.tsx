import { FileText, Building2, Landmark, Repeat } from "lucide-react";
import type { SapKpiRibbon as SapKpiRibbonData } from "../tailSpendMock";
import { formatINR, formatCompactNumber } from "../tailSpendMock";
import { SAP_NAVY, SAP_NAVY_BORDER } from "../theme";

interface SapKpiRibbonProps {
  kpi: SapKpiRibbonData;
}

/**
 * SAP standard top ribbon — exactly 4 metrics, navy banner, compact horizontal
 * layout. This is the fixed SAP Spend Control Tower header, not a themeable card.
 */
export function SapKpiRibbon({ kpi }: SapKpiRibbonProps) {
  const metrics = [
    {
      icon: FileText,
      label: "Invoices",
      value: formatCompactNumber(kpi.invoiceCount),
    },
    {
      icon: Building2,
      label: "Suppliers (Global Ultimate)",
      value: formatCompactNumber(kpi.supplierCountGlobalUltimate),
    },
    {
      icon: Landmark,
      label: "Mean Invoice Amount per Supplier",
      value: formatINR(kpi.meanInvoiceAmountPerSupplier),
    },
    {
      icon: Repeat,
      label: "Mean Number of Invoices per Supplier",
      value: kpi.meanInvoicesPerSupplier.toFixed(1),
    },
  ];

  return (
    <div
      className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4"
      style={{ backgroundColor: SAP_NAVY_BORDER, borderColor: SAP_NAVY_BORDER }}
    >
      {metrics.map((metric) => (
        <div key={metric.label} className="flex items-center gap-3 px-5 py-4" style={{ backgroundColor: SAP_NAVY }}>
          <metric.icon className="h-5 w-5 shrink-0 text-blue-300" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-blue-200/80">{metric.label}</p>
            <p className="mt-0.5 text-xl font-semibold text-white">{metric.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
