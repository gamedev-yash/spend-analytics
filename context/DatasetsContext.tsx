"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ClientCsvAdapter } from "@/lib/adapters/client-csv-adapter";
import { joinDatasets, joinKeysLabel, type JoinKeys } from "@/lib/join";
import type { IDataProvider } from "@/types/data-provider";
import type { Dataset } from "@/types/dataset";

export type { Dataset, DatasetRow, JoinInfo } from "@/types/dataset";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four core dashboard routes a dataset can be uploaded against. */
export const DASHBOARD_PAGE_KEYS = [
  "tail-spend",
  "spend-overview",
  "payment-terms",
  "supplier-fragmentation",
] as const;

export type DashboardPageKey = (typeof DASHBOARD_PAGE_KEYS)[number];

export interface CreateJoinedDatasetParams {
  name: string;
  leftId: string;
  rightId: string;
  /** One column id or an ordered composite (["EBELN", "EBELP"]) per side. */
  leftKey: JoinKeys;
  rightKey: JoinKeys;
  joinType: "inner" | "left";
  pageTarget?: string;
  /** Marks the join as auto-executed by the SAP auto-join engine. */
  auto?: boolean;
}

interface DatasetsState {
  datasets: Dataset[];
  activeDatasetId: string | null;
}

interface DatasetsContextValue extends DatasetsState {
  /**
   * Where every widget reads its numbers from. Defaults to the in-memory CSV
   * adapter; pass a different one to DatasetsProvider to move aggregation to a
   * server without touching a single widget.
   */
  activeProvider: IDataProvider;
  setActiveDatasetId: (id: string | null) => void;
  /** Parse a CSV file, infer columns, store the dataset, and persist. */
  uploadCsv: (file: File, pageTarget?: string) => Promise<Dataset>;
  /**
   * Materialize a composite dataset by joining two stored datasets in memory
   * (lib/join.ts). The result becomes an ordinary dataset (isJoined: true),
   * is set active, and persists via the same quota-degrading mechanism.
   * Throws when the source datasets/keys are invalid or the join is empty.
   */
  createJoinedDataset: (params: CreateJoinedDatasetParams) => Dataset;
  /** Newest dataset uploaded for the given page (active one preferred), or null. */
  getDatasetForPage: (pageKey: string) => Dataset | null;
  removeDataset: (id: string) => void;
}

// ---------------------------------------------------------------------------
// localStorage-backed store (module singleton).
//
// State lives outside React and components read it via useSyncExternalStore:
// the server snapshot is always empty, so SSR/hydration render the mock
// fallback, then the first client snapshot (lazily hydrated from
// localStorage) takes over without a hydration mismatch or effect-driven
// setState cascades.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "app_datasets";

const EMPTY_STATE: DatasetsState = { datasets: [], activeDatasetId: null };

let storeState: DatasetsState | null = null;
const listeners = new Set<() => void>();

function loadPersisted(): DatasetsState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<DatasetsState>;
    const datasets = Array.isArray(parsed.datasets)
      ? parsed.datasets.filter(
          (d): d is Dataset =>
            !!d && typeof d.id === "string" && Array.isArray(d.rows) && Array.isArray(d.columns)
        )
      : [];
    const activeDatasetId =
      typeof parsed.activeDatasetId === "string" &&
      datasets.some((d) => d.id === parsed.activeDatasetId)
        ? parsed.activeDatasetId
        : null;
    return { datasets, activeDatasetId };
  } catch {
    return EMPTY_STATE;
  }
}

/**
 * Persist to localStorage. Large uploads can exceed the ~5MB quota — when that
 * happens, drop the oldest datasets from the PERSISTED copy (they stay in
 * memory for this session) until the rest fits.
 */
function persistState(state: DatasetsState): void {
  if (typeof window === "undefined") return;
  let datasets = state.datasets;
  for (;;) {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ datasets, activeDatasetId: state.activeDatasetId })
      );
      return;
    } catch (err) {
      if (datasets.length === 0) {
        console.warn("DatasetsContext: unable to persist datasets to localStorage", err);
        return;
      }
      console.warn(
        `DatasetsContext: localStorage quota exceeded — dropping oldest dataset "${datasets[0].name}" from the persisted copy (kept in memory for this session).`
      );
      datasets = datasets.slice(1);
    }
  }
}

function getSnapshot(): DatasetsState {
  if (storeState === null) storeState = loadPersisted();
  return storeState;
}

function getServerSnapshot(): DatasetsState {
  return EMPTY_STATE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateStore(update: (prev: DatasetsState) => DatasetsState): void {
  storeState = update(getSnapshot());
  persistState(storeState);
  for (const listener of listeners) listener();
}

function newDatasetId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ds-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Data provider
//
// The default provider reads the store above through a getter rather than a
// captured value, so it always aggregates over the live datasets. It is a module
// singleton because it is stateless — nothing about it changes per render.
// ---------------------------------------------------------------------------

const clientCsvAdapter = new ClientCsvAdapter(() => getSnapshot().datasets);

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DatasetsContext = createContext<DatasetsContextValue | null>(null);

export function DatasetsProvider({
  children,
  provider = clientCsvAdapter,
}: {
  children: ReactNode;
  /** Override the data provider — e.g. a server-backed adapter. */
  provider?: IDataProvider;
}) {
  const { datasets, activeDatasetId } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const uploadCsv = useCallback(async (file: File, pageTarget?: string): Promise<Dataset> => {
    const { rows, columns } = await clientCsvAdapter.parseCsv(file);
    const dataset: Dataset = {
      id: newDatasetId(),
      name: file.name,
      pageKey: pageTarget,
      rows,
      columns,
      createdAt: new Date().toISOString(),
    };
    updateStore((prev) => ({
      datasets: [...prev.datasets, dataset],
      activeDatasetId: dataset.id,
    }));
    return dataset;
  }, []);

  const createJoinedDataset = useCallback(
    (params: CreateJoinedDatasetParams): Dataset => {
      const { datasets: current } = getSnapshot();
      const left = current.find((d) => d.id === params.leftId);
      const right = current.find((d) => d.id === params.rightId);
      if (!left) throw new Error("Left dataset not found.");
      if (!right) throw new Error("Right dataset not found.");
      if (left.id === right.id) throw new Error("Pick two different datasets to join.");

      const { rows, columns, matchedLeftRows } = joinDatasets(
        left,
        right,
        params.leftKey,
        params.rightKey,
        params.joinType
      );

      const dataset: Dataset = {
        id: newDatasetId(),
        name: params.name.trim() || `${left.name} + ${right.name}`,
        pageKey: params.pageTarget,
        rows,
        columns,
        createdAt: new Date().toISOString(),
        isJoined: true,
        joinInfo: {
          leftId: left.id,
          rightId: right.id,
          leftName: left.name,
          rightName: right.name,
          leftKey: joinKeysLabel(params.leftKey),
          rightKey: joinKeysLabel(params.rightKey),
          joinType: params.joinType,
          matchedLeftRows,
          auto: params.auto,
        },
      };
      updateStore((prev) => ({
        datasets: [...prev.datasets, dataset],
        activeDatasetId: dataset.id,
      }));
      return dataset;
    },
    []
  );

  const removeDataset = useCallback((id: string) => {
    updateStore((prev) => ({
      datasets: prev.datasets.filter((d) => d.id !== id),
      activeDatasetId: prev.activeDatasetId === id ? null : prev.activeDatasetId,
    }));
  }, []);

  const setActiveDatasetId = useCallback((id: string | null) => {
    updateStore((prev) => ({ ...prev, activeDatasetId: id }));
  }, []);

  const getDatasetForPage = useCallback(
    (pageKey: string): Dataset | null => {
      const candidates = datasets.filter((d) => d.pageKey === pageKey);
      if (candidates.length === 0) return null;
      const active = candidates.find((d) => d.id === activeDatasetId);
      if (active) return active;
      return candidates.reduce((newest, d) => (d.createdAt > newest.createdAt ? d : newest));
    },
    [datasets, activeDatasetId]
  );

  const value = useMemo<DatasetsContextValue>(
    () => ({
      datasets,
      activeDatasetId,
      activeProvider: provider,
      setActiveDatasetId,
      uploadCsv,
      createJoinedDataset,
      getDatasetForPage,
      removeDataset,
    }),
    [datasets, activeDatasetId, provider, setActiveDatasetId, uploadCsv, createJoinedDataset, getDatasetForPage, removeDataset]
  );

  return <DatasetsContext.Provider value={value}>{children}</DatasetsContext.Provider>;
}

export function useDatasets(): DatasetsContextValue {
  const ctx = useContext(DatasetsContext);
  if (!ctx) throw new Error("useDatasets must be used within a DatasetsProvider");
  return ctx;
}

/** The provider every widget query goes through. */
export function useDataProvider(): IDataProvider {
  return useDatasets().activeProvider;
}
