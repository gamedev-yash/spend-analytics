"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AzureSqlAdapter } from "@/lib/adapters/azure-sql-adapter";
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

/** Which IDataProvider implementation answers widget queries. */
export type DataProviderType = "client-csv" | "azure-sql";

export const DATA_PROVIDER_LABELS: Record<DataProviderType, string> = {
  "client-csv": "CSV Mode",
  "azure-sql": "Azure SQL Mode",
};

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
   * Where every widget reads its numbers from — the CSV engine in this browser
   * or the REST query engine over Azure SQL. Widgets never branch on this; they
   * send the same QueryPayload either way.
   */
  activeProvider: IDataProvider;
  /** Which implementation activeProvider is. */
  providerType: DataProviderType;
  /** Switch providers live. Persists, so a reload keeps the chosen mode. */
  setProviderType: (type: DataProviderType) => void;
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
// Data providers
//
// Both read the dataset store through a getter rather than a captured value, so
// they always see the live datasets. Module singletons because they are
// stateless — a stable identity keeps them out of every hook's dependencies.
// ---------------------------------------------------------------------------

const clientCsvAdapter = new ClientCsvAdapter(() => getSnapshot().datasets);

const azureSqlAdapter = new AzureSqlAdapter({
  fallback: clientCsvAdapter,
  // An uploaded CSV only exists in this browser, so it is answered here rather
  // than posted to an API that has never heard of it.
  isLocalDataset: (datasetId) => getSnapshot().datasets.some((d) => d.id === datasetId),
});

const PROVIDERS: Record<DataProviderType, IDataProvider> = {
  "client-csv": clientCsvAdapter,
  "azure-sql": azureSqlAdapter,
};

// ---------------------------------------------------------------------------
// Provider-mode store
//
// Same externalized pattern as the dataset store: the server snapshot is the
// env default so SSR is deterministic, then the client snapshot (hydrated from
// localStorage) takes over. Persisting means a mode chosen from the header
// survives a reload.
// ---------------------------------------------------------------------------

const PROVIDER_STORAGE_KEY = "app_data_provider";

function isProviderType(value: unknown): value is DataProviderType {
  return value === "client-csv" || value === "azure-sql";
}

/** NEXT_PUBLIC_DATA_SOURCE_PROVIDER, defaulting to azure-sql. */
function envProviderType(): DataProviderType {
  const configured = process.env.NEXT_PUBLIC_DATA_SOURCE_PROVIDER;
  if (configured === undefined || configured === "") return "azure-sql";
  if (isProviderType(configured)) return configured;
  console.warn(
    `DatasetsContext: NEXT_PUBLIC_DATA_SOURCE_PROVIDER="${configured}" is not a known provider; using azure-sql.`
  );
  return "azure-sql";
}

let providerState: DataProviderType | null = null;
const providerListeners = new Set<() => void>();

function loadPersistedProvider(): DataProviderType {
  if (typeof window === "undefined") return envProviderType();
  try {
    const raw = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
    return isProviderType(raw) ? raw : envProviderType();
  } catch {
    return envProviderType();
  }
}

function getProviderSnapshot(): DataProviderType {
  if (providerState === null) providerState = loadPersistedProvider();
  return providerState;
}

function getProviderServerSnapshot(): DataProviderType {
  return envProviderType();
}

function subscribeProvider(listener: () => void): () => void {
  providerListeners.add(listener);
  return () => {
    providerListeners.delete(listener);
  };
}

function setStoredProviderType(type: DataProviderType): void {
  if (getProviderSnapshot() === type) return;
  providerState = type;
  try {
    window.localStorage.setItem(PROVIDER_STORAGE_KEY, type);
  } catch (err) {
    console.warn("DatasetsContext: unable to persist the provider mode", err);
  }
  // Warehouse metadata may have changed while we were away.
  if (type === "azure-sql") azureSqlAdapter.invalidateMetadata();
  for (const listener of providerListeners) listener();
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DatasetsContext = createContext<DatasetsContextValue | null>(null);

const NO_SERVER_DATASETS: Dataset[] = [];

export function DatasetsProvider({
  children,
  provider,
}: {
  children: ReactNode;
  /**
   * Pin the provider, ignoring providerType and the header switcher — an escape
   * hatch for tests and embedded views.
   */
  provider?: IDataProvider;
}) {
  const { datasets: storedDatasets, activeDatasetId } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const providerType = useSyncExternalStore(
    subscribeProvider,
    getProviderSnapshot,
    getProviderServerSnapshot
  );
  const activeProvider = provider ?? PROVIDERS[providerType];

  // Warehouse tables the query API advertises. Held in React state rather than
  // the persisted store: they are discovered per session, not owned by this
  // browser, and must not survive a switch back to CSV mode.
  const [discovered, setDiscovered] = useState<Dataset[]>(NO_SERVER_DATASETS);

  useEffect(() => {
    if (providerType !== "azure-sql") return;
    let active = true;
    activeProvider.getDatasets().then(
      (all) => {
        if (active) setDiscovered(all.filter((dataset) => dataset.source === "server"));
      },
      (err: unknown) => {
        if (!active) return;
        console.warn("DatasetsContext: could not load warehouse datasets", err);
        setDiscovered(NO_SERVER_DATASETS);
      }
    );
    return () => {
      active = false;
    };
  }, [providerType, activeProvider]);

  // Derived rather than cleared in the effect, so CSV mode hides them
  // immediately instead of one render later.
  const serverDatasets = providerType === "azure-sql" ? discovered : NO_SERVER_DATASETS;

  const datasets = useMemo(
    () => (serverDatasets.length === 0 ? storedDatasets : [...serverDatasets, ...storedDatasets]),
    [serverDatasets, storedDatasets]
  );

  const uploadCsv = useCallback(async (file: File, pageTarget?: string): Promise<Dataset> => {
    const { rows, columns } = await clientCsvAdapter.parseCsv(file);
    const dataset: Dataset = {
      id: newDatasetId(),
      name: file.name,
      source: "upload",
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
        source: "upload",
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

  const setProviderType = useCallback((type: DataProviderType) => {
    setStoredProviderType(type);
  }, []);

  const value = useMemo<DatasetsContextValue>(
    () => ({
      datasets,
      activeDatasetId,
      activeProvider,
      providerType,
      setProviderType,
      setActiveDatasetId,
      uploadCsv,
      createJoinedDataset,
      getDatasetForPage,
      removeDataset,
    }),
    [
      datasets,
      activeDatasetId,
      activeProvider,
      providerType,
      setProviderType,
      setActiveDatasetId,
      uploadCsv,
      createJoinedDataset,
      getDatasetForPage,
      removeDataset,
    ]
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
