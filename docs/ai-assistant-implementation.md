# AI Assistant Implementation — Current State & Query Path

Written as a reference for improving querying performance. It documents what
exists today (as of this audit), not a proposal — the "Performance-relevant
observations" section at the end is the only forward-looking part, and it
only points at concrete, already-verified opportunities rather than
prescribing a fix.

This complements [`ARCHITECTURE.md`](../ARCHITECTURE.md) §4, which covers the
same ground from the data-layer side. This doc is scoped to the AI surfaces
specifically and includes the `/api/generate-dashboard` pipeline, which
`ARCHITECTURE.md` doesn't cover, plus the tool-loop and caching mechanics that
changed after that doc was written.

---

## 1. The three AI surfaces

| Surface | Route | Frontend | Grounded in |
|---|---|---|---|
| Warehouse / uploaded-CSV chat | `app/api/assistant/route.ts` | `components/ai-assistant/AiAssistant.tsx` | Either the Azure SQL warehouse (`fact_po_items`, `fact_invoices`) or a user-uploaded CSV's column statistics |
| Per-core-dashboard chat | `app/api/dashboard-chat/route.ts` | `components/ai-assistant/DashboardAssistant.tsx` | One core dashboard's own in-memory row tables (Spend Overview, Compliance, Payment Terms, Tail Spend, Supplier Fragmentation, Single Source Risk) |
| Dashboard generation planning | `app/api/generate-dashboard/route.ts` | `components/generated-dashboard/generate-dashboard-dialog.tsx` | A client-computed `DatasetProfile` (column stats only — never live queries, never raw rows) |

All three resolve their Anthropic client/model through the **one** shared
function in `lib/ai/anthropic-client.ts` — there is no other place a model
string is chosen anywhere in the app.

```ts
// lib/ai/anthropic-client.ts
resolveAnthropicClient(): { client: Anthropic; model: string } | null
```

Precedence: `AZURE_ANTHROPIC_API_KEY ?? ANTHROPIC_API_KEY ?? AZURE_FOUNDRY_API_KEY`
for the key; `AZURE_FOUNDRY_MODEL || ANTHROPIC_MODEL` for the model — **no
hardcoded fallback model**. If neither model env var is set, resolution
returns `null` (same as a missing key) rather than silently picking something.
This repo's current `.env` routes through Azure AI Foundry with
`AZURE_FOUNDRY_MODEL=claude-sonnet-4-6-2`.

---

## 2. Request flow per route

### 2.1 `/api/assistant` — warehouse mode (the SQL-querying hot path)

```
POST /api/assistant  { message, registryDatasetId: "fact_po_items", mode: "chat" }
  │
  ├─ tools = [queryWarehouseTool(), createWidgetTool(datasetId), REDIRECT_TOOL, ASK_OPTIONS_TOOL]
  ├─ system = WAREHOUSE_SYSTEM_PROMPT (cache_control: ephemeral)
  │
  ├─ up to MAX_TOOL_PASSES (4) rounds:
  │    model may call query_warehouse { datasetId, dimensions, measures, filters, timeGrain, limit, sortBy, sortDirection }
  │      → toQueryPayload(input)                reshape only, no validation
  │      → buildAndExecuteQuery(payload)         lib/server/query-engine.ts — the SAME engine /api/v1/query uses
  │      → tool_result: renderQueryResult()      up to 50 rows shown to the model, rest reported as "omitted"
  │    the LAST allowed pass forces tool_choice: {type: "none"} — the model
  │    must answer in prose from what it already has, so a query issued on
  │    an earlier pass is never left unanswered
  │
  └─ { reply, widget, query, redirect, options }
```

`mode: "parse"` is the same route with `tool_choice` forced to
`create_widget` on pass 0 (unless warehouse mode, where the model may query
first) — used by "describe a chart in words" flows instead of chat.

**CSV mode** (`registryDatasetId` absent) is the same route but with no SQL
involved at all: the model reasons entirely over `DatasetContext` — column
names, types, distinct counts, and pre-computed min/max/sum/avg/sample-values
(`buildColumnStats` in `lib/ai/widget-parser.ts`) computed **client-side** from
the uploaded CSV and sent as text. No query tool exists in this mode; a
`create_widget` call still goes through the same client-side
`validateWidgetAgainstColumns` re-check before anything touches a dashboard.

### 2.2 `/api/dashboard-chat` — per-dashboard chat (in-memory, not SQL)

Structurally identical tool-loop shape to §2.1, but the tool is
`query_dashboard_data` and it never touches Azure SQL — see §3.2.

```
POST /api/dashboard-chat  { dashboardKey, message }
  │
  ├─ tools = [queryDashboardDataTool(dashboardKey), REDIRECT_TOOL, ASK_OPTIONS_TOOL]
  ├─ system = buildSystemPrompt(dashboardKey)   (cache_control: ephemeral, per dashboardKey)
  │
  ├─ up to MAX_TOOL_PASSES (4) rounds, same forced-final-pass shape as §2.1
  │    model calls query_dashboard_data { table, filters, groupBy, measure, aggregation, sort, limit, select }
  │      → runDashboardQuery()   lib/ai/dashboard-query.ts → runs lib/ai/query-engine.ts over in-memory row arrays
  │
  └─ { reply, redirect, options }
```

### 2.3 `/api/generate-dashboard` — planning pipeline (no query loop)

Two sequential structured-output calls, no tool use, no live queries at all —
the model only ever sees a pre-computed profile:

```
POST /api/generate-dashboard  { profile: DatasetProfile }
  │
  ├─ CALL 1  system = dashboard-planning.md skill (cache_control: ephemeral)
  │          input  = renderDatasetProfile(profile)
  │          output_config.format = PLAN_SCHEMA  →  parsed_output: DashboardPlan
  │
  └─ CALL 2  system = widget-planning.md skill (cache_control: ephemeral)
             input  = profile + CALL 1's plan (JSON)
             output_config.format = WIDGET_SCHEMA → parsed_output: { widgets: WidgetSpec[] }
```

Both calls use `client.messages.parse()` with `jsonSchemaOutputFormat()` — no
JSON-extraction/regex step, the SDK validates and parses for you. Both
already had `cache_control` on their system prompt before this audit.

---

## 3. The two query engines — read this before touching "querying performance"

There are **two unrelated modules named `query-engine.ts`** doing very
different jobs. Confusing them is the easiest way to optimize the wrong
thing.

### 3.1 `lib/server/query-engine.ts` — the SQL path

Used by `/api/v1/query` and by `/api/assistant` in warehouse mode. One
function, `buildAndExecuteQuery(payload)`:

1. `getDataset()` — registry lookup (in-memory, static, effectively free).
2. `buildQuery(payload)` — `lib/server/query-builder.ts` compiles the payload
   to parameterized T-SQL. **Runs even with no database configured** — this
   is what validates a field/operator/dataset name against the registry, so a
   bad request fails identically with or without Azure SQL attached.
3. Execution:
   - No connection string → `sampleDataProvider.queryWidgetData()` (bundled
     sample CSVs via `ClientCsvAdapter`).
   - Connection string present → `executeQuery(built)` in
     `lib/server/sql-client.ts` — real Azure SQL via the `mssql` driver.

**Security model:** allowlist, not escaping. Every identifier (table names,
column expressions, join clauses) comes from `lib/server/metadata-registry.ts`
— literals in our own source — never from the request. Every client-supplied
*value* is bound as a T-SQL parameter (`@p0`, `@p1`, …). A field the registry
doesn't define is a 400, never interpolated.

**What actually executes against SQL, per `query_warehouse` tool call:**

```sql
SELECT TOP (n) <dimensions>, <measures> FROM ... LEFT JOIN ... WHERE ... GROUP BY ... ORDER BY ...;
SELECT COUNT_BIG(*) AS totalMatchingRows FROM ... LEFT JOIN (filter-required only) ... WHERE ...;
```

Both statements go as **one batch** (`sql-client.ts`, one round trip, one
snapshot) — this is already done well; it's not a place to add a second round
trip.

Connection handling: one pooled connection **per process**
(`poolPromise` is module-scope, shared across concurrent requests so they
don't race to open their own pool). Pool config: `min: 0, max: 8,
idleTimeoutMillis: 30_000`. Per-statement timeout `STATEMENT_TIMEOUT_MS =
10_000` ms.

### 3.2 `lib/ai/query-engine.ts` — the in-memory path

Used only by the four core-dashboard assistants via `lib/ai/dashboard-query.ts`
/ `lib/ai/dashboard-tables.ts`. Not SQL at all — `runQuery(rows, spec)` is a
synchronous, dashboard-agnostic filter → groupBy → aggregate → sort → limit
implementation over plain JS row arrays (linear scans, `Map` for grouping).
Every result is hard-capped at **50** groups or rows regardless of what's
requested (`HARD_CAP = 50` in this file — separate from, and lower than, the
SQL path's `MAX_ROWS = 1000`).

`dashboard-tables.ts` builds those row arrays today from
`lib/sap/raw-data.ts` (JSON) and each dashboard's existing mock objects — the
same data the dashboards themselves render from, not a live database. This
means the in-memory path's ceiling is **process memory + linear scan cost
over whatever's loaded**, not SQL execution time. It scales fine at current
(mock/demo) data volumes; it is the thing to re-architect first if/when real
SAP row counts get wired into `dashboard-tables.ts`, since `runQuery` has no
indexing or pagination — it re-scans the full array on every call.

### 3.3 Containment is two layers on both paths

1. **Tool schema (`strict: true` + `enum`)** — the model literally cannot
   emit a column/table name that doesn't exist for the dataset/dashboard it
   was given. `queryWarehouseTool()` and `createWidgetTool()` live in
   `lib/server/assistant-tools.ts`; `queryDashboardDataTool()` in
   `lib/ai/dashboard-query.ts`.
2. **Engine-level validation** — catches what the enum alone can't (e.g. an
   invoice column named on a PO-dataset query, since the enum is a *union*
   across datasets/tables). Failures come back as a correctable
   `QUERY FAILED: ...` tool_result, never a silent empty result or a thrown
   500 — the model is told exactly what to fix and can retry within the same
   pass budget.

---

## 4. Tool-calling loop mechanics (current, post-fix)

Both `assistant/route.ts` and `dashboard-chat/route.ts` share this shape:

- `MAX_TOOL_PASSES = 4` — up from a hard 2. Each pass is **one Claude round
  trip**, plus (if the model called a query tool) one or more query
  executions before the next pass.
- The **last** allowed pass sets `tool_choice: { type: "none" }`, forcing a
  prose-only reply from whatever tool results already exist — this closes off
  the failure mode where a tool call issued on the final pass never gets read
  back (previously produced an empty reply).
- `stop_reason` is checked for both `"refusal"` (422) and `"max_tokens"`
  (502, added in this audit) before the loop trusts the response content.

**Within a single pass, multiple tool calls execute sequentially, not
concurrently** (`app/api/assistant/route.ts`):

```ts
for (const call of queryCalls) {
  const executed = await runAssistantQuery(call.input as Record<string, unknown>);
  query = executed;                    // last call's result wins — see §5
  results.push({ type: "tool_result", tool_use_id: call.id, ... });
}
```

If the model emits two `query_warehouse` calls in one response (a natural
shape for "compare X to Y"), each SQL round trip runs one after the other
instead of via `Promise.all`. `dashboard-chat`'s equivalent loop calls
`runDashboardQuery`, which is synchronous (in-memory), so this specific cost
doesn't apply there — only to the SQL-backed warehouse path.

---

## 5. Current performance-relevant configuration

| Constant | Value | File | Effect |
|---|---|---|---|
| `MAX_TOKENS` (assistant) | 8,000 | `app/api/assistant/route.ts` | Non-streaming; shared by thinking (on by default) + tool JSON + reply |
| `MAX_TOKENS` (dashboard-chat) | 4,096 | `app/api/dashboard-chat/route.ts` | Raised from 1,536 in this audit — was too tight given thinking-on-by-default |
| `MAX_TOKENS` (generate-dashboard) | 8,000 | `app/api/generate-dashboard/route.ts` | Two calls, each capped independently |
| `MAX_TOOL_PASSES` | 4 | both chat routes | Round-trip ceiling; last pass forces a prose-only reply |
| `MAX_ROWS` (SQL) | 1,000 | `lib/server/query-builder.ts` | `SELECT TOP (n)` ceiling; a larger explicit `limit` is a 400, never silently clamped |
| `RESULT_ROW_LIMIT` (model-visible) | 50 | `lib/server/assistant-tools.ts` | Rows actually shown to Claude in the tool_result, regardless of how many SQL returned |
| `HARD_CAP` (in-memory) | 50 | `lib/ai/query-engine.ts` | Groups/rows returned by the dashboard-chat engine |
| `MAX_PARAMETERS` | 2,000 | `lib/server/query-builder.ts` | T-SQL's own ceiling is 2,100 |
| `STATEMENT_TIMEOUT_MS` | 10,000 | `lib/server/sql-client.ts` | `requestTimeout` on the mssql pool |
| Connection pool | `min: 0, max: 8, idleTimeoutMillis: 30_000` | `lib/server/sql-client.ts` | One pool per process, shared across concurrent requests |
| Prompt caching | `cache_control: ephemeral` on all four system prompts (assistant, dashboard-chat, both generate-dashboard calls) | — | Added/verified in this audit; tool definitions render before `system` in the API's prefix order, so they ride along in the same cache read/write as long as the registry doesn't change between requests |

---

## 6. File map

```
app/api/assistant/route.ts            Warehouse + CSV chat route — the tool loop in §2.1/§4
app/api/dashboard-chat/route.ts       Per-core-dashboard chat route — §2.2
app/api/generate-dashboard/route.ts   Two-call planning pipeline — §2.3
app/api/v1/query/route.ts            Direct query endpoint widgets use — same engine as §3.1

lib/ai/anthropic-client.ts            Single client/model resolver — §1
lib/ai/dashboard-registry.ts          DashboardKey routing metadata only, no data
lib/ai/dashboard-tables.ts            In-memory row tables per core dashboard (today: mock/CSV-derived)
lib/ai/query-engine.ts                In-memory filter/groupBy/aggregate engine — §3.2
lib/ai/dashboard-query.ts             query_dashboard_data tool + validation, wires the above two together
lib/ai/dashboard-context.ts           Renders a dashboard's schema (never rows) into the system prompt
lib/ai/widget-parser.ts               Client-side: CSV column stats, permutation engine, widget re-validation
lib/ai/profile/build-profile.ts       Client-computed DatasetProfile for generate-dashboard
lib/ai/schemas/plan-schema.ts         DashboardPlan JSON schema
lib/ai/schemas/widget-schema.ts       WidgetSpec JSON schema
lib/ai/skills/dashboard-planning.md   System prompt for generate-dashboard CALL 1
lib/ai/skills/widget-planning.md      System prompt for generate-dashboard CALL 2

lib/server/metadata-registry.ts       The allowlist — table/column/join definitions, literals in source
lib/server/query-builder.ts           QueryPayload → parameterized T-SQL — §3.1
lib/server/query-engine.ts            buildAndExecuteQuery() orchestration — §3.1
lib/server/sql-client.ts              mssql pool + execution — §3.1
lib/server/sample-data-source.ts      Fallback CSV-backed provider when no Azure SQL connection string
lib/server/assistant-tools.ts         query_warehouse / create_widget tool schemas + result rendering

components/ai-assistant/AiAssistant.tsx          Warehouse/CSV chat UI (per custom dashboard)
components/ai-assistant/DashboardAssistant.tsx    Per-core-dashboard chat UI
```

---

## 7. Performance-relevant observations

Concrete, verified against the current code — not fixed yet, listed for you
to prioritize.

1. **Sequential tool execution within one pass, SQL path only.** §4 above —
   parallel `query_warehouse` calls in a single model turn run one after
   another (`for (const call of queryCalls) { await ... }` in
   `app/api/assistant/route.ts`). Switching to `Promise.all` would let
   multi-query turns (e.g. "compare this quarter to last") finish in one SQL
   round trip's worth of latency instead of N. Note: the loop also does
   `query = executed` on every iteration, so today only the *last* parallel
   call's result survives into `AssistantResponse.query` — worth fixing
   alongside the parallelization, not after.

2. **`AssistantResponse.query` is computed, serialized, and never read.**
   Verified: neither `AiAssistant.tsx` nor `DashboardAssistant.tsx`
   destructures `result.query` anywhere. Every `query_warehouse` call today
   fetches up to `MAX_ROWS` (1,000) rows from SQL, shows 50 to the model
   (`RESULT_ROW_LIMIT`), and then serializes the **full, untruncated** row
   set into the HTTP response body sent to the browser for a field nothing
   consumes. If this is confirmed dead on the frontend, either drop `query`
   from the response payload or truncate it to what the model saw — this is
   pure wasted DB read + network transfer with no code-path benefit today.

3. **In-memory dashboard engine has no indexing or pagination
   (`lib/ai/query-engine.ts`).** Fine at current mock-data volumes; the first
   thing to revisit if `dashboard-tables.ts` is ever pointed at real SAP row
   counts, since `runQuery` re-scans the full array per call with no cache
   between turns.

4. **No query-result caching across turns.** Neither engine caches a result
   for reuse within a session — a follow-up question that re-derives the
   same aggregate re-runs the full query. Whether this is worth adding
   depends on how often users ask near-duplicate questions in one session;
   not verified either way, flagging as a candidate rather than a finding.

5. **Serverless cold-start pool behavior.** `lib/server/sql-client.ts`'s pool
   is module-scope (`min: 0`), so a fresh serverless instance opens a new
   connection on its first query. If the hosting platform reuses warm
   instances across invocations (check the actual Azure Static Web Apps
   Functions runtime behavior), `min: 1` would keep one warm connection ready
   instead of paying connect latency on every cold start; if instances are
   never reused, this wouldn't help and isn't worth doing.

6. **Prompt caching is now in place everywhere it can be** (this audit added
   it to both chat routes' system prompts). Tool definitions
   (`queryWarehouseTool()`, `createWidgetTool()`, `queryDashboardDataTool()`)
   are regenerated per request from the static registry but are
   byte-identical across requests for the same dataset/dashboard, so they
   ride along in the same cached prefix as the system block — already
   getting the caching benefit without any further change, as long as the
   registry doesn't change shape between requests.

7. **SQL-side query shape is already reasonably tight**: parameterized,
   allowlisted, single-batch grouped-SELECT + COUNT (one round trip, not
   two), `TOP (n)` capped server-side. The registry declares
   `distinctCountHint` rather than measuring it live specifically to avoid a
   `COUNT(DISTINCT)` scan per column on every metadata load — that decision
   already trades UI-affordance accuracy for query cost. Actual index
   coverage on join keys (`fact_po_items.po_date_key`,
   `dim_vendor` lookups, etc.) lives in the external Azure SQL schema, not
   this repo — worth checking execution plans there if SQL latency itself
   (not the app-level costs above) turns out to be the bottleneck.
