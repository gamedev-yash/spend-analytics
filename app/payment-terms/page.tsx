import { FeaturePlaceholder } from "@/components/feature-placeholder";
import { paymentTermsMock } from "./paymentTermsMock";

export default function PaymentTermsPage() {
  return (
    <FeaturePlaceholder
      href="/payment-terms"
      stats={[
        {
          label: "Average DPO",
          value: `${paymentTermsMock.averageDpo} days`,
        },
        {
          label: "Target DPO",
          value: `${paymentTermsMock.targetDpo} days`,
        },
        {
          label: "Term Buckets",
          value: paymentTermsMock.buckets.length,
        },
      ]}
    />
  );
}
