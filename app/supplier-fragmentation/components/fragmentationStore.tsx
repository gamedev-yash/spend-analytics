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
  setPlants: (plants: string[]) => void;
  setL1s: (l1s: string[]) => void;
  setDateRange: (dateFrom: string, dateTo: string) => void;
  setMode: (mode: GroupMode) => void;
  /** Heatmap cell click — clicking the focused cell again clears the focus. */
  toggleHeatmapCell: (plantName: string, categoryL1: string) => void;
  /** Bar / bubble click — clicking the focused category again clears it. */
  toggleCategory: (categoryL2: string) => void;
  clearCrossFilter: () => void;
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
  const [plants, setPlants] = useState<string[]>([]);
  const [l1s, setL1s] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [mode, setMode] = useState<GroupMode>("vendor");
  const [crossFilter, setCrossFilter] = useState<CrossFilter | null>(null);

  const filters = useMemo<GlobalFilters>(
    () => ({ plants, l1s, dateFrom, dateTo }),
    [plants, l1s, dateFrom, dateTo]
  );

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
    setPlants,
    setL1s,
    setDateRange: (from, to) => {
      setDateFrom(from);
      setDateTo(to);
    },
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
