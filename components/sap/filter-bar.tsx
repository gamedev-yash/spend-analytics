"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MultiSelect } from "@/components/sap/multi-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SpendType } from "@/lib/sap/types";

interface FilterBarProps {
  plantOptions: { code: string; name: string }[];
  categoryOptions: string[];
  dateMin: string;
  dateMax: string;
}

const SPEND_TYPE_LABEL: Record<SpendType, string> = {
  po: "PO Spend",
  invoice: "Invoice Spend",
  both: "Both",
};

export function SapFilterBar({ plantOptions, categoryOptions, dateMin, dateMax }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedPlants = searchParams.get("bu")?.split(",").filter(Boolean) ?? [];
  const selectedCategories = searchParams.get("cat")?.split(",").filter(Boolean) ?? [];
  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";
  const spendType = (searchParams.get("spend") as SpendType) ?? "po";

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-3 rounded-md border bg-muted/20 px-3 py-1.5">
      <MultiSelect
        label="Business Unit"
        options={plantOptions.map((p) => ({ value: p.code, label: p.name }))}
        selected={selectedPlants}
        onChange={(values) =>
          updateParams((params) => (values.length ? params.set("bu", values.join(",")) : params.delete("bu")))
        }
      />
      <MultiSelect
        label="Category (L1)"
        options={categoryOptions.map((c) => ({ value: c, label: c }))}
        selected={selectedCategories}
        onChange={(values) =>
          updateParams((params) => (values.length ? params.set("cat", values.join(",")) : params.delete("cat")))
        }
      />
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Time Period</label>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            min={dateMin}
            max={dateMax}
            onChange={(e) => updateParams((params) => (e.target.value ? params.set("from", e.target.value) : params.delete("from")))}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={dateTo}
            min={dateMin}
            max={dateMax}
            onChange={(e) => updateParams((params) => (e.target.value ? params.set("to", e.target.value) : params.delete("to")))}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Spend Type</label>
        <Tabs value={spendType} onValueChange={(v) => updateParams((params) => params.set("spend", String(v)))}>
          <TabsList>
            {(Object.keys(SPEND_TYPE_LABEL) as SpendType[]).map((key) => (
              <TabsTrigger key={key} value={key} className="text-xs">
                {SPEND_TYPE_LABEL[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
