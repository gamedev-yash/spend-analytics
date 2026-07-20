import { FeaturePlaceholder } from "@/components/feature-placeholder";
import { supplierMock } from "./supplierMock";

export default function SupplierFragmentationPage() {
  return (
    <FeaturePlaceholder
      href="/supplier-fragmentation"
      stats={[
        {
          label: "Active Suppliers",
          value: supplierMock.totalActiveSuppliers.toLocaleString(),
        },
        {
          label: "Single-Use Suppliers",
          value: supplierMock.singleUseSupplierCount.toLocaleString(),
        },
        {
          label: "Top 10 Concentration",
          value: `${supplierMock.top10ConcentrationPercent}%`,
        },
      ]}
    />
  );
}
