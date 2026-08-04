"use client";

import { useMemo, useState } from "react";
import { tailSpendMock } from "../tailSpendMock";
import { ALL_CATEGORIES, ALL_PLANTS, ALL_SUPPLIERS } from "./reactiveFilters";

export { ALL_CATEGORIES, ALL_SUPPLIERS, ALL_PLANTS };
export const ALL_SOURCE_SYSTEMS = "All Source Systems";

/** Picker bounds — a fixed 3-year window comfortably covering every mock/sample date. */
export const DATE_MIN = "2024-01-01";
export const DATE_MAX = "2026-12-31";

export interface TailSpendFilterState {
  category: string;
  supplierGlobalUltimate: string;
  plantSite: string;
  sourceSystem: string;
  dateFrom: string;
  dateTo: string;
  paretoThreshold: number;
  selectedBuckets: Set<string>;
}

export interface TailSpendStore {
  filters: TailSpendFilterState;
  setCategory: (value: string) => void;
  setSupplier: (value: string) => void;
  setPlantSite: (value: string) => void;
  setSourceSystem: (value: string) => void;
  /** Setting FROM past the current TO pulls TO forward to match, and vice versa. */
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  setParetoThreshold: (value: number) => void;
  toggleBucket: (bucketLabel: string) => void;
}

const ALL_BUCKET_LABELS = tailSpendMock.invoiceValueBuckets.map((b) => b.bucketLabel);

/**
 * Owns every sidebar filter for /tail-spend and the single re-derivation
 * (reactiveFilters.applyTailSpendFilters) every widget renders through — so
 * a change to any filter recomputes the whole page from one place instead of
 * each widget reading a differently-scoped local variable.
 */
export function useTailSpendStore(): TailSpendStore {
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [supplierGlobalUltimate, setSupplier] = useState(ALL_SUPPLIERS);
  const [plantSite, setPlantSite] = useState(ALL_PLANTS);
  const [sourceSystem, setSourceSystem] = useState(ALL_SOURCE_SYSTEMS);
  const [dateFrom, setDateFromRaw] = useState(DATE_MIN);
  const [dateTo, setDateToRaw] = useState(DATE_MAX);
  const [paretoThreshold, setParetoThreshold] = useState(80);
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(() => new Set(ALL_BUCKET_LABELS));

  // ISO "YYYY-MM-DD" strings sort correctly as plain strings, so the same
  // clamp trick the old month-key version used still works unchanged.
  function setDateFrom(value: string) {
    setDateFromRaw(value);
    setDateToRaw((currentTo) => (value > currentTo ? value : currentTo));
  }

  function setDateTo(value: string) {
    setDateToRaw(value);
    setDateFromRaw((currentFrom) => (value < currentFrom ? value : currentFrom));
  }

  function toggleBucket(bucketLabel: string) {
    setSelectedBuckets((prev) => {
      const allSelected = prev.size === ALL_BUCKET_LABELS.length;
      if (allSelected) return new Set([bucketLabel]);
      const next = new Set(prev);
      if (next.has(bucketLabel)) next.delete(bucketLabel);
      else next.add(bucketLabel);
      return next.size === 0 ? new Set(ALL_BUCKET_LABELS) : next;
    });
  }

  const filters: TailSpendFilterState = useMemo(
    () => ({
      category,
      supplierGlobalUltimate,
      plantSite,
      sourceSystem,
      dateFrom,
      dateTo,
      paretoThreshold,
      selectedBuckets,
    }),
    [category, supplierGlobalUltimate, plantSite, sourceSystem, dateFrom, dateTo, paretoThreshold, selectedBuckets]
  );

  return {
    filters,
    setCategory,
    setSupplier,
    setPlantSite,
    setSourceSystem,
    setDateFrom,
    setDateTo,
    setParetoThreshold,
    toggleBucket,
  };
}
