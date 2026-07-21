# Payment Terms — Mock Dataset

Synthetic data for the **SAP Spend Control Tower → Spend Assessment: Payment Terms**
dashboard mockup (Next.js). Deterministic (seed = 42), so regenerating gives identical data.

- **Window:** last 12 completed months — 2025-07-01 → 2026-06-30 (reference "today" = 2026-07-20)
- **Currency:** USD only (single reporting currency)
- **Size:** 1,500 invoices, ~1.2 MB total

## Files

Everything a widget needs is denormalized onto `invoices.json`, so you can chart with no
joins. The dimension files exist for populating filter dropdowns and reference.

```
data/
  invoices.json          fact table (row per invoice) — the only file you must aggregate from
  payment_terms.json     dim: code, name, nominal_days, discount_pct, discount_days, kind
  global_ultimates.json  dim: gu_id, gu_name, region, n_entities  (the enriched parent supplier)
  suppliers.json         dim: legal entities, each linked to a global_ultimate_id
  categories.json        dim: UNSPSC-style code, name, segment_code, segment_name, level
  plants.json            dim: plant_id, name, country, country_code, region
  source_systems.json    dim: id, name
  metadata.json          seed, window, counts, notes
PROFILE.txt              generated data profile (sanity-check numbers)
generate_data.py         the generator — change constants at top and re-run to tune
```

### `invoices.json` — key fields

`invoice_id, invoice_date, paid_date, paid_days, is_paid, amount, currency,
supplier_id, supplier_name, global_ultimate_id, global_ultimate_name,
category_code, category_name, segment_code, segment_name,
plant_id, plant_name, region, country, source_system_id,
payment_term_code, payment_term_name, nominal_days`

`paid_days = paid_date − invoice_date`. Open invoices have `is_paid=false`,
`paid_date=null`, `paid_days=null`.

## How each dashboard element maps to the data

| Dashboard element | Derivation from `invoices.json` |
|---|---|
| KPI · Payment Terms | count distinct `payment_term_code` (non-null) |
| KPI · Average Number of Paid Days | mean `paid_days` where `is_paid` |
| Widget · Payment Terms by Categories | per `category_code`: count distinct `payment_term_code` (tooltip: spend, invoice count) |
| Widget · Payment Terms by Suppliers (Global Ultimate) | per `global_ultimate_id`: count distinct terms + sum `amount` |
| Widget · Spend by Payment Terms + Avg Paid Cycle Days | per `payment_term_code`: sum `amount` (columns) + mean `paid_days` (line) |
| Widget · Payment Terms by Number of Invoices | per `payment_term_code`: count invoices |
| Detail table | per `global_ultimate_name`: distinct terms, distinct categories, distinct plants, avg paid days, spend |
| Filter · Date Range | `invoice_date` |
| Filter · Category | `category_code` / `segment_code` |
| Filter · Source System | `source_system_id` |
| Filter · Payment Terms | `payment_term_code` |

> Note: per the SAP spec, this dashboard's filter set is only Date Range, Category,
> Source System, Payment Terms (no Supplier / Plant filter), and KPIs are not clickable.

## Patterns planted in the data (so the mockup tells a story)

- **Spend concentration (Pareto):** top 10 of 50 global-ultimate suppliers ≈ 65% of spend.
- **Payment behaviour:** the gap between a term's *nominal* days and *actual* paid days is
  the point of this dashboard. Suppliers carry behaviour: chronic-late (~+15 days over
  terms), early payers (wasted working capital), and discount-capturers vs discount-missers.
  Aggregate per-term gaps are small (realistic); the drama is at supplier level.
- **Term fragmentation:** most categories/suppliers use 1–4 payment terms; a few "hotspots"
  (e.g. Office supplies, and a handful of suppliers) use 12–29 distinct terms — a governance
  red flag and a natural future insight card.
- **Faithful SAP quirks:** some invoices have null category / null payment term (the
  "(No Value)" rows SAP shows), and ~6% of invoices are open (excluded from Avg Paid Days).

## Regenerating / tuning

Edit the constants at the top of `generate_data.py` and re-run (`python3 generate_data.py`):

- `N_INVOICES`, `N_GLOBAL_ULT` — dataset size
- `PARETO_ALPHA` — spend concentration (higher = more concentrated)
- `TARGET_TOTAL` — headline Total Spend
- `SEED` — change for a different-but-reproducible dataset
