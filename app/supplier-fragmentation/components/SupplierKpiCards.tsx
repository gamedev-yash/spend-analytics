"use client";

import { Copy, Layers, Target, UserPlus, Users, UserX, type LucideIcon } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { useThresholds } from "@/context/ThresholdsContext";
import { thresholdEvaluationTitle } from "@/lib/threshold-format";
import type { ThresholdStatus } from "@/types/thresholds";
import type { SupplierFragmentationData } from "../supplierMock";
import type { SfWidgetId } from "./focusParams";

interface SupplierKpiCardsProps {
  data: SupplierFragmentationData;
  isWidgetVisible: (widgetId: SfWidgetId) => boolean;
}

interface KpiDef {
  id: SfWidgetId;
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  status?: ThresholdStatus | null;
  statusTitle?: string;
}

export function SupplierKpiCards({ data, isWidgetVisible }: SupplierKpiCardsProps) {
  const { getThreshold, evaluate } = useThresholds();
  const singleUsePercent = Math.round((data.singleUseSupplierCount / data.totalActiveSuppliers) * 100);

  const singleUseConfig = getThreshold("supplier-fragmentation.single-use-ratio");
  const singleUseStatus = evaluate("supplier-fragmentation.single-use-ratio", singleUsePercent);
  const concentrationConfig = getThreshold("supplier-fragmentation.top10-concentration");
  const concentrationStatus = evaluate(
    "supplier-fragmentation.top10-concentration",
    data.top10ConcentrationPercent
  );

  const cards: KpiDef[] = [
    {
      id: "kpi-active-suppliers",
      icon: Users,
      label: "Active Suppliers",
      value: data.totalActiveSuppliers.toLocaleString("en-IN"),
      sub: "Across all categories and plants",
    },
    {
      id: "kpi-single-use",
      icon: UserX,
      label: "Single-Use Suppliers",
      value: data.singleUseSupplierCount.toLocaleString("en-IN"),
      sub: `${singleUsePercent}% of the active base`,
      status: singleUseStatus,
      statusTitle: singleUseConfig
        ? thresholdEvaluationTitle(singleUsePercent, singleUseConfig)
        : undefined,
    },
    {
      id: "kpi-concentration",
      icon: Target,
      label: "Top-10 Concentration",
      value: `${data.top10ConcentrationPercent}%`,
      sub: "Share of spend with top 10 suppliers",
      status: concentrationStatus,
      statusTitle: concentrationConfig
        ? thresholdEvaluationTitle(data.top10ConcentrationPercent, concentrationConfig)
        : undefined,
    },
    {
      id: "kpi-avg-per-category",
      icon: Layers,
      label: "Avg. Suppliers per Category",
      value: data.avgSuppliersPerCategory.toLocaleString("en-IN"),
      sub: "Signals category-level fragmentation",
    },
    {
      id: "kpi-duplicate-pairs",
      icon: Copy,
      label: "Potential Duplicate Pairs",
      value: data.duplicatePairCount.toLocaleString("en-IN"),
      sub: "Name-similarity matches to review",
    },
    {
      id: "kpi-new-suppliers",
      icon: UserPlus,
      label: "New Suppliers (12M)",
      value: data.newSuppliersLast12M.toLocaleString("en-IN"),
      sub: "Onboarded in the trailing year",
    },
  ];

  const visibleCards = cards.filter((card) => isWidgetVisible(card.id));
  if (visibleCards.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {visibleCards.map((card) => (
        <KpiCard
          key={card.id}
          label={card.label}
          value={card.value}
          hint={card.sub}
          icon={<card.icon />}
          status={card.status}
          statusTitle={card.statusTitle}
        />
      ))}
    </div>
  );
}
