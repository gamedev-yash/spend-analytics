import type { SegmentComparison } from "../tailSpendMock";
import { formatINR, formatCompactNumber } from "../tailSpendMock";
import { SEGMENT_COLOR } from "../theme";

interface StrategicComparisonProps {
  segments: SegmentComparison[];
}

interface MetricRow {
  label: string;
  render: (s: SegmentComparison) => string;
  sub?: (s: SegmentComparison) => string;
}

const METRICS: MetricRow[] = [
  {
    label: "Suppliers",
    render: (s) => formatCompactNumber(s.supplierCount),
    sub: (s) => `${s.supplierPercent}% of base`,
  },
  {
    label: "PO Volume",
    render: (s) => formatCompactNumber(s.poCount),
    sub: (s) => `${s.poPercent}% of POs`,
  },
  {
    label: "Spend Value",
    render: (s) => formatINR(s.spendValue),
    sub: (s) => `${s.spendPercent}% of spend`,
  },
  {
    label: "Avg. PO Value",
    render: (s) => formatINR(s.avgPOValue),
  },
  {
    label: "Processing Cost",
    render: (s) => formatINR(s.processingCost),
    sub: (s) => `${((s.processingCost / s.spendValue) * 100).toFixed(1)}% of spend value`,
  },
];

/**
 * Side-by-side matrix, not a chart — three segments across five metrics reads
 * faster as a table than as bars once every cell needs its own number.
 */
export function StrategicComparison({ segments }: StrategicComparisonProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-40 border-b border-slate-800 pb-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              Metric
            </th>
            {segments.map((s) => (
              <th key={s.segment} className="border-b border-slate-800 pb-3 text-left">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: SEGMENT_COLOR[s.segment] }}
                  />
                  {s.segment}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((metric) => (
            <tr key={metric.label} className="border-b border-slate-800/60 last:border-0">
              <td className="py-3 text-xs font-medium text-slate-500">{metric.label}</td>
              {segments.map((s) => (
                <td key={s.segment} className="py-3 pr-4">
                  <p className="font-mono text-sm font-semibold tabular-nums text-slate-100">
                    {metric.render(s)}
                  </p>
                  {metric.sub && <p className="text-xs text-slate-500">{metric.sub(s)}</p>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
