import { FeaturePlaceholder } from "@/components/feature-placeholder";
import { overviewMock } from "./overviewMock";

export default function SpendOverviewPage() {
  return (
    <FeaturePlaceholder
      href="/spend-overview"
      stats={[
        {
          label: "YTD Spend",
          value: `$${(overviewMock.totalSpendYtd / 1_000_000).toFixed(1)}M`,
        },
        {
          label: "Months Loaded",
          value: overviewMock.monthlyTrend.length,
        },
      ]}
    />
  );
}
