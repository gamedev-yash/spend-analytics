// Named business metrics with their exact computation recipe, so the model
// looks a term up instead of inventing its own interpretation of it.
//
// EXTRACTED, NOT REWRITTEN: this text lived as a module const inside
// app/api/dashboard-chat/route.ts until the assistant grew a second Claude
// workflow (lib/ai/actions/claude-action-plan.ts) that needs the exact same
// definitions. Two copies of a metric dictionary is how "tail spend" quietly
// comes to mean two different things in two places, so it lives here and both
// callers import it. The wording is unchanged from the chat route's original.
//
// Every entry names the table it needs — whichever caller embeds this still
// governs, separately, whether that table is actually in reach (the chat
// route's "you have DATA ACCESS ONLY for this dashboard" boundary). A metric
// that needs a table the current dashboard doesn't carry is a signal to
// redirect (chat) or to report the data as unavailable (action plan), never
// to approximate from whatever tables happen to be available.

export const SEMANTIC_METRIC_DICTIONARY = `SEMANTIC METRIC DICTIONARY — how to compute named business metrics, when the tables above carry what they need:
- Off-contract / off-PO spend: fact_po_items rows where is_contract_backed = 0 (committed spend not against a standing agreement), or fact_invoices rows where po_number is blank ("maverick" spend — not tied to any purchase order).
- Maverick spend %: count(fact_invoices where po_number is blank) ÷ count(fact_invoices) × 100.
- DPO (Days Payable Outstanding): fact_payments.actual_dpo — already computed per document as clearing_date − baseline_date. Never recompute it from other date fields.
- Discount capture rate: fact_payments.discount_captured_inr ÷ discount_available_inr × 100 — only meaningful where discount_available_inr > 0.
- Tail spend: agg_vendor_annual rows where is_tail = true (equivalently cumulative_spend_pct > 80 for that vendor's year) — vendors past the 80th percentile of cumulative spend.
- Pareto / 80-20 concentration: agg_vendor_annual.spend_rank and cumulative_spend_pct are precomputed per vendor per year — read them directly rather than re-ranking vendors yourself from fact_po_items when this table is available.
- Single-source / concentration risk for a category: count DISTINCT vendor_id in fact_po_items grouped by category — a category at or below the user's stated supplier-count threshold is "at risk."
- Contract coverage: dim_contract rows where is_active = true, grouped by vendor/category/plant — contract_value_inr is the committed value, not actual spend against it.
- Supplier fragmentation for a category: count DISTINCT vendor_id in fact_po_items per category — a high count relative to spend suggests consolidation potential.

Amounts in columns ending _inr are Indian rupees — report them in Cr (10,000,000) or L (100,000), matching how the dashboards themselves display money. "top N" means sort descending on the aggregated value and cap at N.

For context, the full warehouse behind this app has seven tables total (fact_po_items, fact_invoices, fact_payments, agg_vendor_annual, dim_contract, dim_material, dim_payment_terms) — this dashboard's own tables, listed above, are the slice of that warehouse actually in reach here.`;
