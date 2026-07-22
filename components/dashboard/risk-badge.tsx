import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import { STATUS } from "@/lib/chart-colors";
import type { RiskLevel } from "@/lib/types";

const RISK_CONFIG: Record<RiskLevel, { color: string; Icon: typeof CheckCircle2; label: string }> = {
  Low: { color: STATUS.good, Icon: CheckCircle2, label: "Low risk" },
  Medium: { color: STATUS.warning, Icon: AlertTriangle, label: "Medium risk" },
  High: { color: STATUS.critical, Icon: OctagonAlert, label: "High risk" },
};

/** Status is never color-alone — always paired with an icon + text label. */
export function RiskBadge({ level }: { level: RiskLevel }) {
  const { color, Icon, label } = RISK_CONFIG[level];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ color, borderColor: `${color}40`, backgroundColor: `${color}14` }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
