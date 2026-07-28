"use client";

// Widget-facing side of the data layer: every hook here builds a QueryPayload,
// hands it to the active IDataProvider, and returns render-ready values. Nothing
// above these hooks touches dataset rows, so the same components work against a
// browser-side CSV or a database.

import { useEffect, useState } from "react";
import { useDataProvider } from "@/context/DatasetsContext";
import {
  buildDistinctValuesPayload,
  buildRowCountPayload,
  buildWidgetPayload,
  distinctValuesFromResult,
  kpiValueFromResult,
  rowCountFromResult,
  seriesFromResult,
} from "@/lib/widget-query";
import type { SeriesPoint } from "@/lib/widget-data";
import type { QueryFilter, QueryPayload, QueryResult } from "@/types/data-provider";
import type { WidgetConfig } from "@/types/custom-dashboard";
import type { Dataset } from "@/types/dataset";

const NO_FILTERS: QueryFilter[] = [];
const EMPTY_SERIES: SeriesPoint[] = [];
const EMPTY_OPTIONS = new Map<string, string[]>();

interface ProviderQueryState<T> {
  data: T;
  /** A query for the current payload is in flight. */
  loading: boolean;
  /**
   * A result has arrived at least once. Widgets keep showing the previous data
   * while a refetch runs, so this — not `loading` — is what gates the skeleton.
   */
  ready: boolean;
  error: string | null;
}

/** What the last resolved query left behind, tagged with the payload that produced it. */
interface SettledQuery<T> {
  key: string | null;
  data: T;
  ready: boolean;
  error: string | null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Query failed.";
}

/**
 * Run one payload against the active provider and map the result.
 *
 * The effect keys off the serialized payload, so callers can rebuild it inline
 * every render without memoizing; `map` must be a module-level function for the
 * same reason. `loading` is derived by comparing that key against the settled
 * one, which keeps the effect down to a single setState in the resolve handler.
 */
function useProviderQuery<T>(
  payload: QueryPayload | null,
  map: (result: QueryResult, payload: QueryPayload) => T,
  empty: T
): ProviderQueryState<T> {
  const provider = useDataProvider();
  const payloadKey = payload === null ? null : JSON.stringify(payload);

  const [settled, setSettled] = useState<SettledQuery<T>>({
    key: null,
    data: empty,
    ready: false,
    error: null,
  });

  useEffect(() => {
    if (payloadKey === null) return;
    const request = JSON.parse(payloadKey) as QueryPayload;
    let active = true;
    provider.queryWidgetData(request).then(
      (result) => {
        if (active) setSettled({ key: payloadKey, data: map(result, request), ready: true, error: null });
      },
      (err: unknown) => {
        if (active) setSettled((prev) => ({ ...prev, key: payloadKey, error: errorMessage(err) }));
      }
    );
    return () => {
      active = false;
    };
  }, [provider, payloadKey, map]);

  const current = settled.key === payloadKey;
  return {
    data: settled.data,
    loading: payloadKey !== null && !current,
    ready: settled.ready,
    // An error belongs to the payload that produced it — a new one starts clean.
    error: current ? settled.error : null,
  };
}

export interface WidgetQueryState {
  /** Grouped points for bar/line/pie/donut/table widgets. */
  series: SeriesPoint[];
  /** Scalar for a KPI tile. */
  kpiValue: number;
  /** Rows behind the widget after filters — the KPI tile's row count. */
  totalMatchingRows: number;
  loading: boolean;
  ready: boolean;
  error: string | null;
}

function widgetDataFromResult(
  result: QueryResult,
  payload: QueryPayload
): { series: SeriesPoint[]; kpiValue: number; totalMatchingRows: number } {
  return {
    series: seriesFromResult(result, payload),
    kpiValue: kpiValueFromResult(result),
    totalMatchingRows: rowCountFromResult(result),
  };
}

const EMPTY_WIDGET_DATA = { series: EMPTY_SERIES, kpiValue: 0, totalMatchingRows: 0 };

/**
 * Everything one widget needs to render, aggregated by the active provider.
 * A config that can't be answered (missing or renamed columns) resolves to empty
 * values without issuing a query — isWidgetRenderable/widgetIssue explain why.
 */
export function useWidgetQuery(
  dataset: Dataset,
  config: WidgetConfig,
  filters: QueryFilter[] = NO_FILTERS
): WidgetQueryState {
  const payload = buildWidgetPayload(dataset, config, filters);
  const { data, loading, ready, error } = useProviderQuery(
    payload,
    widgetDataFromResult,
    EMPTY_WIDGET_DATA
  );
  return { ...data, loading, ready, error };
}

export interface RowCountState {
  /** Rows matching the filters. */
  matching: number;
  /** Rows in the dataset with no filters applied. */
  total: number;
  ready: boolean;
}

/** Filtered and unfiltered row counts for a dataset — the dashboard header badge. */
export function useRowCount(datasetId: string | null, filters: QueryFilter[] = NO_FILTERS): RowCountState {
  const total = useProviderQuery(
    datasetId === null ? null : buildRowCountPayload(datasetId),
    rowCountFromResult,
    0
  );
  // Unfiltered, the two counts are the same query — don't run it twice.
  const filtered = useProviderQuery(
    datasetId === null || filters.length === 0 ? null : buildRowCountPayload(datasetId, filters),
    rowCountFromResult,
    0
  );
  const unfiltered = filters.length === 0;
  return {
    matching: unfiltered ? total.data : filtered.data,
    total: total.data,
    ready: total.ready && (unfiltered || filtered.ready),
  };
}

export interface FilterOptionsState {
  /** Column id → its distinct values, ascending. */
  options: Map<string, string[]>;
  ready: boolean;
}

/**
 * Distinct values for each of `fields`, for filter dropdowns. One query per
 * column, so the option lists come from the provider rather than a row scan.
 */
export function useFilterOptions(datasetId: string | null, fields: string[]): FilterOptionsState {
  const provider = useDataProvider();
  const fieldsKey = JSON.stringify(fields);
  const queryKey = datasetId === null || fields.length === 0 ? null : `${datasetId}|${fieldsKey}`;
  const [settled, setSettled] = useState<{ key: string | null; options: Map<string, string[]> }>({
    key: null,
    options: EMPTY_OPTIONS,
  });

  useEffect(() => {
    if (datasetId === null) return;
    const columns = JSON.parse(fieldsKey) as string[];
    if (columns.length === 0) return;
    const key = `${datasetId}|${fieldsKey}`;
    let active = true;
    Promise.all(
      columns.map(async (field): Promise<[string, string[]]> => {
        const payload = buildDistinctValuesPayload(datasetId, field);
        const result = await provider.queryWidgetData(payload);
        return [field, distinctValuesFromResult(result, payload)];
      })
    ).then(
      (entries) => {
        if (active) setSettled({ key, options: new Map(entries) });
      },
      (err: unknown) => {
        if (!active) return;
        console.warn("useFilterOptions: could not load filter values", err);
        setSettled({ key, options: EMPTY_OPTIONS });
      }
    );
    return () => {
      active = false;
    };
  }, [provider, datasetId, fieldsKey]);

  // Previous options stay on screen while a reload runs, so the dropdowns never
  // blink back to "All …" only.
  return { options: settled.options, ready: queryKey === null || settled.key === queryKey };
}
