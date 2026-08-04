"use client";

import { AlertTriangle, Crosshair, Users } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import type { ThresholdStatus } from "@/types/thresholds";
import { useSingleSourceRisk, useWidgetInvoices } from "../../provider";
import { aggregateCriticalSuppliers, computeConcentrationSummary } from "../../selectors";
import { formatCurrencyFull, useSingleSourceRiskChartColors } from "../../constants";
import type { AccentColor } from "@/lib/chart-colors";

const TOP_N = 20;
const BASE_DESCRIPTION = "Suppliers who are the sole source for one or more categories";

interface HhiClassification {
  accent: AccentColor;
  status: ThresholdStatus;
  statusLabel: string;
}

/** Concentration bands specific to this card — not a shared threshold config. */
function classifyHhi(hhi: number): HhiClassification {
  if (hhi < 1500) return { accent: "green", status: "success", statusLabel: "Unconcentrated" };
  if (hhi < 2500) return { accent: "orange", status: "warning", statusLabel: "Moderate" };
  return { accent: "red", status: "danger", statusLabel: "Highly concentrated" };
}

export function CriticalSupplierChart() {
  const chartColors = useSingleSourceRiskChartColors();
  const { filteredInvoices } = useSingleSourceRisk();
  const { invoicesForWidget, selectedKey, onBarClick } = useWidgetInvoices("globalUltimate");

  const summary = computeConcentrationSummary(filteredInvoices);
  const hhiInfo = classifyHhi(summary.hhi);

  const allRows = aggregateCriticalSuppliers(invoicesForWidget).sort(
    (a, b) => b.soleSourcedCategoryCount - a.soleSourcedCategoryCount || b.spend - a.spend
  );
  const totalCount = allRows.length;
  const rows = allRows.slice(0, TOP_N);
  const isCapped = totalCount > TOP_N;
  const description = isCapped ? `${BASE_DESCRIPTION} — showing top ${TOP_N} of ${totalCount}` : BASE_DESCRIPTION;

  return (
    <ChartCard title="Critical Supplier Blast Radius" description={description} icon={<Crosshair />} accent="red">
      <div className="flex h-full flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Critical Suppliers"
            value={summary.criticalSupplierCount.toLocaleString()}
            icon={<Users />}
            accent="violet"
            size="compact"
          />
          <KpiCard
            label="Blast Radius Spend"
            value={formatCurrencyFull(summary.blastRadiusSpend)}
            icon={<AlertTriangle />}
            accent="red"
            size="compact"
            hint="Spend in categories these suppliers alone provide"
          />
          <KpiCard
            label="Concentration (HHI)"
            value={summary.hhi.toFixed(0)}
            icon={<Crosshair />}
            accent={hhiInfo.accent}
            size="compact"
            status={hhiInfo.status}
            statusLabel={hhiInfo.statusLabel}
            hint="0–10,000 scale"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-200">Supplier</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200">
                  Sole-Sourced Categories
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200">Spend</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                    No sole-sourced suppliers under the current filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isSelected = selectedKey !== null && row.key === selectedKey;
                  const isDimmed = selectedKey !== null && !isSelected;
                  return (
                    <tr
                      key={row.key}
                      onClick={() => onBarClick(row.key, row.label)}
                      className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/60"
                      style={{
                        opacity: isDimmed ? chartColors.dimmedOpacity : 1,
                        boxShadow: isSelected ? `0 0 0 1px ${chartColors.highlightStroke}` : undefined,
                      }}
                    >
                      <td className="px-4 py-2.5 text-left text-slate-900 dark:text-slate-100">{row.label}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">
                        {row.soleSourcedCategoryCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">
                        {formatCurrencyFull(row.spend)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ChartCard>
  );
}
