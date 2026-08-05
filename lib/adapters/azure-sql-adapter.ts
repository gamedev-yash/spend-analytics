// IDataProvider over the REST query engine: widgets keep sending QueryPayloads,
// but the aggregation happens in Azure SQL instead of the browser.
//
// Azure SQL is the mandatory engine — there is no CSV mode to fall back to. The
// one routing rule that remains is about where rows physically exist:
//
//   Uploaded CSVs never leave the browser. The server has no idea a dataset
//   called "ds-4f2c…" exists, so posting one would earn a 400 per widget. Those
//   are answered by the local engine — not as a failure, as the only possible
//   route for browser-held rows.
//
//   Warehouse datasets go to the API, strictly: a failure there propagates to
//   the widget's error state instead of silently degrading to a client-side
//   recomputation. The metadata surface (dataset listing, column metadata) may
//   still degrade to local knowledge — it drives pickers, not numbers.

import type { ColumnMeta } from "@/lib/infer";
import type { IDataProvider, QueryPayload, QueryResult } from "@/types/data-provider";
import type { Dataset } from "@/types/dataset";

/** Client-side ceiling on one request; the server enforces its own statement timeout. */
const REQUEST_TIMEOUT_MS = 30_000;

const QUERY_PATH = "/api/v1/query";
const DATASETS_PATH = "/api/v1/datasets";

export interface AzureSqlAdapterOptions {
  /** Serves datasets whose rows live in this browser (uploads and joins). */
  local: IDataProvider;
  /**
   * True when the dataset's rows live in this browser. Defaults to "never",
   * which routes everything through the API.
   */
  isLocalDataset?: (datasetId: string) => boolean;
  /** Origin prefix for the API; defaults to the current origin. */
  baseUrl?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  source?: string;
}

export class AzureSqlAdapter implements IDataProvider {
  readonly id = "azure-sql";

  private readonly local: IDataProvider;
  private readonly isLocalDataset: (datasetId: string) => boolean;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  /** In-flight or completed metadata fetch, shared by concurrent callers. */
  private datasetsPromise: Promise<Dataset[]> | null = null;

  constructor(options: AzureSqlAdapterOptions) {
    this.local = options.local;
    this.isLocalDataset = options.isLocalDataset ?? (() => false);
    this.baseUrl = options.baseUrl ?? "";
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  /** Warehouse datasets plus whatever is loaded in the browser. */
  async getDatasets(): Promise<Dataset[]> {
    const [server, local] = await Promise.all([
      this.fetchServerDatasets().catch((err: unknown) => {
        console.warn(`AzureSqlAdapter: could not list warehouse datasets — ${message(err)}`);
        return [] as Dataset[];
      }),
      this.local.getDatasets(),
    ]);
    return [...server, ...local];
  }

  async getDatasetMetadata(datasetId: string): Promise<ColumnMeta[]> {
    if (this.isLocalDataset(datasetId)) {
      return this.local.getDatasetMetadata(datasetId);
    }
    try {
      const datasets = await this.fetchServerDatasets();
      const match = datasets.find((dataset) => dataset.id === datasetId);
      if (match) return match.columns;
    } catch (err) {
      console.warn(`AzureSqlAdapter: metadata lookup for "${datasetId}" failed — ${message(err)}`);
    }
    return this.local.getDatasetMetadata(datasetId);
  }

  /**
   * Strict: a warehouse query either succeeds against the API or rejects with
   * the API's own error — no client-side recomputation. The only branch is for
   * datasets whose rows exist solely in this browser, which the server could
   * never answer at all.
   */
  async queryWidgetData(payload: QueryPayload): Promise<QueryResult> {
    if (this.isLocalDataset(payload.datasetId)) {
      return this.local.queryWidgetData(payload);
    }
    return this.postQuery(payload);
  }

  /** Forget the cached dataset list, so the next read re-fetches the warehouse metadata. */
  invalidateMetadata(): void {
    this.datasetsPromise = null;
  }

  private async postQuery(payload: QueryPayload): Promise<QueryResult> {
    const body = await this.request<QueryResult>(QUERY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!body.rows || !Array.isArray(body.rows)) {
      throw new Error("Query API returned no rows array.");
    }
    return {
      rows: body.rows,
      totalMatchingRows: body.totalMatchingRows,
      executionTimeMs: body.executionTimeMs,
    };
  }

  private fetchServerDatasets(): Promise<Dataset[]> {
    // Cached as the promise so a burst of widgets shares one round trip.
    this.datasetsPromise ??= this.request<Dataset[]>(DATASETS_PATH, { method: "GET" })
      .then((datasets) =>
        datasets.map((dataset) => ({ ...dataset, source: "server" as const, rows: [] }))
      )
      .catch((err: unknown) => {
        this.datasetsPromise = null;
        throw err;
      });
    return this.datasetsPromise;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const envelope = await this.readEnvelope<T>(response);
    if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
      throw new Error(
        envelope?.error ?? `${path} responded ${response.status} ${response.statusText}`.trim()
      );
    }
    return envelope.data;
  }

  /** A non-JSON body (a proxy error page, say) must read as a failure, not a crash. */
  private async readEnvelope<T>(response: Response): Promise<ApiEnvelope<T> | null> {
    try {
      return (await response.json()) as ApiEnvelope<T>;
    } catch {
      return null;
    }
  }
}

function message(err: unknown): string {
  if (err instanceof Error) {
    // AbortSignal.timeout surfaces as a TimeoutError with an opaque message.
    return err.name === "TimeoutError" ? `timed out after ${REQUEST_TIMEOUT_MS} ms` : err.message;
  }
  return String(err);
}
