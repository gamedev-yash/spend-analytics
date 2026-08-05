"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  applyCrossFilter,
  applyFilters,
  bubbleData,
  consolidationTable,
  crossBuOverlap,
  generateInsight,
  heatmapMatrix,
  kpis,
  suppliersPerCategory,
  trend,
} from "../lib/metrics";
import type {
  CategoryStat,
  ConsolidationRow,
  CrossFilter,
  GlobalFilters,
  GroupMode,
  HeatmapData,
  InsightSegment,
  KpiSet,
  MasterPayload,
  MasterRow,
  SankeyData,
  TrendPoint,
} from "../lib/types";

/** Everything the six views + KPI ribbon consume, recomputed per state change. */
interface FragmentationDerived {
  /** Rows under the global filter bar only. */
  dfGlobal: MasterRow[];
  /** Rows under global filters + the click cross-filter — feeds most views. */
  df: MasterRow[];
  kpiSet: KpiSet;
  /** Reflects global filters only, never the transient chart click. */
  insight: InsightSegment[];
  heatmap: HeatmapData;
  bar: { stats: CategoryStat[]; median: number };
  bubble: { stats: CategoryStat[]; medSpend: number; medSup: number };
  sankey: SankeyData;
  /** Always computed over the full globally-filtered range (like the prototype). */
  trendPoints: TrendPoint[];
  tableRows: ConsolidationRow[];
}

interface FragmentationStore {
  payload: MasterPayload;
  filters: GlobalFilters;
  mode: GroupMode;
  crossFilter: CrossFilter | null;
  /** "Hindustan Zinc · MRO & Spares" — empty string when no cross-filter. */
  crossFilterLabel: string;
  /** Plant/L1 options narrowed by every OTHER active filter — real cascading over the raw row set, not a static list. */
  options: {
    plants: { code: string; name: string }[];
    l1s: string[];
  };
  /** Cascades: drops any now-invalid L1 selection whose rows disappear under the new plant selection. */
  setPlants: (plants: string[]) => void;
  /** Cascades: drops any now-invalid plant selection whose rows disappear under the new L1 selection. */
  setL1s: (l1s: string[]) => void;
  setDateRange: (dateFrom: string, dateTo: string) => void;
  setMode: (mode: GroupMode) => void;
  /** Heatmap cell click — clicking the focused cell again clears the focus. */
  toggleHeatmapCell: (plantName: string, categoryL1: string) => void;
  /** Bar / bubble click — clicking the focused category again clears it. */
  toggleCategory: (categoryL2: string) => void;
  clearCrossFilter: () => void;
  /** Resets every dropdown, date, and toggle back to its default. */
  resetFilters: () => void;
  derived: FragmentationDerived;
}

const StoreContext = createContext<FragmentationStore | null>(null);

/** Default window: the last 12 months of available data (prototype parity). */
export function defaultDateRange(dateMin: string, dateMax: string): { from: string; to: string } {
  const max = new Date(`${dateMax}T00:00:00Z`);
  const from = new Date(max.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from: from > dateMin ? from : dateMin, to: dateMax };
}

export function FragmentationStoreProvider({
  payload,
  children,
}: {
  payload: MasterPayload;
  children: ReactNode;
}) {
  const initialRange = defaultDateRange(payload.dateMin, payload.dateMax);
  const [plants, setPlantsRaw] = useState<string[]>([]);
  const [l1s, setL1sRaw] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [mode, setMode] = useState<GroupMode>("vendor");
  const [crossFilter, setCrossFilter] = useState<CrossFilter | null>(null);

  const filters = useMemo<GlobalFilters>(
    () => ({ plants, l1s, dateFrom, dateTo }),
    [plants, l1s, dateFrom, dateTo]
  );

  // Cascading options: what each dropdown should actually offer given every
  // OTHER active filter (including the date range), computed by re-running
  // the same applyFilters the rest of the page uses — no separate lookup
  // table to keep in sync, since it's the exact same row set.
  const options = useMemo(() => {
    const rowsForPlants = applyFilters(payload.rows, { plants: [], l1s, dateFrom, dateTo });
    const validPlantCodes = new Set(rowsForPlants.map((r) => r.plant));
    const rowsForL1s = applyFilters(payload.rows, { plants, l1s: [], dateFrom, dateTo });
    const validL1Names = new Set(rowsForL1s.map((r) => r.l1));
    return {
      plants: payload.plantOptions.filter((p) => validPlantCodes.has(p.code)),
      l1s: payload.l1Options.filter((l1) => validL1Names.has(l1)),
    };
  }, [payload.rows, payload.plantOptions, payload.l1Options, plants, l1s, dateFrom, dateTo]);

  function setPlants(next: string[]) {
    setPlantsRaw(next);
    if (l1s.length === 0) return;
    const rows = applyFilters(payload.rows, { plants: next, l1s: [], dateFrom, dateTo });
    const stillValid = new Set(rows.map((r) => r.l1));
    const pruned = l1s.filter((l1) => stillValid.has(l1));
    if (pruned.length !== l1s.length) setL1sRaw(pruned);
  }

  function setL1s(next: string[]) {
    setL1sRaw(next);
    if (plants.length === 0) return;
    const rows = applyFilters(payload.rows, { plants: [], l1s: next, dateFrom, dateTo });
    const stillValid = new Set(rows.map((r) => r.plant));
    const pruned = plants.filter((p) => stillValid.has(p));
    if (pruned.length !== plants.length) setPlantsRaw(pruned);
  }

  function setDateRange(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
    // Narrowing the date window can invalidate previously-valid plant/L1
    // selections too — re-check both against the new window.
    const rows = applyFilters(payload.rows, { plants: [], l1s: [], dateFrom: from, dateTo: to });
    const validPlantCodes = new Set(rows.map((r) => r.plant));
    const validL1Names = new Set(rows.map((r) => r.l1));
    setPlantsRaw((current) => {
      const pruned = current.filter((p) => validPlantCodes.has(p));
      return pruned.length === current.length ? current : pruned;
    });
    setL1sRaw((current) => {
      const pruned = current.filter((l1) => validL1Names.has(l1));
      return pruned.length === current.length ? current : pruned;
    });
  }

  function resetFilters() {
    setPlantsRaw([]);
    setL1sRaw([]);
    const reset = defaultDateRange(payload.dateMin, payload.dateMax);
    setDateFrom(reset.from);
    setDateTo(reset.to);
    setMode("vendor");
    setCrossFilter(null);
  }

  const derived = useMemo<FragmentationDerived>(() => {
    const dfGlobal = applyFilters(payload.rows, filters);
    const df = applyCrossFilter(dfGlobal, crossFilter);
    const { stats: barStats, median } = suppliersPerCategory(df, mode);
    return {
      dfGlobal,
      df,
      kpiSet: kpis(df, mode),
      insight: generateInsight(payload.rows, filters),
      heatmap: heatmapMatrix(df, mode),
      bar: { stats: barStats, median },
      bubble: bubbleData(df, mode),
      sankey: crossBuOverlap(df, mode),
      trendPoints: trend(dfGlobal, mode),
      tableRows: consolidationTable(df),
    };
  }, [payload.rows, filters, mode, crossFilter]);

  const crossFilterLabel = useMemo(() => {
    if (!crossFilter) return "";
    return [crossFilter.plantName, crossFilter.categoryL1, crossFilter.categoryL2]
      .filter(Boolean)
      .join(" · ");
  }, [crossFilter]);

  const store: FragmentationStore = {
    payload,
    filters,
    mode,
    crossFilter,
    crossFilterLabel,
    options,
    setPlants,
    setL1s,
    setDateRange,
    setMode,
    toggleHeatmapCell: (plantName, categoryL1) =>
      setCrossFilter((current) => {
        const isSameCell =
          current?.plantName === plantName &&
          current?.categoryL1 === categoryL1 &&
          !current?.categoryL2;
        return isSameCell ? null : { plantName, categoryL1 };
      }),
    toggleCategory: (categoryL2) =>
      setCrossFilter((current) =>
        current?.categoryL2 === categoryL2 ? null : { categoryL2 }
      ),
    clearCrossFilter: () => setCrossFilter(null),
    resetFilters,
    derived,
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useFragmentation(): FragmentationStore {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useFragmentation must be used inside FragmentationStoreProvider");
  }
  return store;
}
