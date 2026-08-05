// AzureSqlAdapter routing and strict-failure behaviour, with fetch and the local
// provider both injected so no server or browser is involved.
//
// Azure SQL is the enforced engine: a warehouse query that fails REJECTS with
// the API's own error — it must never degrade to a client-side recomputation.
// The local provider exists only for datasets whose rows live in the browser
// (uploads/joins), which the server could never answer.
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

const LOCAL_RESULT: QueryResult = {
  rows: [{ category_l1_name: "from-local", value: 1 }],
  totalMatchingRows: 1,
  executionTimeMs: 0.1,
};

const API_RESULT: QueryResult = {
  rows: [{ category_l1_name: "from-api", value: 999 }],
  totalMatchingRows: 10000,
  executionTimeMs: 42,
};

/** Stub local provider whose calls can be counted. */
function makeLocal(): IDataProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: "stub-local",
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
      return LOCAL_RESULT;
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
    warn = mock.method(console, "warn", () => undefined);
  });

  it("answers browser-held datasets locally without touching the network", async () => {
    const local = makeLocal();
    const { impl, requests } = makeFetch(okQuery);
    const adapter = new AzureSqlAdapter({
      local,
      fetchImpl: impl,
      isLocalDataset: (id) => id === LOCAL_DATASET_ID,
    });

    const result = await adapter.queryWidgetData({ ...PAYLOAD, datasetId: LOCAL_DATASET_ID });

    assert.deepEqual(result, LOCAL_RESULT);
    assert.deepEqual(local.calls, [`queryWidgetData:${LOCAL_DATASET_ID}`]);
    assert.equal(requests.length, 0, "an uploaded CSV must not be posted to the API");
    // Routing locally is correct behaviour, not a degradation, so nothing is logged.
    assert.equal(warn.mock.callCount(), 0);
  });

  it("posts warehouse datasets to /api/v1/query and unwraps the envelope", async () => {
    const local = makeLocal();
    const { impl, requests } = makeFetch(okQuery);
    const adapter = new AzureSqlAdapter({ local, fetchImpl: impl });

    const result = await adapter.queryWidgetData(PAYLOAD);

    assert.deepEqual(result, API_RESULT);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    assert.ok(requests[0].url.endsWith("/api/v1/query"), requests[0].url);
    assert.deepEqual(JSON.parse(requests[0].body ?? "{}"), PAYLOAD);
    assert.equal(local.calls.length, 0, "a healthy API must not invoke the local engine");
  });

  it("matches the QueryResult contract IDataProvider expects", async () => {
    const { impl } = makeFetch(okQuery);
    const adapter = new AzureSqlAdapter({ local: makeLocal(), fetchImpl: impl });

    const result: QueryResult = await adapter.queryWidgetData(PAYLOAD);

    assert.ok(Array.isArray(result.rows));
    assert.equal(typeof result.totalMatchingRows, "number");
    assert.equal(typeof result.executionTimeMs, "number");
    assert.deepEqual(Object.keys(result).sort(), ["executionTimeMs", "rows", "totalMatchingRows"]);
  });

  it("satisfies IDataProvider structurally", () => {
    const adapter: IDataProvider = new AzureSqlAdapter({ local: makeLocal() });
    assert.equal(adapter.id, "azure-sql");
    assert.equal(typeof adapter.getDatasets, "function");
    assert.equal(typeof adapter.getDatasetMetadata, "function");
    assert.equal(typeof adapter.queryWidgetData, "function");
  });
});

describe("AzureSqlAdapter strict failure propagation", () => {
  beforeEach(() => {
    mock.method(console, "warn", () => undefined);
  });

  const failures: [string, () => { status: number; body: unknown } | Error, RegExp][] = [
    ["500 from the route", () => ({ status: 500, body: { success: false, error: "boom" } }), /boom/],
    ["400 validation error", () => ({ status: 400, body: { success: false, error: "Unknown field" } }), /Unknown field/],
    ["503 database unavailable", () => ({ status: 503, body: { success: false, error: "no driver" } }), /no driver/],
    ["network failure", () => new TypeError("Failed to fetch"), /Failed to fetch/],
    ["200 with success:false", () => ({ status: 200, body: { success: false, error: "odd" } }), /odd/],
    ["non-JSON body", () => ({ status: 502, body: undefined }), /502/],
  ];

  for (const [label, responder, messagePattern] of failures) {
    it(`rejects with the API's own error on ${label} — never a client-side recomputation`, async () => {
      const local = makeLocal();
      const { impl, requests } = makeFetch(responder);
      const adapter = new AzureSqlAdapter({ local, fetchImpl: impl });

      await assert.rejects(
        () => adapter.queryWidgetData(PAYLOAD),
        (err: Error) => {
          assert.match(err.message, messagePattern);
          return true;
        }
      );
      assert.equal(requests.length, 1, "the API was attempted once");
      assert.equal(
        local.calls.length,
        0,
        "strict mode: the local engine must never be consulted for a warehouse dataset"
      );
    });
  }

  it("still answers a local dataset when the API is down — that route never needed the API", async () => {
    const local = makeLocal();
    const { impl, requests } = makeFetch(() => new TypeError("Failed to fetch"));
    const adapter = new AzureSqlAdapter({
      local,
      fetchImpl: impl,
      isLocalDataset: (id) => id === LOCAL_DATASET_ID,
    });

    const result = await adapter.queryWidgetData({ ...PAYLOAD, datasetId: LOCAL_DATASET_ID });

    assert.deepEqual(result, LOCAL_RESULT);
    assert.equal(requests.length, 0);
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
    const adapter = new AzureSqlAdapter({ local: makeLocal(), fetchImpl: impl });

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
    const adapter = new AzureSqlAdapter({ local: makeLocal(), fetchImpl: impl });

    await Promise.all([
      adapter.getDatasetMetadata(SERVER_DATASET_ID),
      adapter.getDatasetMetadata(SERVER_DATASET_ID),
      adapter.getDatasets(),
    ]);

    assert.equal(requests.filter((r) => r.url.includes("/datasets")).length, 1);
  });

  it("re-fetches after invalidateMetadata", async () => {
    const { impl, requests } = makeFetch(() => ({ status: 200, body: { success: true, data: serverDatasets } }));
    const adapter = new AzureSqlAdapter({ local: makeLocal(), fetchImpl: impl });

    await adapter.getDatasets();
    adapter.invalidateMetadata();
    await adapter.getDatasets();

    assert.equal(requests.filter((r) => r.url.includes("/datasets")).length, 2);
  });

  it("returns registry columns for a warehouse dataset", async () => {
    const { impl } = makeFetch(() => ({ status: 200, body: { success: true, data: serverDatasets } }));
    const local = makeLocal();
    const adapter = new AzureSqlAdapter({ local, fetchImpl: impl });

    const columns = await adapter.getDatasetMetadata(SERVER_DATASET_ID);

    assert.deepEqual(columns.map((c) => c.id), ["vendor_name"]);
    assert.equal(local.calls.length, 0);
  });

  it("degrades metadata (not numbers) to local knowledge when the endpoint is down", async () => {
    // Metadata drives pickers, not figures — a lenient control plane is
    // deliberate, in contrast to the strict data plane above.
    const { impl } = makeFetch(() => new TypeError("Failed to fetch"));
    const local = makeLocal();
    const adapter = new AzureSqlAdapter({ local, fetchImpl: impl });

    const columns = await adapter.getDatasetMetadata(SERVER_DATASET_ID);

    assert.deepEqual(columns.map((c) => c.id), ["local_col"]);
    assert.ok(local.calls.includes(`getDatasetMetadata:${SERVER_DATASET_ID}`));
  });

  it("still lists local datasets when the endpoint is down", async () => {
    const { impl } = makeFetch(() => new TypeError("Failed to fetch"));
    const adapter = new AzureSqlAdapter({ local: makeLocal(), fetchImpl: impl });

    const datasets = await adapter.getDatasets();

    assert.deepEqual(datasets.map((d) => d.id), [LOCAL_DATASET_ID]);
  });
});
