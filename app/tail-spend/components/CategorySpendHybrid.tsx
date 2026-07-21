import type { SapCategoryRow } from "../tailSpendMock";
import { formatINR } from "../tailSpendMock";
import { PARETO_BAR_COLOR } from "../theme";

interface CategorySpendHybridProps {
  categories: SapCategoryRow[];
}

/**
 * SAP standard widget — table/bar hybrid: code + category name, supplier
 * count, and an in-row spend bar sized against the largest category shown.
 */
export function CategorySpendHybrid({ categories }: CategorySpendHybridProps) {
  const sorted = [...categories].sort((a, b) => b.spend - a.spend);
  const maxSpend = Math.max(...sorted.map((c) => c.spend), 1);

  return (
    <div className="h-[280px] overflow-y-auto pr-1">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-slate-900">
          <tr>
            <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Code</th>
            <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Category</th>
            <th className="pb-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Suppliers</th>
            <th className="w-32 pb-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Spend</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.code} className="border-t border-slate-800/60">
              <td className="py-2 pr-2 font-mono text-xs text-slate-500">{row.code}</td>
              <td className="py-2 pr-2 text-slate-200">{row.category}</td>
              <td className="py-2 pr-2 text-right tabular-nums text-slate-300">{row.supplierCount}</td>
              <td className="py-2">
                <div className="flex flex-col items-end gap-1">
                  <span className="tabular-nums text-slate-100">{formatINR(row.spend)}</span>
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(row.spend / maxSpend) * 100}%`, backgroundColor: PARETO_BAR_COLOR }}
                    />
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
