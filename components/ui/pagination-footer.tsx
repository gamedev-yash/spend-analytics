"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationFooterProps {
  page: number;
  pageCount: number;
  startIndex: number;
  endIndex: number;
  totalCount: number;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  /** Noun for the count line, e.g. "suppliers", "categories" — defaults to "rows". */
  itemLabel?: string;
  className?: string;
}

/**
 * Shared "Showing X to Y of Z <items> · Page A of B · Previous/Next" footer
 * for every dashboard's paginated detail table — one consistent pagination
 * UI across all 5 dashboards instead of five bespoke ones. Renders nothing
 * when there are no rows (an empty-state message already covers that case).
 */
export function PaginationFooter({
  page,
  pageCount,
  startIndex,
  endIndex,
  totalCount,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  itemLabel = "rows",
  className,
}: PaginationFooterProps) {
  if (totalCount === 0) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-1 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400",
        className
      )}
    >
      <span>
        Showing {startIndex + 1} to {endIndex} of {totalCount.toLocaleString("en-IN")} {itemLabel}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-slate-400 dark:text-slate-500">
          Page {page} of {pageCount}
        </span>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onPrevious} disabled={!hasPrevious}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onNext} disabled={!hasNext}>
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
