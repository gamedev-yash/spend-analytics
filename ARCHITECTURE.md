# Data Layer Architecture

How this app gets numbers onto a chart — and why it can do so from either a CSV in
the browser or an Azure SQL warehouse without a single widget knowing which.

> **Audience:** engineers onboarding onto the data layer. Read §1 and §2 before
> touching anything under `lib/adapters/` or `lib/server/`.

---

## Table of contents

1. [Overview & data layer philosophy](#1-overview--data-layer-philosophy)
2. [Provider execution mechanics](#2-provider-execution-mechanics)
3. [Why a star schema?](#3-why-a-star-schema)
4. [Server-side query engine & safety](#4-server-side-query-engine--safety)
5. [Environment & feature toggle configuration](#5-environment--feature-toggle-configuration)
6. [File map](#6-file-map)
7. [Testing](#7-testing)
8. [Known limitations](#8-known-limitations)

---

## 1. Overview & data layer philosophy

### The seam: `IDataProvider`

Everything in this architecture hangs off one interface, in
[`types/data-provider.ts`](types/data-provider.ts):

```ts
export interface IDataProvider {
  id: string;
  getDatasets(): Promise<Dataset[]>;
  getDatasetMetadata(datasetId: string): Promise<ColumnMeta[]>;
  queryWidgetData(payload: QueryPayload): Promise<QueryResult>;
}
```

The important design decision is what `queryWidgetData` takes and returns. It does
**not** hand rows to the UI and let the UI aggregate them. It accepts a
*declarative* description of an aggregate:

```ts
interface QueryPayload {
  datasetId: string;
  dimensions?: string[];        // group by
  measures?: QueryMeasure[];    // { field, aggregation, alias }
  filters?: QueryFilter[];      // { field, operator, value }
  timeGrain?: TimeGrain;        // "month" | "quarter" | "year"
  sort?: QuerySort;             // { field, direction } — alias or dimension
  limit?: number;               // with sort, expresses Top-N
}
```

and returns only the finished aggregate:

```ts
interface QueryResult {
  rows: Record<string, unknown>[];  // one row per group, keyed by dimension id / measure alias
  totalMatchingRows?: number;       // rows matching filters *before* grouping
  executionTimeMs?: number;
}
```

Two constraints make this work as a seam:

- **Payloads are JSON-serializable.** A server-backed provider posts them over the
  wire verbatim. No functions, no class instances, no `Date` objects.
- **Result keys are stable and provider-independent.** A dimension lands on
  `row[dimensionId]`; a measure lands on `row[alias]`. Both providers must produce
  the same keys for the same payload.

### Dual-engine strategy

| | CSV Mode | Azure SQL Mode |
|---|---|---|
| Provider | `ClientCsvAdapter` | `AzureSqlAdapter` |
| Where rows live | The browser tab's heap | Azure SQL (`fact_po_items`, `fact_invoices`) |
| Where aggregation runs | Main thread, JavaScript | The database, T-SQL |
| Data origin | A CSV the user uploaded | The star schema, seeded by ETL |
| Row ceiling | Whatever fits in a tab | `MAX_ROWS = 1000` **returned**; scanned set unbounded |
| Network | None | `POST /api/v1/query` per widget |

These are not "old" and "new" — both are permanent. CSV Mode is the right engine
for *"a user just uploaded a spreadsheet, aggregate it and throw it away when the
tab closes."* Azure SQL Mode is the right engine for the enterprise warehouse. The
seam exists so the app never had to choose.

### UI decoupling

No Recharts component, and no dashboard route, contains a conditional on the data
source. The chain is:

```
Recharts widget  ──uses──▶  useWidgetQuery(dataset, config, filters)   hooks/use-widget-query.ts
                                    │
                                    ├─ buildWidgetPayload()             lib/widget-query.ts
                                    │     WidgetConfig ──▶ QueryPayload
                                    │
                                    ├─ activeProvider.queryWidgetData() ◀── the seam
                                    │
                                    └─ seriesFromResult() / kpiValueFromResult()
                                          QueryResult ──▶ SeriesPoint[] | number
```

`components/dashboard/custom-widget.tsx` renders `SeriesPoint[]`. It never learns
whether those points were summed by `Array.reduce` or by `SUM()`. The only
component that mentions a provider at all is the header badge
(`components/layout/provider-mode-badge.tsx`), whose entire job is to *display*
which one is active.

The same decoupling is why the four core dashboards can be provider-backed while
still falling back to static mock data per widget — see
[`lib/page-data/`](lib/page-data/) and §8.

---

## 2. Provider execution mechanics

### `ClientCsvAdapter` — [`lib/adapters/client-csv-adapter.ts`](lib/adapters/client-csv-adapter.ts)

Rows arrive via PapaParse (`parseCsv`) and live in `dataset.rows` as a plain array
of `Record<string, unknown>`. A query is a single pass pipeline:

```
queryWidgetData(payload)
  │
  ├─ requireDataset(datasetId)          O(D)   lookup over loaded datasets
  ├─ filterRows(rows, filters)          O(N·F) Array.filter, per-cell compare
  ├─ aggregateRows(dataset, rows, …)    O(N·M) one pass, Map<groupKey, Accumulator>
  ├─ result.sort(comparator)            O(G log G)  G = distinct groups
  └─ result.slice(0, limit)             O(limit)
```

`N` = rows, `F` = filters, `M` = measure fields, `G` = groups. The dominant term is
**O(N)** — every query re-scans every row. There is no index, so filtering on
`po_number` costs exactly as much as filtering on `currency_code`.

**Grouping.** `aggregateRows` builds a `Map` keyed by `JSON.stringify(dimensionValues)`.
Each entry holds a `GroupAccumulator`:

```ts
{ key: (string | null)[], rowCount: number, fields: Map<string, FieldAccumulator> }
//                                                       { sum, nonEmpty, distinct: Set<string> }
```

Accumulating `sum`, `nonEmpty`, and a `distinct` Set for every measure field in the
same pass is what lets one scan answer `sum`/`avg`/`count`/`distinct` together.

**Aggregation semantics** (`finalizeMeasure`) — these are the contract the SQL side
must match:

| Aggregation | Client behaviour |
|---|---|
| `sum` | `acc.sum` |
| `avg` | `acc.sum / group.rowCount` — divided by **every row in the group**, not just rows carrying a number |
| `count` on `"*"` | `group.rowCount` |
| `count` on a column | `acc.nonEmpty` (non-null, non-empty-after-trim) |
| `distinct` | `acc.distinct.size` over trimmed text |

**Comparison is trimmed text.** `cellText()` coerces to `String` and trims, so
`" Steel "` matches `"Steel"` and `5` matches `"5"`. Ordered operators
(`gt`/`gte`/`lt`/`lte`) compare numerically when both sides coerce to numbers, and
lexicographically otherwise — which is why ISO dates sort correctly.

**Empty groups sort first.** `compareDimension` treats `null` as less than any
string, matching T-SQL's default `ORDER BY … ASC` placement for `NULL`.

#### Date bucketing in JavaScript

`dimensionValue()` buckets any dimension whose `ColumnMeta.type === "date"`.
`timeGrain` defaults to `"month"`.

```ts
monthBucket("2025-03-14")            // "2025-03"   ISO fast path (regex slice)
monthBucket("14/03/2025")            // "2025-03"   falls back to new Date()
monthBucket("not a date")            // "not a date" — unparseable passes through

dateBucket(raw, "month")             // "2025-03"
dateBucket(raw, "quarter")           // "2025-Q1"   Math.ceil(month / 3)
dateBucket(raw, "year")              // "FY2024-25" Indian fiscal year
```

The fiscal-year rule: April–March, labelled by the **starting** year, so January
2025 belongs to `FY2024-25`:

```ts
const fiscalYear = monthNumber >= 4 ? year : year - 1;
return `FY${fiscalYear}-${String((fiscalYear + 1) % 100).padStart(2, "0")}`;
```

Coarser grains are derived *from* the month bucket, so anything `monthBucket`
cannot parse degrades identically at every grain.

> **These labels are a cross-provider contract.** `lib/server/query-builder.ts`
> emits T-SQL `CONCAT` expressions that produce byte-identical strings. If you
> change one, change both — otherwise a widget's x-axis labels shift when a
> warehouse query falls back to CSV mid-session.

### `AzureSqlAdapter` — [`lib/adapters/azure-sql-adapter.ts`](lib/adapters/azure-sql-adapter.ts)

This adapter contains **no aggregation logic at all**. It is an HTTP client plus
two routing rules.

```
queryWidgetData(payload)
  │
  ├─ isLocalDataset(payload.datasetId)?
  │    └─ YES ──▶ fallback.queryWidgetData(payload)      ← correct route, not a failure
  │
  └─ NO
       ├─ postQuery(payload)
       │    └─ POST /api/v1/query
       │         body: JSON.stringify(payload)
       │         signal: AbortSignal.timeout(30_000)
       │         ├─ 200 { success: true, data: QueryResult, source } ──▶ unwrap .data
       │         └─ else                                              ──▶ throw Error(envelope.error)
       │
       └─ catch (apiError)
            ├─ console.warn(reason + "Falling back to client-side aggregation")
            ├─ try fallback.queryWidgetData(payload) ──▶ return it
            └─ catch ──▶ throw apiError            ← rethrow the *original*, see below
```

#### Smart routing: `isLocalDataset()`

`DatasetsContext` wires this to the live dataset store:

```ts
isLocalDataset: (datasetId) => getSnapshot().datasets.some((d) => d.id === datasetId)
```

An uploaded CSV's rows exist **only** in that browser tab. The server has never
seen a dataset called `ds-4f2c…` and the metadata registry has no entry for it, so
posting that payload would earn a deterministic `400 Unknown datasetId` — once per
widget, every render. The check short-circuits those to the CSV engine *before* any
network call.

This distinction is load-bearing, so state it precisely:

- **`isLocalDataset` → true** is a **routing decision**. Nothing failed. Nothing is
  logged. The browser is the only place those rows exist.
- **The `catch` block** is the **fallback**. It fires only for datasets the server
  was *supposed* to be able to answer, on network failure, 4xx, 5xx, a
  non-JSON body (a proxy error page), or a 30 s client timeout.

Verified behaviour: an uploaded-CSV dashboard in Azure SQL Mode issues **zero**
`POST /api/v1/query` requests and logs nothing.

#### Graceful fallback, and why the original error is rethrown

```ts
try {
  return await this.fallback.queryWidgetData(payload);
} catch {
  throw apiError;   // not the fallback's error
}
```

For a warehouse dataset the fallback has no rows, so `ClientCsvAdapter` throws
`Dataset "fact_po_items" is no longer loaded in this browser.` That message is
true but useless — it describes a consequence, not the cause. Rethrowing
`apiError` surfaces *"the query API returned 503: mssql driver not installed"*,
which is actionable. A widget's error state should name the real problem.

#### Metadata caching

`fetchServerDatasets()` caches the **promise**, not the result:

```ts
this.datasetsPromise ??= this.request<Dataset[]>(DATASETS_PATH, { method: "GET" })
```

A dashboard mounting eight widgets at once therefore shares one `GET
/api/v1/datasets` round trip rather than racing eight. A rejection clears the cache
so the next attempt retries. `invalidateMetadata()` clears it explicitly when the
user toggles back into Azure SQL Mode.

Server-backed datasets come back with `rows: []` and `source: "server"` — they are
*queried*, never downloaded.

---

## 3. Why a star schema?

The real comparison is not "SQL vs. JavaScript." It is **what each side must hold
in memory** and **what each side must repeat on every query**.

### 3.1 Memory & bandwidth scaling

A flat CSV is fully denormalized by definition: every row carries every attribute
it might be grouped by. In `spend-overview.csv` (the PO-item grain), each of
10,000 rows repeats `vendor_name`, `parent_company_group`, `category_name`,
`category_l1`, `category_l2`, `plant_name`, and `region` — as **strings**.

With 160 vendors across 10,000 PO lines, each vendor's full text profile is
duplicated ~62× on average. The star schema stores it **once**:

```
FLAT CSV (one array, every attribute inline on every row)
┌───────────────────────────────────────────────────────────────────────┐
│ po_number │ vendor_name        │ parent_company_group │ category_l1 … │
│ 4500000001│ Tata Steel Ltd     │ TATA-GRP             │ Raw Materials │
│ 4500000002│ Tata Steel Ltd     │ TATA-GRP             │ Raw Materials │  ← repeated
│ 4500000003│ Tata Steel Ltd     │ TATA-GRP             │ Fuel & Energy │  ← repeated
└───────────────────────────────────────────────────────────────────────┘

STAR SCHEMA (facts carry 4-byte keys; text lives once per dimension row)
   dim_vendor (160 rows)            fact_po_items (10,000 rows)
   ┌────────────┬───────────────┐   ┌───────────┬────────────┬──────────────┐
   │ vendor_key │ vendor_name   │◀──│ vendor_key│ category_key│ net_order_…  │
   │ 1          │ Tata Steel Ltd│   │ 1         │ 7           │ 6074838      │
   └────────────┴───────────────┘   │ 1         │ 7           │  950618      │
                                    │ 1         │ 3           │ 3916545      │
   dim_material_category (65)   ◀───┴───────────┴─────────────┴──────────────┘
```

The consequence for scaling is not subtle. To answer *"spend by vendor"* over a
real SAP extract, the flat-array approach requires the browser to **download and
parse the entire fact table with all dimension text inlined**. At millions of PO
lines that file cannot be transferred, parsed, or held in a tab. The star schema
requires transferring only the *aggregate* — for `fact_po_items` grouped by
`category_l1_name`, that is 13 rows regardless of whether the fact table holds
10,000 rows or 100 million.

### 3.2 Data integrity & shared identity

The registry defines two facts at different grains:

- `fact_po_items` — committed spend, one row per PO line
- `fact_invoices` — actual spend, one row per invoice line

Both must answer *"spend by vendor"* and *"spend by category"* **consistently**.
The registry achieves this by pointing both facts' `allowedJoins` at the *same*
dimension tables:

```
                    ┌──────────────────────┐
   fact_po_items ───┤ dim_vendor           ├─── fact_invoices
                    │ dim_material_category│
                    │ dim_plant            │
                    │ dim_company          │
                    │ dim_date             │
                    └──────────────────────┘
                              │
                    fact_invoices also joins:
                      dim_payment_terms
                      dim_date  AS dim_invoice_date   ← second role, aliased
```

One vendor row, one category row, referenced by integer key from both facts.
`db/schema.sql` enforces this with **12 foreign keys** and a `UNIQUE` constraint on
every dimension's business key.

In a flat-array world each dataset carries its own copy of the dimension text, and
nothing structurally prevents `"Raw Materials"` in one CSV from drifting to
`"RAW MATERIALS"` or `"Raw Matls"` in another. Those become two rows in a
`GROUP BY` and the numbers silently stop reconciling. The star schema converts that
class of reporting bug into a foreign-key violation at load time.

**Role-playing dimensions** are the clearest illustration. `fact_invoices` has two
dates — the ledger posting date and the supplier's document date. Rather than
duplicating every calendar attribute twice per fact row, the registry joins the
single `dim_date` table twice under different aliases:

```ts
dim_date:         { table: "dim_date", on: ["fact_invoices.posting_date_key", "dim_date.date_key"] },
dim_invoice_date: { table: "dim_date", on: ["fact_invoices.invoice_date_key",  "dim_invoice_date.date_key"] },
```

The builder emits `AS dim_invoice_date` only when the alias differs from the table
name, so both dates are queryable in one statement without an ambiguous reference.

`dim_date` also **centralizes the fiscal calendar**. `fiscal_year`,
`fiscal_quarter`, and `fiscal_period` are columns, computed once by the ETL — so
every query agrees on where FY boundaries fall instead of each widget
re-deriving April–March arithmetic.

### 3.3 Query efficiency

`db/schema.sql` gives each fact a **clustered columnstore index**:

```sql
CREATE CLUSTERED COLUMNSTORE INDEX CCI_fact_po_items ON dbo.fact_po_items;
CREATE CLUSTERED COLUMNSTORE INDEX CCI_fact_invoices ON dbo.fact_invoices;
```

Dimensions keep ordinary rowstore `PRIMARY KEY CLUSTERED` indexes — they are small
and get seeked, not scanned.

| | `ClientCsvAdapter` | Azure SQL + CCI |
|---|---|---|
| Storage | Row-oriented JS objects | Column segments, compressed |
| `SUM(one column)` | Touches every field of every row object | Reads one column's segments |
| Filter selectivity | None — always O(N) | Rowgroup elimination via segment min/max |
| Parallelism | Single main thread | Batch-mode execution across cores |
| Cost of an unused column | Paid on every scan | Not read at all |

The facts deliberately have **no surrogate primary key**. The CCI *is* the storage
structure; adding a PK would create a nonclustered B-tree that the analytical query
pattern never uses. Re-seeding stays idempotent because `db/seed-data.sql` clears
both facts before inserting.

---

## 4. Server-side query engine & safety

```
POST /api/v1/query
  │
  ├─ parsePayload(body)                 shape validation only — types, not names
  ├─ buildAndExecuteQuery(payload)      lib/server/query-engine.ts
  │    ├─ getDataset(datasetId)         registry lookup → 400 if unknown
  │    ├─ buildQuery(payload)           lib/server/query-builder.ts → parameterized T-SQL
  │    └─ isDatabaseConfigured()
  │         ├─ NO  ──▶ sampleDataProvider.queryWidgetData()   ClientCsvAdapter over sample CSVs
  │         └─ YES ──▶ executeQuery(built)                    mssql, pooled
  │
  └─ { success: true, data: QueryResult, source: "azure-sql" | "sample-csv" }
```

`buildAndExecuteQuery` is the **single execution path**. Both `/api/v1/query` and
the AI assistant route call it, so a query the model composes is validated and
executed exactly like one a widget sends. There is deliberately no second, laxer
path.

Note that `buildQuery` runs **even when no database is configured**. Compiling the
payload is what validates it against the registry, so a bad field name fails
identically with or without Azure SQL attached.

### 4.1 Metadata registry — [`lib/server/metadata-registry.ts`](lib/server/metadata-registry.ts)

The registry is an **allowlist**, and it is the entire reason SQL injection is
structurally impossible here rather than merely defended against.

```ts
interface ColumnDefinition {
  id: string;              // what the frontend sends: "vendor_name"
  name: string;            // display label: "Vendor"
  type: "number" | "date" | "category";
  table: string;           // "dim_vendor" — the table or join alias
  sqlExpression: string;   // "dim_vendor.vendor_name" — always qualified
  requiresJoin?: string;   // key in allowedJoins that must be joined to read this
  distinctCountHint?: number;
}
```

Four properties matter:

1. **Friendly id → physical expression.** The frontend never names a table. It
   sends `vendor_name`; the registry maps that to `dim_vendor.vendor_name`.
2. **Every expression is fully qualified.** `table.column`, always — which is what
   makes multi-join queries unambiguous, and lets the same `dim_date` be joined
   twice under different aliases.
3. **`requiresJoin` is a join graph.** The builder unions the joins its dimensions,
   measures, and filters need, then emits `LEFT JOIN`s in registry declaration
   order. Only required joins appear — a query grouping by category never joins
   `dim_vendor`.
4. **Every `sqlExpression` is a literal in our own source.** No request text ever
   becomes SQL text. A field the registry does not define is a `400`, not an
   interpolated string.

Declaration order is meaningful: it drives the frontend's column-picker order and
the filter-dropdown heuristic, so headline dimensions are declared first.

`distinctCountHint` deserves a note — it feeds `ColumnMeta.distinctCount`, which
drives **UI affordances only** (which columns become filter dropdowns via
`filterableColumns`, and how `lib/suggest` ranks widget suggestions). It never
affects a query result, so drift is harmless. It is declared rather than measured
because a live `COUNT(DISTINCT)` per column on every metadata load would scan the
fact table dozens of times.

### 4.2 Parameterized query builder — [`lib/server/query-builder.ts`](lib/server/query-builder.ts)

**Operator allowlist.** A map, not a passthrough. Anything absent is a 400:

```ts
const OPERATORS: Record<QueryOperator, string> = {
  eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", in: "IN",
};
```

**Values are always bound.** `bind()` assigns `@p0`, `@p1`, … and pushes onto
`parameters`; `in` expands to one placeholder per element. The filter *value* never
appears in the SQL string:

```sql
WHERE dim_plant.plant_name = @p0
  AND fact_po_items.currency_code IN (@p1, @p2)
```

**Client-supplied identifiers are validated, not escaped.** Measure `alias` comes
from the client, so it must match `/^[A-Za-z_][A-Za-z0-9_]{0,127}$/` before being
bracket-quoted — validate-then-quote, so the brackets cannot be escaped out of.

**Defence in depth on the registry itself.** `assertQualified` and
`assertIdentifier` re-check every registry-supplied expression against a strict
pattern. These guard against a malformed *registry entry*, not against user input —
they throw plain `Error` (500), not `QueryValidationError` (400), because a bad
registry entry is our bug, not the caller's.

**`AVG` alignment — the subtle one.** SQL's `AVG()` divides by the count of
**non-NULL** values. `ClientCsvAdapter` divides by **every row in the group**. On a
sparse column those differ, so the same payload would return different numbers from
each provider. The builder therefore never emits `AVG`:

```sql
CAST(SUM(fact_po_items.unit_price) AS DECIMAL(38, 6)) / NULLIF(COUNT(*), 0)
```

A test asserts `AVG(` never appears in generated SQL.

Similarly, `count` on `"*"` becomes `COUNT(*)` (row count) while `count` on a named
column becomes `COUNT(column)` (non-NULL count) — mirroring the client's
`rowCount` vs. `nonEmpty` distinction.

**Ordering must not use display labels.** Grouping and ordering a date grain use
`dim_date`'s integer columns while the `SELECT` builds the label from them.
`ORDER BY dim_date.month_name` would sort April before January:

```sql
SELECT TOP (12)
  CONCAT(dim_date.[year], '-', RIGHT(CONCAT('0', dim_date.[month]), 2)) AS [po_date],
  SUM(fact_po_items.net_order_value_inr) AS [value]
FROM dbo.fact_po_items
LEFT JOIN dbo.dim_date ON fact_po_items.po_date_key = dim_date.date_key
GROUP BY dim_date.[year], dim_date.[month]
ORDER BY dim_date.[year] DESC, dim_date.[month] DESC
```

**T-SQL batching for `totalMatchingRows`.** The KPI row count is rows matching
filters *before* grouping, which cannot be derived from the grouped result because
`TOP (n)` returns only part of it. So `buildQuery` emits a second statement:

```sql
SELECT COUNT_BIG(*) AS [totalMatchingRows]
FROM dbo.fact_po_items
LEFT JOIN dbo.dim_material_category ON …   -- only joins the *filters* need
WHERE dim_material_category.category_l1_name = @p0
```

`sql-client.executeQuery` sends both as **one batch** — `${sql};\n${countSql};` —
so they share one round trip, one snapshot, and one parameter set, then reads
`recordsets[0]` and `recordsets[1]`. The count includes only filter-required joins,
since `LEFT JOIN`s on unique dimension keys cannot change the row count.

**Resource limits.**

| Control | Value | Where |
|---|---|---|
| Max rows returned | `MAX_ROWS = 1000` | `SELECT TOP (n)`; a larger explicit `limit` is a 400, never silently clamped |
| Statement timeout | `STATEMENT_TIMEOUT_MS = 10_000` | `requestTimeout` on the mssql pool |
| Max bound parameters | `MAX_PARAMETERS = 2000` | T-SQL's ceiling is 2100 |
| Client request timeout | `30_000` ms | `AbortSignal.timeout` in `AzureSqlAdapter` |
| Connection pool | min 0, max 8, 30 s idle | `sql-client.ts` |

**Read-only credentials.** The builder only ever emits `SELECT`, but that is a
property of our code, not a permission. The enforceable control is the login:
point `AZURE_SQL_READONLY_CONNECTION_STRING` at a `db_datareader` user.
`AZURE_SQL_CONNECTION_STRING` (the ETL's writable credential) is only a fallback,
and using it logs a warning.

### 4.3 AI assistant integration — [`app/api/assistant/route.ts`](app/api/assistant/route.ts)

The assistant does **not** do text-to-SQL. It emits a structured `QueryPayload`
through a tool call, which is then validated against the registry like any other
payload.

```
POST /api/assistant  { message, registryDatasetId: "fact_po_items" }
  │
  ├─ tools = [queryWarehouseTool(), createWidgetTool(registryDatasetId)]
  ├─ system = WAREHOUSE_SYSTEM_PROMPT   ("to state any figure, first call query_warehouse")
  │
  ├─ PASS 1: model calls query_warehouse { datasetId, dimensions, measures, … }
  │      ├─ toQueryPayload(input)              reshape only — no validation here
  │      ├─ buildAndExecuteQuery(payload)      ← the same engine /api/v1/query uses
  │      └─ tool_result: renderQueryResult()   rows, or a correctable error
  │
  └─ PASS 2: model reads the rows back and answers in prose,
             optionally also calling create_widget
```

**Containment via `strict: true`.** Every schema property that names a column
carries an `enum` drawn from the registry. With strict tool use the model *cannot*
emit a column that does not exist — this is a structural guarantee, not a prompt
instruction:

```ts
datasetId:  enum ["fact_po_items", "fact_invoices"]
dimensions: items: { type: "string", enum: allColumnIds() }        // 32 ids
measures:   items.properties.field:  enum [...allColumnIds(), "*"]
filters:    items.properties.field:  enum allColumnIds()
            items.properties.operator: enum ["eq","neq","gt","gte","lt","lte","in"]
```

`createWidgetTool(registryDatasetId)` goes further and splits the axes by column
type, so a measure column can never be offered as a grouping axis. For an uploaded
CSV the columns are only known at runtime, so those axes stay free-form and the
widget's own renderability guard catches a bad pick.

**Two layers, deliberately.** The enum is the first layer; the query engine is the
second. `allColumnIds()` is the *union* across datasets, so the model could in
principle put an invoice column on a PO query — `buildQuery` rejects that, because
it validates each field against the dataset actually requested. A test asserts
exactly this case.

**Failures are correctable, not fatal.** `runAssistantQuery` captures the error
rather than throwing, and feeds it back as a `tool_result`:

```
QUERY FAILED: Unknown field "vendor_naem" for dimension on dataset "fact_po_items".
Fix the query and try again, or tell the user what is missing. Do not invent numbers.
```

**Grounding is enforced by shape, not just by prompt.** Because the rows in the
`tool_result` are the only figures in context, and because `AssistantResponse.query`
returns the executed payload plus its rows to the client, the model's prose can be
audited against the query that produced it.

---

## 5. Environment & feature toggle configuration

### 5.1 Provider selection

| Variable | Values | Default |
|---|---|---|
| `NEXT_PUBLIC_DATA_SOURCE_PROVIDER` | `azure-sql` \| `client-csv` | `azure-sql` |

Resolution order in `context/DatasetsContext.tsx`:

1. `localStorage["app_data_provider"]` — set by the header badge, survives reload
2. `NEXT_PUBLIC_DATA_SOURCE_PROVIDER`
3. `"azure-sql"`

An unrecognized non-empty value logs a warning and falls back to `azure-sql`. The
env var is the **server-rendered default** (`getServerSnapshot`), so SSR is
deterministic; the localStorage value takes over on the client via
`useSyncExternalStore`.

`setProviderType(type)` switches live — no reload. It persists the choice and calls
`azureSqlAdapter.invalidateMetadata()` when switching back into Azure SQL Mode.
`DatasetsProvider` also accepts a `provider` prop that pins the provider and
ignores both the toggle and the env var — an escape hatch for tests and embedded
views.

### 5.2 Azure SQL connection

| Variable | Purpose |
|---|---|
| `AZURE_SQL_READONLY_CONNECTION_STRING` | **Preferred.** Should authenticate as `db_datareader` |
| `AZURE_SQL_CONNECTION_STRING` | Fallback (the ETL's writable credential); use logs a warning |
| `USD_INR_RATE`, `EUR_INR_RATE` | FX rates for the ETL and the sample fallback (default 83.5 / 90) |
| `SEED_OUT` | Override the generated `db/seed-data.sql` path |

With **neither** connection string set, `/api/v1/query` answers from the bundled
sample CSVs through a server-side `ClientCsvAdapter` (`source: "sample-csv"`) — the
same aggregation engine, so numbers agree with what a database would return.

`mssql` is an **optional** dependency, loaded at runtime via `createRequire` and
declared in `serverExternalPackages`. Without it, sample mode works fine; with a
connection string set but the driver missing you get a typed
`SqlUnavailableError` → `503` telling you to run `npm i mssql`.

### 5.3 AI credential chain

Resolved in `resolveClient()`, first non-empty wins:

```
apiKey  = AZURE_ANTHROPIC_API_KEY ?? ANTHROPIC_API_KEY ?? AZURE_FOUNDRY_API_KEY
baseURL = AZURE_ENDPOINT || AZURE_FOUNDRY_ENDPOINT || undefined   (undefined = api.anthropic.com)
model   = AZURE_FOUNDRY_MODEL || "claude-opus-5"
query   = AZURE_FOUNDRY_API_VERSION ? { "api-version": … } : undefined
```

| Variable | Role |
|---|---|
| `AZURE_ANTHROPIC_API_KEY` | Key — checked first |
| `ANTHROPIC_API_KEY` | Key — direct Anthropic |
| `AZURE_FOUNDRY_API_KEY` | Key — Azure AI Foundry |
| `AZURE_ENDPOINT` | `baseURL` for an Azure-hosted Anthropic gateway |
| `AZURE_FOUNDRY_ENDPOINT` | `baseURL` for a Foundry deployment |
| `AZURE_FOUNDRY_MODEL` | Deployment name, overriding the default model id |
| `AZURE_FOUNDRY_API_VERSION` | Sent as `?api-version=…` on every request |

Legacy variables are checked first, so adding Foundry variables alongside an
existing deployment changes nothing. With no key at all, the assistant returns
`503` with setup instructions and the rest of the app is unaffected.

> **Two caveats.** `AZURE_FOUNDRY_API_VERSION` is assumed to be a query parameter
> (the Azure OpenAI contract); if your deployment expects it as a header or in the
> path, adjust the `defaultQuery` line. And `AZURE_FOUNDRY_MODEL` applies
> regardless of which credential won — so setting it alongside
> `AZURE_ANTHROPIC_API_KEY` would send a Foundry deployment name to your Anthropic
> gateway. Keep environments clean: legacy-only or Foundry-only.

---

## 6. File map

```
types/
  data-provider.ts            IDataProvider, QueryPayload, QueryResult, TimeGrain, COUNT_ALL
  dataset.ts                  Dataset, DatasetRow, JoinInfo  (source: "upload" | "server")

lib/adapters/
  client-csv-adapter.ts       in-browser engine: PapaParse + filter/group/aggregate/sort/limit
  azure-sql-adapter.ts        HTTP client over /api/v1/query + routing and fallback

lib/
  widget-query.ts             WidgetConfig ⇄ QueryPayload / QueryResult ⇄ SeriesPoint[]
  widget-data.ts              SeriesPoint, renderability guards, value formatters

hooks/
  use-widget-query.ts         useWidgetQuery, useRowCount, useFilterOptions
  use-provider-page-data.ts   drives the core dashboards' provider loaders

context/
  DatasetsContext.tsx         dataset store, providerType, activeProvider, setProviderType
  WidgetFiltersContext.tsx    active filters for a subtree of widgets

lib/server/                   ── server-only ──
  metadata-registry.ts        the allowlist: datasets, columns, join graph
  query-builder.ts            QueryPayload → parameterized T-SQL
  query-engine.ts             buildAndExecuteQuery — the single execution path
  sql-client.ts               pooled mssql execution, read-only credential preference
  sample-data-source.ts       no-database fallback over public/sample-data/
  assistant-tools.ts          tool schemas, toQueryPayload, model-facing context
  sap-transforms.ts           FX rates, Indian fiscal calendar, group-name humanization

lib/page-data/                core dashboards: provider aggregates → page shapes
  provider-queries.ts         shared query helpers ("push grouping down, derive in JS")
  tail-spend-from-provider.ts
  spend-overview-from-provider.ts
  supplier-fragmentation-from-provider.ts

app/api/
  v1/query/route.ts           POST — the query engine
  v1/datasets/route.ts        GET  — warehouse metadata
  assistant/route.ts          POST — AI assistant with tool use

db/
  schema.sql                  star schema DDL: 6 dims, 2 facts, 12 FKs, 2 CCIs
  seed-data.sql               generated — do not edit
scripts/
  seed-azure-sql.ts           CSV → star schema ETL (npm run seed:sql)
```

---

## 7. Testing

```bash
npm test          # node --conditions=react-server --import tsx --test tests/*.test.ts
npx tsc --noEmit
npx eslint .
```

`node:test` is used deliberately — no test framework dependency. The
`--conditions=react-server` flag lets tests import modules marked `server-only`.

| Suite | Covers |
|---|---|
| `tests/query-builder.test.ts` | SQL shape, joins, grouping, Top-N, time grain, rejection of bad fields/operators/aliases/limits |
| `tests/azure-sql-adapter.test.ts` | Local routing, fallback on every failure class, error rethrow, metadata caching |
| `tests/page-data.test.ts` | Loaders issue only registry-valid payloads; totals reconcile against independent aggregation |
| `tests/assistant-tools.test.ts` | `strict: true` enum containment, `toQueryPayload`, cross-dataset rejection |

The most valuable pattern in these suites is **independent reconciliation** — a
loader's output is compared against a separate aggregation of the same source rows
rather than against itself. That is what caught the two real bugs noted below.

---

## 8. Known limitations

Documented deliberately; these are current facts, not aspirations.

**`payment-terms` cannot be served from the warehouse.** Its headline metrics are
average paid days and standard-terms adherence, which need a settlement date per
invoice. `fact_invoices` carries the document and posting dates but **no paid
date**. The page stays on its invoice-list source and displays a note naming what
the schema needs: `paid_date_key` and `paid_days` on `fact_invoices`, plus
global-ultimate and source-system attributes on the vendor dimension. The other
three core dashboards read the warehouse in Azure SQL Mode.

**No query has ever executed against a real Azure SQL instance.** All verification
to date ran through the `sample-csv` backend — the same aggregation engine, but not
the same SQL. The DDL and generated statements are validated by parsing and review,
not by execution. Treat first contact with a live database as untested ground.

**The supplier-grain intermediate approximates by design.** `tail-spend`'s shared
derivation carries one *primary* category per supplier, so category totals derived
from it credit a supplier's whole spend to its largest category. The provider
loader works around this by querying categories directly and splicing exact figures
in. If you add a category-shaped widget, take the same route — a regression test
guards the current numbers. (This bug briefly showed Raw Materials at ₹12,344 Cr
against a true ₹5,817 Cr.)

**Watch what a measure is actually counting.** A related bug had the KPI ribbon's
"Invoices" figure reading distinct *PO numbers* from `fact_po_items`. It now queries
`fact_invoices`. When a page mixes both facts, name the source explicitly.

**Per-page query volume is high.** `/tail-spend` issues ~29 logical queries per
load (doubled in dev by React StrictMode's effect double-invocation, which does not
happen in production builds). Each is a bounded aggregate, but a batch endpoint
accepting multiple payloads would collapse them if it matters at your volumes.

**Two DDL widths deviate from the original spec**, both forced by real data:
`term_code` is `VARCHAR(10)` (codes reach 9 chars, and truncating to 4 collides
`NET15`/`NET150`) and `parent_group_key` is `VARCHAR(20)` (source keys reach 15).

**Two SAP cleaning rules match nothing in the sample extract.** The deletion filter
(`LOEKZ`/`is_deleted`) excludes 0 rows, and credit-memo sign-flipping
(`SHKZG='H'`/`BLART='KG'`) flips 0 rows, because those columns do not exist in the
generated data. Both rules are implemented and the ETL prints their hit counts, so
a zero is never mistaken for "handled."
