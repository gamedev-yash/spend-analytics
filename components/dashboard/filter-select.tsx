"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FilterSelectProps {
  paramKey: string;
  label: string;
  options: string[];
  allLabel?: string;
}

const ALL_VALUE = "__all__";

/**
 * URL-driven filter control. Reading `searchParams` in the Server Component
 * page (not client state) means filters are shareable/bookmarkable links and
 * every chart on the page re-renders against the same slice server-side.
 */
export function FilterSelect({ paramKey, label, options, allLabel = "All" }: FilterSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramKey) ?? ALL_VALUE;

  function handleChange(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL_VALUE) params.delete(paramKey);
    else params.set(paramKey, value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <Select value={current} onValueChange={handleChange}>
        <SelectTrigger size="sm" className="w-[200px] bg-background">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
