// Shared by both the client-side DashboardAssistant (to know which dashboard
// it's on, and where the *other* dashboards live for redirects) and the
// server-side dashboard-context builder. No data here — just routing/labels —
// so this file is safe to import from "use client" components.

export type DashboardKey =
  | "spend-overview"
  | "compliance"
  | "payment-terms"
  | "tail-spend"
  | "supplier-fragmentation"
  | "single-source-risk";

export interface DashboardMeta {
  key: DashboardKey;
  label: string;
  route: string;
  description: string;
}

// Every description below is deliberately more than a one-line label: it is
// read by the model both (a) about ITS OWN dashboard, to decide whether a
// question is in scope before it ever calls a tool, and (b) about the OTHER
// five dashboards, to decide whether to call redirect_to_dashboard instead of
// guessing. Each one names real tables/columns from lib/ai/dashboard-tables.ts
// so routing is grounded in what the dashboard can actually query, not a
// vibe — and each explicitly lists what does NOT belong here, since a
// same-topic-adjacent question ("spend" appears on all six) is exactly what a
// short description fails to disambiguate.
export const DASHBOARD_REGISTRY: DashboardMeta[] = [
  {
    key: "spend-overview",
    label: "Spend Overview",
    route: "/spend-overview",
    description:
      "The headline view of total procurement spend — tables fact_po_items (committed/PO spend) and " +
      "fact_invoices (actual/invoiced spend). Answers: total spend, spend trend over time (YTD, monthly, " +
      "period-over-period / YoY), spend broken down by category (category_l1_name/category_l2_name), " +
      "supplier/vendor (vendor_name), business unit or plant (plant_name, region, company_name), and top-N " +
      "suppliers or categories by spend. Synonyms: \"purchases\", \"buy\", \"procurement volume\". Do NOT use " +
      "this for: off-contract/off-PO/\"maverick\" spend or unmanaged-spend % (that's Compliance), payment " +
      "cycle days/DPO/discount capture (Payment Terms), the 80/20 Pareto or \"tail spend\" concentration by " +
      "vendor (Tail Spend), how many suppliers serve a category or duplicate/single-use suppliers (Supplier " +
      "Fragmentation), or categories at single-source risk (Single Source Risk) — those are distinct, " +
      "precomputed concepts on other dashboards even though they're all rooted in the same spend data.",
  },
  {
    key: "compliance",
    label: "Compliance",
    route: "/compliance",
    description:
      "Unmanaged spend — the same fact_po_items and fact_invoices tables as Spend Overview, filtered to the " +
      "portion NOT governed by a standing agreement or purchase order. Off-contract spend = fact_po_items " +
      "rows where is_contract_backed=0; off-PO / \"maverick\" spend = fact_invoices rows where po_number is " +
      "blank. Answers: total/unmanaged spend and its %, off-contract spend by category, off-PO spend by " +
      "category, unmanaged spend by business unit or supplier, maverick spend rate. Synonyms: \"rogue " +
      "spend\", \"leakage\", \"non-compliant purchases\", \"governance\". Do NOT use this for: overall total " +
      "spend with no compliance angle (Spend Overview), which categories have active framework contracts and " +
      "their committed value (that needs dim_contract — Supplier Fragmentation carries it, not this " +
      "dashboard), payment/DPO (Payment Terms), or supplier concentration/tail spend (their own dashboards).",
  },
  {
    key: "payment-terms",
    label: "Payment Terms",
    route: "/payment-terms",
    description:
      "Everything about how and when invoices actually get paid — table fact_payments only (one row per " +
      "accounting document, with payment_term_description, actual_dpo, and discount fields already computed " +
      "per document). Answers: average paid days / DPO (Days Payable Outstanding), payment term distribution " +
      "and how fragmented terms are across categories/suppliers (distinctTermCount), discount capture rate " +
      "(discount_captured_inr ÷ discount_available_inr), discount missed, payment status, invoice counts by " +
      "term/category/plant. Synonyms: \"DPO\", \"days payable\", \"early payment discount\", \"cash " +
      "discount\", \"payment cycle\". Do NOT use this for: total/committed spend amounts with no payment-cycle " +
      "angle (Spend Overview), whether spend is off-contract/off-PO (Compliance), or supplier/category " +
      "concentration (Tail Spend, Supplier Fragmentation, Single Source Risk) — payment behavior is tracked " +
      "here independently of those.",
  },
  {
    key: "tail-spend",
    label: "Tail Spend",
    route: "/tail-spend",
    description:
      "Pareto (80/20) concentration of committed spend across vendors — tables fact_po_items and " +
      "agg_vendor_annual, the latter pre-aggregated per vendor per year with spend_rank, " +
      "cumulative_spend_pct, and is_tail/tail_tier already computed (past the 80th percentile of cumulative " +
      "spend = \"tail\"). Answers: tail spend value and its share of total/PO volume, how many vendors/POs " +
      "are in the tail, invoice-value bucket distribution (micro-PO analysis), decile spend share, core vs. " +
      "strategic vs. tail spend comparison, consolidation candidates. Synonyms: \"long tail\", \"Pareto\", " +
      "\"80/20\", \"micro-PO\", \"small suppliers\". Do NOT use this for: raw spend totals/trends with no " +
      "concentration angle (Spend Overview), off-contract/off-PO spend (Compliance), payment cycle metrics " +
      "(Payment Terms), or category-level supplier-count fragmentation (Supplier Fragmentation) — tail spend " +
      "ranks vendors by spend share, fragmentation counts distinct suppliers per category; they use different " +
      "math on overlapping data and are easy to conflate.",
  },
  {
    key: "supplier-fragmentation",
    label: "Supplier Fragmentation",
    route: "/supplier-fragmentation",
    description:
      "How many suppliers serve each category and how concentrated spend is among them — tables " +
      "fact_po_items and dim_contract (framework agreements: contract_value_inr, is_active, by " +
      "vendor/category/plant). Answers: fragmentation index, top-3/top-10 supplier concentration % per " +
      "category, most-fragmented category, active/single-use/duplicate/new-supplier counts, average " +
      "suppliers per category, contract coverage (which categories/vendors have an active contract and its " +
      "committed value). Synonyms: \"too many vendors\", \"supplier sprawl\", \"consolidation " +
      "opportunity\", \"contract coverage\". Do NOT use this for: too FEW suppliers in a category (that is " +
      "the opposite condition — Single Source Risk), vendor-level Pareto/tail-spend ranking " +
      "(Tail Spend), off-contract spend amounts (Compliance carries the spend side; this dashboard carries " +
      "contract existence/coverage), or payment behavior (Payment Terms).",
  },
  {
    key: "single-source-risk",
    label: "Single Source Risk",
    route: "/single-source-risk",
    description:
      "Categories dependent on too FEW distinct suppliers — table fact_po_items only, grouped by category " +
      "and counting DISTINCT vendor_id; at or below the user's stated supplier-count threshold is \"at " +
      "risk\". Answers: at-risk category count and their spend share, spend/exposure by supplier, product " +
      "(material_group_id), or plant for those at-risk categories, cost-center/plant/product counts behind " +
      "the exposure. Synonyms: \"supply risk\", \"vendor dependency\", \"sole source\", \"concentration " +
      "risk\" (in the single-supplier sense, not Tail Spend's vendor-ranking sense). Do NOT use this for: too " +
      "MANY suppliers or duplicate/single-use supplier counts (the opposite condition — Supplier " +
      "Fragmentation), vendor spend-rank/Pareto tail analysis (Tail Spend), off-contract/off-PO spend " +
      "(Compliance), or payment/DPO metrics (Payment Terms).",
  },
];

// NOTE: there is no dashboardKeyForPathname() here any more. Route → dashboard
// resolution lives in exactly one place now — resolveDashboardContext() in
// lib/ai/dashboard-context.ts — because a pathname can also name a CUSTOM
// dashboard (/generated/<id>), and a resolver that could only return a
// DashboardKey had to answer null for those, which is what left custom
// dashboards without an assistant at all.

export function dashboardMeta(key: DashboardKey): DashboardMeta {
  const meta = DASHBOARD_REGISTRY.find((d) => d.key === key);
  if (!meta) throw new Error(`Unknown dashboard key: ${key}`);
  return meta;
}
