# AI Assistant Question Bank — with Verified Answer Key

Every numeric answer below was computed **independently of Claude**, by
calling `runDashboardQuery()` directly — the exact same engine the AI's
`query_dashboard_data` tool calls — against the real sample dataset. These
are ground truth, not estimates. Use them to check whether your AI's actual
answer is *correct*, not just plausible-sounding.

Non-numeric categories (redirects, ambiguity, follow-ups) list the **expected
behavior** instead, since the exact wording will vary by design.

---

## A. Grounded numeric lookups (verified answer key)

| # | Ask on | Question | Verified answer |
|---|---|---|---|
| A1 | Spend Overview | "What's our total committed spend across all POs?" | **₹24,361.25 Cr** across 50,000 PO lines |
| A2 | Spend Overview | "What's our total invoiced spend?" | **₹19,104.47 Cr** across 45,000 invoice lines |
| A3 | Spend Overview | "How much have we spent with Vedanta Aluminium (Jharsuguda) plant?" | **₹2,153.01 Cr** across 6,082 PO lines |
| A4 | Spend Overview | "What's our total PO spend with Tata Steel Ltd?" | **₹85.04 Cr** across 433 PO lines |
| A5 | Compliance | "How much of our spend is off-contract?" | **₹16,268.59 Cr** (of ₹24,361.25 Cr total = **~66.8%**) across 35,773 PO lines |
| A6 | Compliance | "What's our maverick (off-PO) spend rate on invoices?" | **7,000 of 45,000 invoices (15.56%)** have no PO number |
| A7 | Payment Terms | "What's our average DPO?" | **40.8 days** across 45,000 payment records |
| A8 | Payment Terms | "How much discount have we captured vs. missed?" | Captured: **₹33.5 Cr** · Missed: **₹37.97 Cr** |
| A9 | Payment Terms | "How many of our payments are currently late or overdue?" | **18,995 "Late"** + **317 "Open (Overdue)"** = 19,312 of 45,000 |
| A10 | Tail Spend | "How much is tail spend, and across how many vendors?" | **₹4,919.63 Cr** across **349 distinct vendors** (852 vendor-year rows flagged `is_tail`) |
| A11 | Supplier Fragmentation | "Which category has the most suppliers, and how many?" | **MRO & Spares — 98 distinct suppliers** (next: Packaging at 88) |
| A12 | Supplier Fragmentation | "How many active framework contracts do we have?" | **98 active contracts** |
| A13 | Single Source Risk | "Which categories have the fewest suppliers?" | **Capital Equipment and Instrumentation — 24 suppliers each** (fewest of all categories) |

**Cross-check worth trying (A3):** Capital Equipment is simultaneously our **highest-spend category** (₹8,398 Cr, from B2 below) *and* one of the **two categories with the fewest suppliers** (24, from A13) — a real, genuine single-source-risk signal in this data. Ask: *"Is Capital Equipment a spend concentration risk as well as a supplier concentration risk?"* on Single Source Risk and see if the AI connects those two facts correctly.

---

## B. Top-N / grouped breakdowns (verified answer key)

| # | Ask on | Question | Verified answer |
|---|---|---|---|
| B1 | Spend Overview | "Show me the top 5 suppliers by spend." | Prime Marketing ₹1,384.01 Cr · Global Industrial ₹981.48 Cr · Prime Chemicals Pvt Ltd ₹905.48 Cr · Weir Minerals Netherlands ₹738.18 Cr · Balaji Automation Pvt Ltd ₹646.57 Cr |
| B2 | Spend Overview | "Show me the top 5 categories by spend." | Capital Equipment ₹8,398.02 Cr · Raw Materials ₹4,183.62 Cr · Fuel & Energy ₹3,381.43 Cr · Services ₹2,814.07 Cr · Civil & Construction ₹1,691.44 Cr |
| B3 | Tail Spend | "Who are our top 5 vendors by annual spend?" | Same ranking/values as B1 (from `agg_vendor_annual`, which is pre-aggregated from the same PO data — good cross-check that the two tables agree) |

**Try asking B1 two different ways** ("Show me the top 5 suppliers by spend" vs. "Who do we spend the most with — give me the top 5") — both should resolve to the identical query and, per this session's caching work, the second phrasing should be dramatically faster in the debug log (`queryCacheHits` > 0, `queryExecutionMs` near-zero) even though the wording is completely different.

---

## C. Filter follow-ups (context correctness, not just numbers)

| # | Turn 1 | Turn 2 | What to check |
|---|---|---|---|
| C1 | "Show me the top 5 suppliers by spend." | "Only for Vedanta Aluminium (Jharsuguda)." | Same top-5-by-spend framing, now filtered to that plant — should NOT ask you to repeat "suppliers" or "spend" |
| C2 | "Show me the top 10 suppliers." | "Show only 3." | Same ranking, just truncated to 3 — should still be Prime Marketing / Global Industrial / Prime Chemicals Pvt Ltd |
| C3 | "Show me the top 5 suppliers by spend." | "What about the second one's total spend?" | Should resolve to **Global Industrial** specifically (the literal #2 from B1), not ask which supplier you mean |

---

## D. Cross-dashboard redirect (expected target, not exact wording)

| # | Ask on | Question | Expected behavior |
|---|---|---|---|
| D1 | Spend Overview | "How many invoices are overdue and what's our average DPO?" | Redirect → **Payment Terms** |
| D2 | Payment Terms | "What's our off-contract spend?" | Redirect → **Compliance** |
| D3 | Tail Spend | "How many suppliers do we have in the IT category?" | Redirect → **Supplier Fragmentation** |
| D4 | Spend Overview | "Which categories are at risk of single-sourcing?" | Redirect → **Single Source Risk** |
| D5 | Compliance | "Who are our top suppliers by spend?" | Should **NOT** redirect — Compliance shares `fact_po_items`/`fact_invoices` with Spend Overview, but "top suppliers by spend" with no compliance angle genuinely belongs to Spend Overview per its own description. Watch for an unnecessary redirect here — that would be a routing mistake worth flagging. |

## E. Entity carry-over across a redirect (the hardest one to get right)

1. On **Spend Overview**: *"Give me the full picture on Tata Steel Ltd — their total spend."* → expect **₹85.04 Cr** (A4).
2. Same thread: *"What about their payment delays?"* → should redirect to **Payment Terms**, still referring to Tata Steel Ltd, not asking who you mean.
3. On the Payment Terms page (same conversation): ask again, *"What about their payment delays?"* → should still know it means Tata Steel Ltd **without you retyping the name**.

---

## F. Genuine ambiguity → should clarify, not guess

| # | Ask on | Question | Expected behavior |
|---|---|---|---|
| F1 | Tail Spend | "Show me the top ones." | `ask_with_options` with concrete choices (e.g. "top vendors by spend," "top categories by tail spend") |
| F2 | Spend Overview | "Show me the top vendors." | Genuinely ambiguous between PO spend and invoiced spend — should clarify which basis, not silently pick one |
| F3 | Any | "Compare them." (as an opening message, no prior context) | Should ask what to compare — there's nothing established yet to compare |

## G. Should NOT need clarification (don't over-trigger F-type behavior)
| # | Ask on | Question | Expected behavior |
|---|---|---|---|
| G1 | Spend Overview | "What is our total spend?" | Answers directly (A1/A2) — this is not ambiguous |
| G2 | Payment Terms | "What's our average DPO?" | Answers directly (A7) |

---

## H. Edge cases / graceful failure

| # | Ask on | Question | Expected behavior |
|---|---|---|---|
| H1 | Spend Overview | "Show me spend for the Pune plant." | There is no plant named "Pune" in this data (real plants are Hindustan Zinc/Rajasthan, Vedanta Aluminium/Jharsuguda, Cairn Oil & Gas/Barmer, BALCO/Korba, Sterlite Copper/Tuticorin, Iron Ore Division/Goa, Corporate-Mumbai) — should say so plainly, not fabricate a number |
| H2 | Spend Overview | "Show me spend for supplier XYZ Nonexistent Corp." | Should report zero/no match, not invent a figure |
| H3 | Any | "What's the weather like today?" | Should decline — out of scope for a procurement assistant |
| H4 | Any | Send an empty message | Frontend should block this before it ever reaches the API |

---

## I. Widget-click context (requires an actual click — can't be typed)

1. On **Payment Terms**, click a bar in one of the charts (a real linked-analysis selection).
2. Ask: *"Why does this one matter more for our cash position than the others?"*
3. Check the "Remembering: …" strip shows **"Chart selection: …"** — this is the one thing a typed-only test can't prove; the click itself has to reach the assistant, not just the filter drawer.

---

## How to actually check answers against this key

Numbers should match **exactly** (this is a deterministic query engine, not an estimate) — a small rounding difference in Cr is fine, but the ranking and relative magnitudes should never disagree. If your AI's number for A1–A13 or B1–B3 doesn't match this table, that's a real bug worth reporting, not a phrasing difference.
