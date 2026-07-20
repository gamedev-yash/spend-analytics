import { FeaturePlaceholder } from "@/components/feature-placeholder";
import { tailSpendMock } from "./tailSpendMock";

export default function TailSpendPage() {
  return (
    <FeaturePlaceholder
      href="/tail-spend"
      stats={[
        {
          label: "Tail Spend (Invoices)",
          value: `${tailSpendMock.tailSpendPercentOfInvoices}%`,
        },
        {
          label: "Tail Spend (Value)",
          value: `${tailSpendMock.tailSpendPercentOfValue}%`,
        },
        {
          label: "Value Buckets",
          value: tailSpendMock.valueBuckets.length,
        },
      ]}
    />
  );
}
