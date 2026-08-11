"use client";

import { useEffect, useMemo, useState } from "react";

export interface UsePaginationResult<T> {
  page: number;
  pageCount: number;
  pageItems: T[];
  totalCount: number;
  /** 0-indexed start of the current page's slice within `rows`. */
  startIndex: number;
  /** Exclusive end of the current page's slice within `rows`. */
  endIndex: number;
  goToPage: (page: number) => void;
  goToPrevious: () => void;
  goToNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

const DEFAULT_PAGE_SIZE = 10;

/**
 * Client-side pagination over an already-filtered/sorted row array — every
 * dashboard's detail table slices its own `rows` through this instead of
 * rendering all of them into a scrolling container. Resets to page 1
 * whenever the row set changes (a new filter/sort can shrink the total below
 * the page you were on, which would otherwise render an empty page).
 */
export function usePagination<T>(rows: T[], pageSize: number = DEFAULT_PAGE_SIZE): UsePaginationResult<T> {
  const [page, setPage] = useState(1);
  const totalCount = rows.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    setPage(1);
  }, [rows]);

  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);

  const pageItems = useMemo(() => rows.slice(startIndex, endIndex), [rows, startIndex, endIndex]);

  return {
    page: safePage,
    pageCount,
    pageItems,
    totalCount,
    startIndex,
    endIndex,
    goToPage: (target) => setPage(Math.min(Math.max(1, target), pageCount)),
    goToPrevious: () => setPage((p) => Math.max(1, p - 1)),
    goToNext: () => setPage((p) => Math.min(pageCount, p + 1)),
    hasPrevious: safePage > 1,
    hasNext: safePage < pageCount,
  };
}
