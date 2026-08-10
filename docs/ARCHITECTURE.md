# Platform Architecture

How Vedanta Spend Analytics gets numbers onto a chart, and how its AI
assistant answers a question — from the canonical 10-table dataset through to
the 5 dashboard routes and the per-dashboard chatbot.

> **Audience:** engineers onboarding onto this codebase. Read §1 and §2 before
> touching anything under `lib/adapters/`, `lib/server/`, or `lib/sap/`.
>
> **Related docs:** [`DATA_DICTIONARY_MAPPING.md`](DATA_DICTIONARY_MAPPING.md)
> covers what the 10 tables *contain*; this doc covers how they get *loaded
> and queried*. See [§7](#7-related-documentation--known-doc-drift) for two
> other docs in this repo that are currently out of date with the codebase —
> read that section before trusting anything they say about `/api/assistant`
> or a 2-table registry.

---

## Table of contents

1. [System overview & the dual data-provider architecture](#1-system-overview--the-dual-data-provider-architecture)
2. [Single source of truth: from CSV to dashboard](#2-single-source-of-truth-from-csv-to-dashboard)
3. [Per-dashboard wiring](#3-per-dashboard-wiring)
4. [AI assistant architecture](#4-ai-assistant-architecture)
5. [Developer maintenance guide](#5-developer-maintenance-guide)
6. [File map](#6-file-map)
7. [Related documentation & known doc drift](#7-related-documentation--known-doc-drift)

---

## 1. System overview & the dual data-provider architecture

Every widget on every dashboard reads through one interface,
[`types/data-provider.ts`](../types/data-provider.ts):

```ts
export interface IDataProvider {
  id: string;
  getDatasets(): Promise<Dataset[]>;
  getDatasetMetadata(datasetId: string): Promise<ColumnMeta[]>;
  queryWidgetData(payload: QueryPayload): Promise<QueryResult>;
}
```

`queryWidgetData` takes a **declarative aggregate description** (dimensions,
measures, filters, time grain, sort, limit) and returns only the finished
result — never raw rows for the UI to reduce itself. Two implementations
exist, and the header toggle `[ CSV | Azure ]` switches between them live, no
reload:

```mermaid
flowchart TB
    subgraph Browser
        Widget["Dashboard widget"] -->|QueryPayload| Provider{"activeProvider\n(context/DatasetsContext.tsx)"}
        Toggle["[ CSV | Azure ] toggle\nProviderModeBadge"] -.sets.-> Provider
    end

    Provider -->|"providerType = client-csv"| CSVAdapter["ClientCsvAdapter\nlib/adapters/client-csv-adapter.ts"]
    Provider -->|"providerType = azure-sql"| AzureAdapter["AzureSqlAdapter\nlib/adapters/azure-sql-adapter.ts"]

    CSVAdapter -->|"in-browser filter/group/aggregate"| BrowserStore["This browser's uploaded\ndatasets (localStorage)\n— empty until user uploads a CSV"]

    AzureAdapter -->|"POST /api/v1/query"| QueryAPI["lib/server/query-engine.ts\nbuildAndExecuteQuery()"]
    QueryAPI --> Registry["metadata-registry.ts\nallowlist + join graph"]
    QueryAPI --> HasDB{"Azure SQL connection\nstring configured?"}
    HasDB -->|No| SampleCSV["sample-data-source.ts\nreads public/sample-data/*.csv"]
    HasDB -->|Yes| RealDB["Real Azure SQL\nvia mssql driver"]

    style CSVAdapter fill:#f59e0b,color:#000
    style AzureAdapter fill:#0284c7,color:#fff
```

### The toggle's real meaning — read this before wiring a new widget

**The `[ CSV | Azure ]` toggle is not "canonical demo data vs. real
warehouse."** It is:

- **CSV mode** — `ClientCsvAdapter` aggregates whatever datasets **this
  browser has uploaded** (`context/DatasetsContext.tsx`'s `storedDatasets`,
  persisted to `localStorage`). Empty by default. This is the "bring your own
  spreadsheet" playground feature — it has nothing to do with the canonical
  10-table dataset unless a user manually uploads one of those CSVs.
- **Azure SQL mode** — `AzureSqlAdapter` posts to `/api/v1/query`, which
  queries a real Azure SQL database if `AZURE_SQL_READONLY_CONNECTION_STRING`
  (or the writable fallback) is set, and otherwise answers from the bundled
  canonical CSVs server-side (`sample-data-source.ts`) through the identical
  aggregation engine. **This is why Azure SQL mode is the default** —
  `NEXT_PUBLIC_DATA_SOURCE_PROVIDER` defaults to `azure-sql`, so a fresh
  session shows real canonical numbers without any configuration.

A dashboard that needs the canonical baseline data — not a user's uploaded
file — must **not** simply gate its fetch on `providerType === "azure-sql"`
and call it done. Two patterns are in use, both bypassing the toggle
entirely for baseline data:

1. **A dedicated `/api/master`-style route** that always calls
   `getSampleDataset()` server-side, regardless of `providerType` — used by
   Payment Terms (`app/payment-terms/api/master/route.ts`), Single Source
   Risk (`app/single-source-risk/api/master/route.ts`), and Supplier
   Fragmentation (`app/supplier-fragmentation/api/master/route.ts`). Needed
   whenever a page's model works off thousands of individual rows rather than
   a grouped aggregate — `queryWidgetData()`'s 1,000-row cap and
   `IDataProvider.getDatasets()` (which always reports `rows: []` for a
   server-backed dataset) have no way to return that many rows.
2. **Pinning directly to the exported `azureSqlAdapter` singleton** from
   `context/DatasetsContext.tsx`, bypassing `activeProvider` — used by Tail
   Spend (`lib/page-data/tail-spend-from-provider.ts`), whose loader issues
   grouped `queryWidgetData()` calls rather than a raw-row fetch.

Spend Overview and Compliance need neither pattern: their SSR path
(`lib/sap/raw-data.ts` → `lib/sap/aggregate.ts`/`compliance.ts`) reads the
canonical CSVs directly at the module level with zero dependency on
`providerType` at all — see §2.

### Provider comparison

| | CSV Mode | Azure SQL Mode |
|---|---|---|
| Provider | `ClientCsvAdapter` | `AzureSqlAdapter` |
| Where rows live | This browser tab's heap | Azure SQL, or the sample CSVs server-side |
| Where aggregation runs | Main thread, JavaScript | The database (T-SQL), or `ClientCsvAdapter` server-side over the samples |
| Data origin | A CSV the user uploaded | The star schema (if configured), else `public/sample-data/*.csv` |
| Row ceiling | Whatever fits in a tab | `MAX_ROWS = 1000` **returned**; scanned set unbounded |
| Network | None | `POST /api/v1/query` per widget |
| Default | No | **Yes** (`NEXT_PUBLIC_DATA_SOURCE_PROVIDER` defaults to `azure-sql`) |

---

## 2. Single source of truth: from CSV to dashboard

All 10 canonical CSVs live at `public/sample-data/*.csv`. Two server-only
modules read them, and **every** dashboard-facing data path ultimately goes
through one or the other:

```mermaid
flowchart LR
    CSVs["public/sample-data/*.csv\n(10 canonical files)"]

    CSVs --> SampleSource["lib/server/sample-data-source.ts\ngetSampleDataset(id)\nregistry-column-keyed rows"]
    CSVs --> RawData["lib/sap/raw-data.ts\nnatural-key SAP view\n(vendors, poItems, invoices, ...)"]

    SampleSource --> Registry["lib/server/metadata-registry.ts\nallowlist + join graph"]
    SampleSource --> MasterRoutes["/payment-terms/api/master\n/single-source-risk/api/master\n/supplier-fragmentation/api/master"]
    SampleSource --> QueryAPI["/api/v1/query\n(widget queries, all providers)"]
    SampleSource --> DashboardChat["lib/ai/dashboard-tables.ts\n(AI assistant)"]

    RawData --> Aggregate["lib/sap/aggregate.ts\nlib/sap/compliance.ts"]
    Aggregate --> SpendOverview["/spend-overview\n/compliance\n(SSR, always-on, no toggle dependency)"]

    MasterRoutes --> PaymentTerms["/payment-terms"]
    MasterRoutes --> SingleSourceRisk["/single-source-risk"]
    MasterRoutes --> SupplierFrag["/supplier-fragmentation"]
    QueryAPI --> TailSpend["/tail-spend"]
    QueryAPI --> SpendOverviewProvider["/spend-overview\n(Azure-mode override, same numbers)"]

    style CSVs fill:#059669,color:#fff
```

**`lib/server/sample-data-source.ts`** — `getSampleDataset(datasetId)`
denormalizes a canonical CSV into rows keyed by the *registry's* column ids
(joining in vendor/category/plant/payment-term attributes, humanizing
`parent_company_group` via `humanizeGroupName()`, deriving
`is_contract_backed` from `doc_type`, etc.). This is what
`ClientCsvAdapter`/`AzureSqlAdapter`'s no-database fallback, every
`/api/master` route, and the AI assistant's `dashboard-tables.ts` all read.
One `readCsv()` + Papa.parse per file, cached after first read per process.

**`lib/sap/raw-data.ts`** — a *different* view over the *same* CSVs, keyed by
their own natural SAP-style fields (`vendor_id`, `po_number`, `category_code`,
...) rather than registry ids. This is what Spend Overview and Compliance's
pure computation modules (`lib/sap/aggregate.ts`, `lib/sap/compliance.ts`)
were originally built against, before the canonical CSVs existed — rewiring
this **one file** to read the canonical CSVs instead of the old bespoke mock
JSON was enough to make both pages canonical, with zero changes to the
aggregation logic itself. This is the clearest example of the "swap the
source, keep the shape" pattern this codebase uses repeatedly: preserve a
module's exact exported shape while changing what feeds it, so every
downstream consumer needs zero changes.

Both modules are `"server-only"` — neither can be imported into client
components. Every dashboard's actual data therefore either flows through a
server-rendered page (Spend Overview/Compliance), a server API route (the
`/api/master` pattern), or the shared `/api/v1/query` endpoint. No dashboard
reads a canonical CSV directly from the browser.

---

## 3. Per-dashboard wiring

| Dashboard | Canonical tables used | Load path |
|---|---|---|
| **Spend Overview** (`/spend-overview`) | `fact_po_items`, `fact_invoices`, `dim_vendor`, `dim_category`, `dim_plant` (join) | SSR via `lib/sap/raw-data.ts` → `lib/sap/aggregate.ts` (always); optionally overridden client-side by `app/spend-overview/loadFromProvider.ts` in Azure mode — same canonical numbers either way |
| **Compliance** (`/compliance`) | `fact_po_items`, `fact_invoices` (via `raw-data.ts`) | SSR via `lib/sap/raw-data.ts` → `lib/sap/compliance.ts` — no toggle dependency at all |
| **Payment Terms** (`/payment-terms`) | `fact_payments`, `dim_payment_terms`, `dim_vendor`, `dim_category`, `dim_plant` (join) | `app/payment-terms/api/master/route.ts` → `lib/page-data/payment-terms-from-provider.ts`, fetched unconditionally regardless of toggle |
| **Tail Spend** (`/tail-spend`) | `fact_po_items`, `fact_invoices`, `agg_vendor_annual` | `lib/page-data/tail-spend-from-provider.ts`, pinned to `azureSqlAdapter` regardless of toggle, issuing grouped `queryWidgetData()` calls |
| **Supplier Fragmentation** (`/supplier-fragmentation`) | `fact_po_items`, `dim_contract`, `dim_vendor`, `dim_category`, `dim_plant` (join) | `app/supplier-fragmentation/api/master/route.ts` → `app/supplier-fragmentation/lib/use-master-data.ts`, fetched unconditionally — the reference implementation this pattern was generalized from |
| **Single Source Risk** (`/single-source-risk`) | `fact_po_items`, `dim_vendor`, `dim_category`, `dim_plant` (join) | `app/single-source-risk/api/master/route.ts` → `lib/page-data/single-source-risk-from-provider.ts`, fetched unconditionally |

**All 5 dashboards show identical numbers regardless of the `[ CSV | Azure ]`
toggle position.** This is a verified, tested invariant, not an aspiration —
each dashboard's baseline load either has no toggle dependency at all
(Spend Overview/Compliance), or explicitly bypasses `activeProvider` for its
canonical data fetch (the other four). The toggle only changes behavior for
a dashboard's **ad hoc widget-level queries against a user-uploaded CSV**,
which is an orthogonal, opt-in feature layered on top.

---

## 4. AI assistant architecture

**One AI assistant surface exists today: `/api/dashboard-chat`.** An earlier
`/api/assistant` route (a general warehouse/uploaded-CSV chat with its own
`query_warehouse` tool) has been removed from the codebase entirely — see
[§7](#7-related-documentation--known-doc-drift) if you find a doc that still
describes it.

```mermaid
sequenceDiagram
    participant U as User
    participant FE as DashboardAssistant.tsx
    participant R as /api/dashboard-chat
    participant M as Claude
    participant Q as runDashboardQuery
    participant T as Dashboard tables (in-memory)

    U->>FE: asks a question
    FE->>R: POST { dashboardKey, message, history }
    R->>M: system prompt (schema + Semantic Metric Dictionary,\ncache_control: ephemeral) + tools
    M->>R: tool_use: query_dashboard_data (possibly several, one pass)
    par Promise.all — parallel, order-preserving
        R->>Q: runDashboardQuery(key, call 1)
        Q->>T: filter/groupBy/aggregate over in-memory rows
    and
        R->>Q: runDashboardQuery(key, call 2)
        Q->>T: filter/groupBy/aggregate over in-memory rows
    end
    Q-->>R: results, capped at 50 rows/groups (HARD_CAP)
    R->>M: tool_result for each call, keyed by tool_use_id
    M->>R: prose reply (grounded in the numbers just returned)
    R->>FE: { reply, redirect, options }
    FE->>U: shows the answer
```

### 4.1 Scoped per-dashboard, not "all 10 tables at once"

The tool is `query_dashboard_data` (not a general warehouse-query tool), and
it is **scoped to exactly one dashboard's own tables** —
[`lib/ai/dashboard-tables.ts`](../lib/ai/dashboard-tables.ts):

```ts
const DASHBOARD_TABLES: Record<DashboardKey, DashboardTable[]> = {
  "spend-overview": [PO_ITEMS, INVOICES],
  compliance: [PO_ITEMS, INVOICES],
  "payment-terms": [PAYMENTS],
  "tail-spend": [PO_ITEMS, AGG_VENDOR_ANNUAL],
  "supplier-fragmentation": [PO_ITEMS, CONTRACTS],
  "single-source-risk": [PO_ITEMS],
};
```

Every table here is built from `getSampleDataset()` — the same registry-keyed
rows every dashboard itself renders from, never a separate copy. If the
model asks about data that belongs to a *different* dashboard, it calls
`redirect_to_dashboard` instead of guessing (a structural tool call the UI
renders as a real link, not free text it has to parse for a dashboard name).
Ambiguous questions ("which metric, which time range") get `ask_with_options`
— clickable choices instead of an open-ended follow-up.

**Containment is two layers**, same pattern as the widget-query path:

1. **Tool schema** (`strict: true` + `enum`) — the model cannot emit a
   table/field name that doesn't exist for the dashboard it was given.
2. **Engine-level validation** (`runDashboardQuery` in
   `lib/ai/dashboard-query.ts`) — catches what the enum alone can't, since
   the enum is a *union* across a dashboard's tables: a field real on one
   table but not the one actually requested in the call is rejected as a
   correctable `QUERY FAILED: ...` tool_result, never a silent empty result.

### 4.2 Query engine — separate from the widget-query engine

`lib/ai/query-engine.ts`'s `runQuery(rows, spec)` is a **synchronous,
in-memory** filter → groupBy → aggregate → sort → limit implementation over
plain JS row arrays. It is **not** the same module as
`lib/server/query-engine.ts` (which compiles to T-SQL for `/api/v1/query`) —
two files with a similar name doing different jobs is the easiest way to
optimize the wrong one, so this distinction is worth internalizing early.

Every result from the AI's engine is hard-capped:

```ts
// lib/ai/query-engine.ts
const HARD_CAP = 50;
const limit = Math.min(Math.max(1, spec.limit ?? 20), HARD_CAP);
```

This caps how many rows/groups the model ever sees in a `tool_result`,
independent of how many rows actually matched — the tool schema's own
`limit` field description states this explicitly ("Top-N cap, at most 50").

### 4.3 Performance optimizations

**Parallel tool-call execution.** When the model issues more than one
`query_dashboard_data` call in a single pass (a natural shape for "compare
this quarter to last"), `app/api/dashboard-chat/route.ts` runs them
concurrently and maps results back by `tool_use_id`:

```ts
const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
  queryCalls.map(async (call) => {
    const outcome = runDashboardQuery(dashboardKey, call.input);
    return {
      type: "tool_result" as const,
      tool_use_id: call.id,
      is_error: outcome.error !== undefined,
      content: renderDashboardQueryResult(outcome),
    };
  })
);
```

`Promise.all` preserves input order in its resolved array regardless of
completion timing, which matters here since each result must land on the
`tool_use_id` of the call that produced it — a plain `for` loop awaiting one
call at a time would work correctly too, just serially; the model-facing
contract (each call gets its own correctly-matched result) is identical
either way.

**Multi-pass tool loop with a forced final answer.** Up to `MAX_TOOL_PASSES =
4` round trips; the *last* allowed pass sets `tool_choice: { type: "none" }`,
forcing a prose-only reply from whatever tool results already exist. This
closes off the failure mode where a query issued on the final pass would
otherwise never get read back into an answer.

**Prompt caching.** The system prompt (schema + Semantic Metric Dictionary)
carries `cache_control: { type: "ephemeral" }` and is rebuilt per
`dashboardKey` — byte-identical across requests for the same dashboard, so
repeat questions on the same dashboard reuse the cached prefix.

### 4.4 Semantic Metric Dictionary

Embedded directly in the system prompt
(`app/api/dashboard-chat/route.ts`'s `SEMANTIC_METRIC_DICTIONARY` constant) so
the model looks up a named business metric's exact computation instead of
inventing its own interpretation:

| Metric | Definition |
|---|---|
| **Off-contract / off-PO spend** | `fact_po_items` rows where `is_contract_backed = 0`, or `fact_invoices` rows where `po_number` is blank ("maverick" spend) |
| **Maverick spend %** | `count(fact_invoices where po_number is blank) ÷ count(fact_invoices) × 100` |
| **DPO (Days Payable Outstanding)** | `fact_payments.actual_dpo` — already computed as `clearing_date − baseline_date`. Never recomputed from other date fields |
| **Discount capture rate** | `fact_payments.discount_captured_inr ÷ discount_available_inr × 100` — only meaningful where `discount_available_inr > 0` |
| **Tail spend** | `agg_vendor_annual` rows where `is_tail = true` (equivalently `cumulative_spend_pct > 80` for that vendor's year) |
| **Pareto / 80-20 concentration** | `agg_vendor_annual.spend_rank` and `cumulative_spend_pct` are precomputed per vendor per year — read directly rather than re-ranking from `fact_po_items` |
| **Single-source / concentration risk** | `COUNT(DISTINCT vendor_id)` in `fact_po_items` grouped by category — at or below the user's stated threshold is "at risk" |
| **Contract coverage** | `dim_contract` rows where `is_active = true`, grouped by vendor/category/plant — `contract_value_inr` is committed value, not actual spend against it |
| **Supplier fragmentation** | `COUNT(DISTINCT vendor_id)` in `fact_po_items` per category — a high count relative to spend suggests consolidation potential |

The prompt also tells the model: amounts ending in `_inr` are Indian rupees,
report in Cr (10,000,000) or L (100,000) matching the dashboards' own
display convention; "top N" means sort descending and cap at N; and — for
context only, not as tables actually in reach on the current dashboard — the
full warehouse has seven top-level tables total.

---

## 5. Developer maintenance guide

### 5.1 Adding a new table

Registering a new canonical table is a **three-file change**:

1. **`lib/server/metadata-registry.ts`** — add a `DatasetDefinition` with its
   `id`, `primaryTable`, `defaultDateKey`, `allowedJoins` (which dimensions it
   can join, and the natural- or surrogate-key column pair to join on), and
   `columns` (one `column(id, name, type, table, sqlExpression, requiresJoin?,
   distinctCountHint?)` call per field). This is the **allowlist** — a field
   not declared here is a `400`, never reachable by any query regardless of
   provider.
2. **`lib/server/sample-data-source.ts`** — add a `build<Table>Rows(dims)`
   function that reads the new CSV via `readCsv()`, joins in whatever
   dimension attributes it needs from `loadDimensions()`, and returns rows
   keyed by the **registry's** column ids (not the CSV's raw headers — see
   `DATA_MAPPING.md` §8 for why these often differ). Register it in the
   `BUILDERS` map.
3. **If the table should be queryable by the AI assistant on a specific
   dashboard** — add a `DashboardTable` entry to `lib/ai/dashboard-tables.ts`
   (reusing the same `getSampleDataset()` rows) and reference it from that
   dashboard's array in `DASHBOARD_TABLES`. `dashboard-context.ts`,
   `dashboard-query.ts`, and the route's tool loop are all keyed off
   `DashboardKey` generically and need no further changes.

Skipping step 3 for a dashboard that should have it is not a no-op: a
dashboard's assistant only ever sees its own table list, so a table that
exists in the registry but not in `dashboard-tables.ts` is invisible to the
model on every dashboard's chat, even one that visibly renders it.

### 5.2 Quality checks

```bash
npx tsc --noEmit    # type-check the whole project
npm test            # node --conditions=react-server --import tsx --test tests/*.test.ts
npx eslint .        # lint
npm run build       # production build — also re-runs the type check
```

`node:test` is used deliberately, no test framework dependency. The
`--conditions=react-server` flag lets tests import modules marked
`server-only`. The most valuable pattern across the test suites is
**independent reconciliation** — a loader's output is compared against a
*separately computed* aggregate of the same source rows rather than against
itself, which is what has caught real bugs in this codebase before (a
supplier's total spend attributed entirely to its primary category; a KPI
counting PO documents instead of invoices under an "Invoices" label).

| Suite | Covers |
|---|---|
| `tests/query-builder.test.ts` | SQL shape, joins, grouping, Top-N, time grain, rejection of bad fields/operators/aliases/limits |
| `tests/azure-sql-adapter.test.ts` | Local-dataset routing, fallback on every failure class, error rethrow, metadata caching |
| `tests/page-data.test.ts` | Provider loaders issue only registry-valid payloads; totals reconcile against an independent aggregation |
| `tests/dashboard-query.test.ts` | `query_dashboard_data`'s per-dashboard enum scoping, cross-table field rejection, independent reconciliation against each dashboard's own warehouse totals |

---

## 6. File map

```
types/
  data-provider.ts              IDataProvider, QueryPayload, QueryResult, TimeGrain
  dataset.ts                    Dataset, DatasetRow  (source: "upload" | "server")

lib/adapters/
  client-csv-adapter.ts         in-browser engine: PapaParse + filter/group/aggregate/sort/limit
  azure-sql-adapter.ts          HTTP client over /api/v1/query + local-dataset routing + fallback

context/
  DatasetsContext.tsx           dataset store, providerType, activeProvider, exported azureSqlAdapter

lib/server/                     ── server-only ──
  metadata-registry.ts          the allowlist: 7 top-level datasets, columns, join graph
  query-builder.ts              QueryPayload → parameterized T-SQL
  query-engine.ts                buildAndExecuteQuery — the single SQL execution path
  sql-client.ts                 pooled mssql execution
  sample-data-source.ts         getSampleDataset() — canonical CSVs, registry-keyed rows
  sap-transforms.ts             FX rates, Indian fiscal calendar, humanizeGroupName()

lib/sap/                        ── the Spend Overview / Compliance SSOT ──
  raw-data.ts                   natural-key SAP view over the canonical CSVs (server-only)
  types.ts                      Vendor/Category/Plant/Material/PoItem/Invoice interfaces
  aggregate.ts                  pure computation: KPIs, treemap, top suppliers, trend, BU split
  compliance.ts                 off-PO / off-contract spend derivations

lib/page-data/                  provider aggregates → page shapes, per dashboard
  provider-queries.ts           shared query helpers ("push grouping down, derive in JS")
  payment-terms-from-provider.ts
  single-source-risk-from-provider.ts
  tail-spend-from-provider.ts

app/{payment-terms,single-source-risk,supplier-fragmentation}/api/master/route.ts
                                 dedicated raw-row endpoints, unconditional on providerType
app/spend-overview/loadFromProvider.ts
                                 Azure-mode override for Spend Overview's own widgets

lib/ai/                         ── the dashboard-chat assistant ──
  dashboard-registry.ts         routing/labels only — DashboardKey, route, description, no data
  dashboard-tables.ts           per-dashboard table lists, built from getSampleDataset()
  query-engine.ts               in-memory runQuery()/describeSchema() — §4.2
  dashboard-query.ts            query_dashboard_data tool + validation + result rendering
  dashboard-context.ts          renders a dashboard's schema (never rows) into the system prompt
  anthropic-client.ts           shared credential resolution

app/api/
  v1/query/route.ts             POST — the widget query engine (all providers)
  v1/datasets/route.ts          GET  — warehouse metadata
  dashboard-chat/route.ts       POST — the AI assistant, §4

db/
  schema.sql                    Azure SQL star schema DDL — currently covers only
                                 fact_po_items/fact_invoices + their 6 original dimensions;
                                 fact_payments/agg_vendor_annual/dim_contract/dim_material have
                                 no db/schema.sql analog yet (CSV/registry-only)
scripts/
  seed-azure-sql.ts             CSV → star schema ETL (npm run seed:sql) — NOT executed as part
                                 of ordinary development; only run intentionally against a real DB
```

---

## 7. Related documentation & known doc drift

Two other documents in this repo describe an **earlier state of this
codebase** and should not be trusted for the specifics below without
cross-checking the actual source:

- **`/ARCHITECTURE.md`** (repo root, not this file) — a substantial,
  well-written doc that predates the 10-table unification and the AI
  assistant consolidation. It still describes `app/api/assistant/route.ts`,
  `lib/server/assistant-tools.ts`, and a `query_warehouse` tool in detail
  (§4.3 there) — **none of these exist in the codebase anymore.** Its
  registry examples reference a 2-fact/6-dimension schema and
  `spend-overview.csv` (also deleted). Its §8 "Known limitations" claims
  Payment Terms cannot be served from the warehouse for lack of a paid date
  — `fact_payments.clearing_date`/`actual_dpo` closed that gap and Payment
  Terms now reads it via the pattern in §3 above. Its §1–§3 (the
  `IDataProvider` seam, `ClientCsvAdapter`/`AzureSqlAdapter` mechanics, the
  star-schema rationale) remain accurate in shape and are worth reading for
  depth this document doesn't repeat.
- **`docs/ai-assistant-implementation.md`** — similarly describes
  `/api/assistant` as a live route with its own tool loop, `WAREHOUSE_
  SYSTEM_PROMPT`, and `RESULT_ROW_LIMIT` constant in `lib/server/
  assistant-tools.ts`. That whole surface is gone; only the "per-dashboard
  chat" sections' *concepts* (not file paths) still line up with §4 above.

This document and [`DATA_DICTIONARY_MAPPING.md`](DATA_DICTIONARY_MAPPING.md)
were written against, and verified directly against, the current `dev`
branch as of this writing. If you find a discrepancy between this doc and
the code, trust the code and update this doc — that is the whole point of
having it.
