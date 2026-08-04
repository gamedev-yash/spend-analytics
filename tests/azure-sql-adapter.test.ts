// AzureSqlAdapter routing and fallback behaviour, with fetch and the fallback
// provider both injected so no server or browser is involved.
//
//   npm test

import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { AzureSqlAdapter } from "@/lib/adapters/azure-sql-adapter";
import type { ColumnMeta } from "@/lib/infer";
import type { IDataProvider, QueryPayload, QueryResult } from "@/types/data-provider";
import type { Dataset } from "@/types/dataset";

const LOCAL_DATASET_ID = "ds-uploaded-csv";
const SERVER_DATASET_ID = "fact_po_items";

const PAYLOAD: QueryPayload = {
  datasetId: SERVER_DATASET_ID,
  dimensions: ["category_l1_name"],
  measures: [{ field: "net_order_value_inr", aggregation: "sum", alias: "value" }],
};

const FALLBACK_RESULT: QueryResult = {
  rows: [{ category_l1_name: "from-fallback", value: 1 }],
  totalMatchingRows: 1,
  executionTimeMs: 0.1,
};

const API_RESULT: QueryResult = {
  rows: [{ category_l1_name: "from-api", value: 999 }],
  totalMatchingRows: 10000,
  executionTimeMs: 42,
};

/** Stub fallback whose calls can be counted, and which can be made to fail. */
function makeFallback(options: { throws?: boolean } = {}): IDataProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: "stub-fallback",
    calls,
    async getDatasets(): Promise<Dataset[]> {
      calls.push("getDatasets");
      return [
        {
          id: LOCAL_DATASET_ID,
          name: "uploaded.csv",
          source: "upload",
          rows: [],
          columns: [],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ];
    },
    async getDatasetMetadata(datasetId: string): Promise<ColumnMeta[]> {
      calls.push(`getDatasetMetadata:${datasetId}`);
      return [{ id: "local_col", name: "Local", type: "category", distinctCount: 3 }];
    },
    async queryWidgetData(payload: QueryPayload): Promise<QueryResult> {
      calls.push(`queryWidgetData:${payload.datasetId}`);
      if (options.throws) throw new Error("fallback has no rows for this dataset");
      return FALLBACK_RESULT;
    },
  };
}

/** fetch stub returning a fixed status/body, recording every request. */
function makeFetch(
  responder: (url: string, init?: RequestInit) => { status: number; body: unknown } | Error
) {
  const requests: { url: string; method: string; body?: string }[] = [];
  const impl = ((url: string, init?: RequestInit) => {
    requests.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const outcome = responder(url, init);
    if (outcome instanceof Error) return Promise.reject(outcome);
    return Promise.resolve(
      new Response(JSON.stringify(outcome.body), {
        status: outcome.status,
        headers: { "Content-Type": "application/json" },
      })
    );
  }) as unknown as typeof fetch;
  return { impl, requests };
}

const okQuery = () => ({ status: 200, body: { success: true, source: "azure-sql", data: API_RESULT } });

describe("AzureSqlAdapter routing", () => {
  let warn: ReturnType<typeof mock.method>;

  beforeEach(() => {
    // The adapter narrates fallbacks; keep the test output readable.
    warn = mock.method(console, "warn", () => undefined);
  });

  it("answers browser-held datasets locally without touching the network", async () => {
    const fallback = makeFallback();
    const { impl, requests } = makeFetch(okQuery);
    const adapter = new AzureSqlAdapter({
      fallback,
      fetchImpl: impl,
      isLocalDataset: (id) => id === LOCAL_DATASET_ID,
    });

    const result = await adapter.queryWidgetData({ ...PAYLOAD, datasetId: LOCAL_DATASET_ID });

    assert.deepEqual(result, FALLBACK_RESULT);
    assert.deepEqual(fallback.calls, [`queryWidgetData:${LOCAL_DATASET_ID}`]);
    assert.equal(requests.length, 0, "an uploaded CSV must not be posted to the API");
    // Routing locally is correct behaviour, not a degradation, so nothing is logged.
    assert.equal(warn.mock.callCount(), 0);
  });

  it("posts warehouse datasets to /api/v1/query and unwraps the envelope", async () => {
    const fallback = makeFallback();
    const { impl, requests } = makeFetch(okQuery);
    const adapter = new AzureSqlAdapter({ fallback, fetchImpl: impl });

    const result = await adapter.queryWidgetData(PAYLOAD);

    assert.deepEqual(result, API_RESULT);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    assert.ok(requests[0].url.endsWith("/api/v1/query"), requests[0].url);
    assert.deepEqual(JSON.parse(requests[0].body ?? "{}"), PAYLOAD);
    assert.equal(fallback.calls.length, 0, "a healthy API must not invoke the fallback");
  });

  it("matches the QueryResult contract IDataProvider expects", async () => {
    const { impl } = makeFetch(okQuery);
    const adapter = new AzureSqlAdapter({ fallback: makeFallback(), fetchImpl: impl });

    const result: QueryResult = await adapter.queryWidgetData(PAYLOAD);

    assert.ok(Array.isArray(result.rows));
    assert.equal(typeof result.totalMatchingRows, "number");
    assert.equal(typeof result.executionTimeMs, "number");
    assert.deepEqual(Object.keys(result).sort(), ["executionTimeMs", "rows", "totalMatchingRows"]);
  });

  it("satisfies IDataProvider structurally", () => {
    const adapter: IDataProvider = new AzureSqlAdapter({ fallback: makeFallback() });
    assert.equal(adapter.id, "azure-sql");
    assert.equal(typeof adapter.getDatasets, "function");
    assert.equal(typeof adapter.getDatasetMetadata, "function");
    assert.equal(typeof adapter.queryWidgetData, "function");
  });
});

describe("AzureSqlAdapter fallback on failure", () => {
  beforeEach(() => {
    mock.method(console, "warn", () => undefined);
  });

  const failures: [string, () => { status: number; body: unknown } | Error][] = [
    ["500 from the route", () => ({ status: 500, body: { success: false, error: "boom" } })],
    ["400 validation error", () => ({ status: 400, body: { success: false, error: "Unknown field" } })],
    ["503 database unavailable", () => ({ status: 503, body: { success: false, error: "no driver" } })],
    ["network failure", () => new TypeError("Failed to fetch")],
    ["200 with success:false", () => ({ status: 200, body: { success: false, error: "odd" } })],
    ["non-JSON body", () => ({ status: 502, body: undefined })],
  ];

  for (const [label, responder] of failures) {
    it(`falls back to the CSV adapter on ${label}`, async () => {
      const fallback = makeFallback();
      const { impl, requests } = makeFetch(responder);
      const adapter = new AzureSqlAdapter({ fallback, fetchImpl: impl });

      const result = await adapter.queryWidgetData(PAYLOAD);

      assert.deepEqual(result, FALLBACK_RESULT, "the UI must still receive rows");
      assert.equal(requests.length, 1, "the API was attempted once");
      assert.deepEqual(fallback.calls, [`queryWidgetData:${SERVER_DATASET_ID}`]);
    });
  }

  it("logs the reason it fell back", async () => {
    const logged: string[] = [];
    mock.restoreAll();
    mock.method(console, "warn", (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const { impl } = makeFetch(() => ({ status: 500, body: { success: false, error: "engine offline" } }));
    const adapter = new AzureSqlAdapter({ fallback: makeFallback(), fetchImpl: impl });

    await adapter.queryWidgetData(PAYLOAD);

    assert.equal(logged.length, 1);
    assert.match(logged[0], /engine offline/);
    assert.match(logged[0], /Falling back/);
  });

  it("rethrows the API error when the fallback cannot help either", async () => {
    // The real case: a warehouse dataset has no rows in the browser, so the
    // fallback's own complaint would bury the actual cause.
    const fallback = makeFallback({ throws: true });
    const { impl } = makeFetch(() => ({ status: 503, body: { success: false, error: "query engine offline" } }));
    const adapter = new AzureSqlAdapter({ fallback, fetchImpl: impl });

    await assert.rejects(
      () => adapter.queryWidgetData(PAYLOAD),
      (err: Error) => {
        assert.match(err.message, /query engine offline/);
        assert.doesNotMatch(err.message, /fallback has no rows/);
        return true;
      }
    );
  });
});

describe("AzureSqlAdapter metadata", () => {
  beforeEach(() => {
    mock.method(console, "warn", () => undefined);
  });

  const serverDatasets = [
    {
      id: SERVER_DATASET_ID,
      name: "Purchase Order Items",
      rows: [],
      columns: [{ id: "vendor_name", name: "Vendor", type: "category", distinctCount: 160 }],
      createdAt: "1970-01-01T00:00:00.000Z",
    },
  ];

  it("lists warehouse datasets alongside local ones and marks their source", async () => {
    const { impl } = makeFetch(() => ({ status: 200, body: { success: true, data: serverDatasets } }));
    const adapter = new AzureSqlAdapter({ fallback: makeFallback(), fetchImpl: impl });

    const datasets = await adapter.getDatasets();

    assert.deepEqual(
      datasets.map((d) => [d.id, d.source]),
      [[SERVER_DATASET_ID, "server"], [LOCAL_DATASET_ID, "upload"]]
    );
    assert.deepEqual(datasets[0].rows, [], "a warehouse dataset carries no rows client-side");
  });

  it("fetches the dataset list once however many queries ask for it", async () => {
    const { impl, requests } = makeFetch((url) =>
      url.includes("/datasets")
        ? { status: 200, body: { success: true, data: serverDatasets } }
        : okQuery()
    );
    const adapter = new AzureSqlAdapter({ fallback: makeFallback(), fetchImpl: impl });

    await Promise.all([
      adapter.getDatasetMetadata(SERVER_DATASET_ID),
      adapter.getDatasetMetadata(SERVER_DATASET_ID),
      adapter.getDatasets(),
    ]);

    assert.equal(requests.filter((r) => r.url.includes("/datasets")).length, 1);
  });

  it("re-fetches after invalidateMetadata", async () => {
    const { impl, requests } = makeFetch(() => ({ status: 200, body: { success: true, data: serverDatasets } }));
    const adapter = new AzureSqlAdapter({ fallback: makeFallback(), fetchImpl: impl });

    await adapter.getDatasets();
    adapter.invalidateMetadata();
    await adapter.getDatasets();

    assert.equal(requests.filter((r) => r.url.includes("/datasets")).length, 2);
  });

  it("returns registry columns for a warehouse dataset", async () => {
    const { impl } = makeFetch(() => ({ status: 200, body: { success: true, data: serverDatasets } }));
    const fallback = makeFallback();
    const adapter = new AzureSqlAdapter({ fallback, fetchImpl: impl });

    const columns = await adapter.getDatasetMetadata(SERVER_DATASET_ID);

    assert.deepEqual(columns.map((c) => c.id), ["vendor_name"]);
    assert.equal(fallback.calls.length, 0);
  });

  it("falls back to local metadata when the endpoint is down", async () => {
    const { impl } = makeFetch(() => new TypeError("Failed to fetch"));
    const fallback = makeFallback();
    const adapter = new AzureSqlAdapter({ fallback, fetchImpl: impl });

    const columns = await adapter.getDatasetMetadata(SERVER_DATASET_ID);

    assert.deepEqual(columns.map((c) => c.id), ["local_col"]);
    assert.ok(fallback.calls.includes(`getDatasetMetadata:${SERVER_DATASET_ID}`));
  });

  it("still lists local datasets when the endpoint is down", async () => {
    const { impl } = makeFetch(() => new TypeError("Failed to fetch"));
    const adapter = new AzureSqlAdapter({ fallback: makeFallback(), fetchImpl: impl });

    const datasets = await adapter.getDatasets();

    assert.deepEqual(datasets.map((d) => d.id), [LOCAL_DATASET_ID]);
  });
});
