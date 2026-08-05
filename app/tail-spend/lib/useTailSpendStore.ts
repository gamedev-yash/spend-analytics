"use client";

import { useMemo, useState } from "react";
import { tailSpendMock, type TailSpendData } from "../tailSpendMock";
import { allCategoryNames, allSupplierNames, cascadingCategoryOptions, cascadingSupplierOptions } from "./reactiveFilters";

/** Picker bounds — a fixed 3-year window comfortably covering every mock/sample date. */
export const DATE_MIN = "2024-01-01";
export const DATE_MAX = "2026-12-31";

export interface TailSpendFilterState {
  /** Empty = all. */
  categories: string[];
  /** Empty = all. */
  suppliers: string[];
  /** Empty = all — display-only, see reactiveFilters.ts's applyTailSpendFilters doc comment for why. */
  plants: string[];
  /** Empty = all — display-only, never affects computed numbers. */
  sourceSystems: string[];
  dateFrom: string;
  dateTo: string;
  paretoThreshold: number;
  selectedBuckets: Set<string>;
}

export interface TailSpendStore {
  filters: TailSpendFilterState;
  /** Options each dropdown should actually offer, narrowed by every OTHER active filter. */
  options: {
    categories: string[];
    suppliers: string[];
    plants: string[];
    sourceSystems: string[];
  };
  /** Selecting a category prunes any now-invalid supplier selections, and vice versa — no 0-row lockouts. */
  setCategories: (values: string[]) => void;
  setSuppliers: (values: string[]) => void;
  setPlants: (values: string[]) => void;
  setSourceSystems: (values: string[]) => void;
  /** Setting FROM past the current TO pulls TO forward to match, and vice versa. */
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  setParetoThreshold: (value: number) => void;
  toggleBucket: (bucketLabel: string) => void;
  /** Resets every dropdown, date, and toggle back to its default. */
  resetFilters: () => void;
}

const ALL_BUCKET_LABELS = tailSpendMock.invoiceValueBuckets.map((b) => b.bucketLabel);

/**
 * Owns every sidebar filter for /tail-spend and the single re-derivation
 * (reactiveFilters.applyTailSpendFilters) every widget renders through — so
 * a change to any filter recomputes the whole page from one place instead of
 * each widget reading a differently-scoped local variable.
 *
 * Takes `data` (the unfiltered TailSpendData for whichever source is active)
 * so it can cascade Category <-> Supplier options. The exposed
 * `filters.categories`/`filters.suppliers` are always intersected against
 * the current data's universe at render time — a pure derivation rather than
 * state kept in sync via an effect, so a warehouse refetch that changes the
 * universe underneath a selection can never leave a stale, now-invalid value
 * selected, without any extra synchronization code.
 */
export function useTailSpendStore(data: TailSpendData): TailSpendStore {
  const [categoriesRaw, setCategoriesRaw] = useState<string[]>([]);
  const [suppliersRaw, setSuppliersRaw] = useState<string[]>([]);
  const [plants, setPlants] = useState<string[]>([]);
  const [sourceSystems, setSourceSystems] = useState<string[]>([]);
  const [dateFrom, setDateFromRaw] = useState(DATE_MIN);
  const [dateTo, setDateToRaw] = useState(DATE_MAX);
  const [paretoThreshold, setParetoThreshold] = useState(80);
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(() => new Set(ALL_BUCKET_LABELS));

  const validCategories = useMemo(() => new Set(allCategoryNames(data)), [data]);
  const validSuppliers = useMemo(() => new Set(allSupplierNames(data)), [data]);
  const categories = useMemo(
    () => categoriesRaw.filter((c) => validCategories.has(c)),
    [categoriesRaw, validCategories]
  );
  const suppliers = useMemo(
    () => suppliersRaw.filter((s) => validSuppliers.has(s)),
    [suppliersRaw, validSuppliers]
  );

  function setCategories(values: string[]) {
    setCategoriesRaw(values);
    // Cascade: drop any selected supplier whose dominant category is no
    // longer among the newly-selected categories.
    if (suppliers.length > 0) {
      const stillValid = new Set(cascadingSupplierOptions(data, values));
      const pruned = suppliers.filter((s) => stillValid.has(s));
      if (pruned.length !== suppliers.length) setSuppliersRaw(pruned);
    }
  }

  function setSuppliers(values: string[]) {
    setSuppliersRaw(values);
    if (categories.length > 0) {
      const stillValid = new Set(cascadingCategoryOptions(data, values));
      const pruned = categories.filter((c) => stillValid.has(c));
      if (pruned.length !== categories.length) setCategoriesRaw(pruned);
    }
  }

  // ISO "YYYY-MM-DD" strings sort correctly as plain strings.
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

  function resetFilters() {
    setCategoriesRaw([]);
    setSuppliersRaw([]);
    setPlants([]);
    setSourceSystems([]);
    setDateFromRaw(DATE_MIN);
    setDateToRaw(DATE_MAX);
    setParetoThreshold(80);
    setSelectedBuckets(new Set(ALL_BUCKET_LABELS));
  }

  const filters: TailSpendFilterState = useMemo(
    () => ({ categories, suppliers, plants, sourceSystems, dateFrom, dateTo, paretoThreshold, selectedBuckets }),
    [categories, suppliers, plants, sourceSystems, dateFrom, dateTo, paretoThreshold, selectedBuckets]
  );

  const options = useMemo(
    () => ({
      categories: cascadingCategoryOptions(data, suppliers),
      suppliers: cascadingSupplierOptions(data, categories),
      plants: data.sapFilterOptions.plantSites,
      sourceSystems: data.sapFilterOptions.sourceSystems,
    }),
    [data, categories, suppliers]
  );

  return {
    filters,
    options,
    setCategories,
    setSuppliers,
    setPlants,
    setSourceSystems,
    setDateFrom,
    setDateTo,
    setParetoThreshold,
    toggleBucket,
    resetFilters,
  };
}
