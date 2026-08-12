# AI Assistant — Latest Implementation Reference

This document captures the **current, actual state** of the dashboard AI Assistant
(`/api/dashboard-chat`) after the full audit/optimization/follow-up-context work
described here — every claim below is grounded in the real code, not intent.
It supersedes the AI section of `docs/ARCHITECTURE.md` for anything more recent
than that file's own last update; treat this as the up-to-date reference until
that doc is refreshed to match.

---

## 1. What the assistant is

A floating chat widget (`components/ai-assistant/DashboardAssistant.tsx`), mounted
once at the root layout, that answers questions about **whichever dashboard the
user is currently on** — Spend Overview, Compliance, Payment Terms, Tail Spend,
Supplier Fragmentation, or Single Source Risk. It is grounded in real, live data
(never a canned summary), redirects to the right dashboard when a question
belongs elsewhere, and asks clarifying questions instead of guessing when a
request is genuinely ambiguous.

---

## 2. The unified dataset (confirmed correct, not rewritten)

All six dashboards read from **one shared, unified dataset** — there is no
per-dashboard physical copy anywhere in this codebase:

```
lib/server/sample-data-source.ts
   getSampleDataset(id) — parses public/sample-data/*.csv ONCE per process,
   cached in a module-level Map. 7 tables: fact_po_items, fact_invoices,
   fact_payments, agg_vendor_annual, dim_contract, dim_material,
   dim_payment_terms.
         │
         ▼
lib/ai/dashboard-tables.ts
   DASHBOARD_TABLES: Record<DashboardKey, DashboardTable[]>
   — each dashboard gets a filtered LIST OF REFERENCES to the same table
   objects above. Spend Overview and Compliance, for example, both point at
   the literal same fact_po_items/fact_invoices row arrays — proven by a
   deepEqual test in tests/dashboard-query.test.ts.
```

A dashboard only ever **constrains what can be queried** (which tables/fields
are in scope) — it never duplicates or re-derives the underlying rows. A
`datasetVersion` fingerprint (`getDatasetVersion()`) is stamped once per
process load and used as the invalidation key for every cache in this system
(see §6).

`dim_material` and `dim_payment_terms` are deliberately not wired to any
dashboard today — documented as an intentional decision in
`lib/ai/dashboard-tables.ts`, not a silent gap.

---

## 3. Request lifecycle

```
User message
  → DashboardAssistant.tsx: send()
      body: { dashboardKey, message, history, activeFilters, conversationId }
  → POST /api/dashboard-chat
      1. Validate dashboardKey + message
      2. sanitizeConversationId() — generate one if missing/malformed
      3. getConversationContext(conversationId) — this chat's stored memory
      4. buildSystemPrompt(dashboardKey, activeFilters, memoryBlock)
      5. Tool-calling loop with Claude (≤4 passes):
           query_dashboard_data | redirect_to_dashboard | ask_with_options
      6. applyQueryToContext() + saveConversationContext()
      7. Response: reply, redirect, options, conversationId,
                   suggestedFollowUps, contextSummary
  → Frontend renders the reply, updates the context indicator + follow-up chips
```

Only one `fetch` call exists in the frontend, guarded by a `busy` flag — no
duplicate-request paths (audited).

---

## 4. The three tools

| Tool | Purpose | Key property |
|---|---|---|
| `query_dashboard_data` | Run a real aggregate/row-level query against this dashboard's tables | `strict: true` JSON schema — table/field enums are generated per dashboard, so the model literally cannot name a field this dashboard doesn't expose |
| `redirect_to_dashboard` | Hand off to the dashboard that actually covers the question | Structural, not prose — the UI renders a real link, never parses free text for a dashboard name |
| `ask_with_options` | Clarify a genuinely ambiguous request | 2–5 clickable choices instead of an open-ended follow-up |

**Containment is two layers**, both still intact:
1. Tool schema enum (model can't even *ask* for a disallowed table/field)
2. `runDashboardQuery()`'s own validation (catches a field that's real on a
   *sibling* table on the same dashboard but not the one actually requested)

---

## 5. System prompt (`buildSystemPrompt()`)

Built once per request (not once per tool-calling pass — this used to be
rebuilt on every pass, up to 4× per request, before being hoisted out of the
loop). Composed of, **only when each piece is non-empty**:

1. Dashboard label + explicit **business-scope framing**:
   > *"This is a business-scope boundary, not a separate database — every
   > dashboard in this app reads the same underlying warehouse."*
2. The dashboard's own rich description (see §9)
3. **Active-filters block** — only if the user has something filtered on screen
4. **Conversation-memory block** — only if there's stored memory (see §7)
5. Real table/column schema for this dashboard (memoized, see §6)
6. Semantic metric dictionary (DPO, maverick spend %, tail spend, etc. — exact
   computation recipes so the model looks a term up instead of inventing one)
7. Other dashboards' names/descriptions (for redirect decisions only — never
   their data)
8. Grounding rules, including an explicit instruction never to expose
   internal table/column names to the user (see §10)

---

## 6. Caching — three independent layers, each solving a different problem

### 6a. Static dashboard metadata (schema + tool definitions)
`lib/ai/dashboard-context.ts` and `lib/ai/dashboard-query.ts` each hold a
`Map<DashboardKey, ...>` memoizing `buildDashboardContext()` and
`queryDashboardDataTool()` — built once per dashboard per process, never
rebuilt per request. `isDashboardContextCached()` exposes this for the debug
log.

### 6b. The unified dataset itself
Already loaded once, in-memory, per process (§2) — untouched by this work,
confirmed correct.

### 6c. Query-result cache (new — `lib/ai/query-cache.ts`)
Caches the actual computed result of a `query_dashboard_data` call.

- **Key:** `datasetVersion :: normalizedSpec` — table, sorted filters (and
  sorted `in`-array values), groupBy, measure, aggregation, sort, limit,
  sorted select fields. Order of anything never affects the key.
- **Deliberately NOT keyed by dashboardKey.** Multiple dashboards share the
  identical physical table rows (Spend Overview and Compliance both read the
  same `fact_po_items` array). Access-scope validation happens *before* the
  cache is ever consulted, so an identical query from two different
  dashboards is a genuinely identical computation — keying by table+spec
  instead of dashboardKey lets one dashboard's query warm the cache for
  another's (proven by a live test).
- **Never caches:** an error outcome, or the natural-language reply.
- **Bounds:** 1,000-entry cap, 10-minute TTL, oldest-evicted — a memory
  bound only; correctness comes entirely from `datasetVersion` in the key.
- **Measured effect:** ~4ms average cache-miss → ~0.03ms average cache-hit
  on the query engine itself (micro-benchmark, 200 runs). In a live repeat
  request, a 2-tool-call query dropped from 18.23ms → 0.65ms of query
  execution time. **This is real and measured, but it is not what makes the
  assistant feel slow or fast** — see §12.

---

## 7. Conversation context / follow-up memory (`lib/ai/conversation-context.ts`)

Solves: *"Only for Pune"* correctly reusing *"top 5 suppliers by spend"*
without the user repeating anything, including across a dashboard redirect.

### What's stored, per `conversationId`
```
ConversationContext {
  conversationId, updatedAt,
  entities: { suppliers: [...≤3], categories: [...≤3], plants: [...≤3] }   // global, cross-dashboard
  perDashboard: {
    [dashboardKey]: {
      lastQuery: { table, filters, groupBy, measure, aggregation, sort, limit, select }
      lastResult: { topEntities: [...≤5], rowCount }
    }
  }
}
```

- **Not a redesigned memory shape** — `lastQuery` is literally the same
  `QuerySpec` the tool loop already validates and executes. No separate
  NLU/entity-extraction model; entities are pulled deterministically from a
  query's own `eq`/`in` filters after it runs.
- **Dashboard-scoped `lastQuery`/`lastResult`** — never carried across a
  redirect, so a query shape from one dashboard's tables can't contaminate
  another's validation.
- **Global `entities`** — deliberately *does* survive a redirect, so "its
  payment delays?" after "show supplier ABC's spend" still knows which
  supplier once you land on Payment Terms.
- **Store:** in-memory `Map`, 30-minute TTL, 500-conversation cap — no new
  database. This repo has no chat/session persistence layer at all; adding
  one for this would be the over-engineering this whole project has
  deliberately avoided.
- **Raw history stays bounded too** — server caps at the last 10 messages
  regardless of how much the client sends (the client's own request payload
  does still grow unboundedly with conversation length — a known, minor,
  documented inefficiency, not fixed in this pass).
- **Proven bounded in practice:** a live 12-turn conversation grew its
  request payload 128 → 7,014 bytes, while server-side prompt-construction
  time stayed flat at 0.03–0.15ms the entire time.

### Why this exists *alongside* raw history, not instead of it
Claude already resolves plain-language references ("them," "that category")
correctly from raw prior turns. What raw text can't give it is a **crisp,
deterministic anchor** — exactly which table/filters/groupBy produced the
last answer, and exactly which named entity was in play, rather than
whatever a prose reply happened to phrase it as.

### Grounding is never weakened by memory
The system prompt explicitly forbids reusing a number from earlier in the
conversation as if it were fresh — memory only tells the model *what* to ask
about again, never lets it skip re-querying. Verified live: "what about its
spend?" always fires a fresh `query_dashboard_data` call.

### Deterministic follow-up suggestions (no extra Claude call)
`suggestFollowUps()` derives 0–3 chips from the stored `lastQuery`/entities:
- `limit` set → toggle ("Show top 10" ⇄ "Show top 3")
- No `groupBy`, not a row-level lookup (a plain scalar answer like "total
  spend") → **"Break down by category"** (this specific case — the most
  common question type — used to fall through to nothing before a later fix)
- A remembered entity not already in the query's own filters → "Only for X"
- Not a row-level lookup, no date filter already applied → "Compare with
  last year"

Falls back to the original static 4-chip list (`Compare` / `Break down` /
`Show trend` / `Explain`) only when there's genuinely nothing to derive yet
(a fresh conversation, a clarifying question, a redirect with no query run).

### UI surface
- `conversationId`: one per browser tab session (`sessionStorage`,
  `lib/ai/conversation-id.ts`), **not reset on dashboard navigation** (needed
  for cross-dashboard entity continuation) — only rotated by "New chat."
- "Answering for: …" strip — live dashboard filters (unrelated to memory,
  always current).
- "Remembering: …" strip — the conversation-memory summary
  (`buildContextSummaryForUI()`), e.g. `"By Supplier · Top 5 · Tata Steel Ltd"`.
  **Never shows a raw internal field id** (`vendor_name` → "Supplier") — see §10.

---

## 8. Dashboard-specific context beyond filters — linked-analysis / chart clicks

Payment Terms and Single Source Risk both track a widget-click selection
(clicking a bar in a chart — `state.selection`, a `{dimension, value, label}`
tuple) separate from the filter-drawer filters. This selection **never
reached the assistant at all** until this pass. Now:

```
provider.tsx: state.selection
   → buildPaymentTermsFilterSummary({ ..., selection })
   → "... · Chart selection: Net 30"
   → surfaced in the same activeFilters channel the assistant already reads
```

Supplier Fragmentation's equivalent (`crossFilterLabel`) was already wired
from earlier work.

---

## 9. Dashboard registry (`lib/ai/dashboard-registry.ts`)

Every one of the six dashboards has a routing-grade description (not a
one-line label) covering: what it's for, real KPIs/dimensions it actually
exposes, terminology/synonyms, and — critically — **explicit exclusions**
naming which sibling dashboard covers an adjacent-sounding question. This is
what makes `redirect_to_dashboard` accurate rather than a coin flip between
six dashboards that all mention "spend."

---

## 10. No internal implementation details ever reach the user

Three separate leak points were found (via live testing, not inspection
alone) and fixed:

| Surface | Before | Fix |
|---|---|---|
| Redirect reason / any reply text | *"tracked in **fact_payments**, using **actual_dpo**"* | System-prompt rule: table/column names are for tool calls only, never for anything the user reads — translate to business language |
| "Remembering: …" UI strip | `By vendor_name · Top 5` | `humanizeFieldName()` — explicit label map + Title-Case fallback, never raw snake_case |
| API error responses | Raw Anthropic SDK / JS error text forwarded to the client | Generic client-facing message; real error still logged server-side (`console.error`, tagged with `requestId`) for debugging |

Re-verified live against the exact conversations that originally leaked —
confirmed clean, plus a regex-based leak scanner across 4 live test
conversations (zero matches for `fact_`, `dim_`, `agg_`, raw column names, or
the tool names themselves).

---

## 11. Observability

Every request logs one structured line (`console.debug`, dev-mode only,
never in production, never business data) with:

```
requestId, dashboardKey, model, contextCacheHit, hasActiveFilters,
hasConversationMemory, datasetVersion, promptConstructionMs, llmRounds,
toolCalls, queryCacheHits, claudeLatencyMs, queryExecutionMs, rowsProcessed,
rowsReturned, totalLatencyMs, outcome
```

This is what made every latency claim in this document (and the diagnostic
below) a measurement instead of a guess.

---

## 12. Known bottleneck — diagnosed, not fixable in this codebase

Every measurement this session agrees: `promptConstructionMs` and
`queryExecutionMs` are sub-millisecond to a few milliseconds; `claudeLatencyMs`
alone is 3.5–28 **seconds** and accounts for ~99% of total latency.

A direct, isolated test against the Azure Foundry endpoint (no app code, no
system prompt) found:
- Plain text call, no tools: **2.7s**
- Identical call with a forced trivial tool call (1-field schema): **8.6s**

**Tool-use itself costs ~6 extra seconds on this specific deployment**,
independent of prompt size or app complexity — and a grounded answer always
needs at least one tool call, usually two round trips. This is
infrastructure/deployment-level, not something any code change in this repo
can fix. Not yet confirmed whether this is specific to Azure Foundry's
gateway or to this particular model deployment — that requires a comparison
test against a direct Anthropic key, not yet run.

---

## 13. Explicitly NOT done (by instruction or deliberate scope decision)

- **RAG / `search_knowledge`** — explicitly excluded per instruction; no
  code, no boundary stub, nothing touched.
- **Streaming** — evaluated as a real way to improve *perceived* latency
  given §12, but not implemented; a genuine architectural change deferred as
  future work.
- **Redis / any new database** — not needed; every cache here is a
  bounded in-memory `Map`, appropriate for this app's single-process scale.
- **Client-side history truncation** — the request payload still grows
  unboundedly client-side even though the server ignores anything past 10
  messages; cheap fix, not done in this pass.

---

## 14. File map

| File | Role |
|---|---|
| `app/api/dashboard-chat/route.ts` | Request orchestration, tool loop, timing |
| `lib/ai/dashboard-registry.ts` | Six dashboards' routing-grade descriptions |
| `lib/ai/dashboard-tables.ts` | Unified-dataset → per-dashboard table scoping |
| `lib/ai/dashboard-context.ts` | Memoized schema description for the prompt |
| `lib/ai/dashboard-query.ts` | Tool schema, query validation + execution + cache wiring |
| `lib/ai/query-engine.ts` | Dashboard-agnostic filter/groupBy/aggregate engine |
| `lib/ai/query-cache.ts` | Deterministic, dataset-version-keyed result cache |
| `lib/ai/conversation-context.ts` | Structured follow-up memory, entity tracking, suggestions |
| `lib/ai/conversation-id.ts` | Session-scoped `conversationId` (client) |
| `lib/server/sample-data-source.ts` | The unified dataset + `datasetVersion` |
| `context/DashboardActiveFiltersContext.tsx` | Bridges page filter state to the root-mounted assistant |
| `lib/dashboard-filters/format-filter-summary.ts` + per-dashboard `filterSummary.ts` | Human-readable filter/selection summaries |
| `components/ai-assistant/*` | Chat UI (widget, header, composer, message bubbles, suggestions) |
| `tests/*.test.ts` | 163 tests covering all of the above |
