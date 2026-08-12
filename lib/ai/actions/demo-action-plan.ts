// THE ONLY FILE IN THIS FEATURE CONTAINING HARDCODED BUSINESS CONTENT.
//
// Everything below — the 98 suppliers, the spend figures, the named
// consolidation candidates — is predefined demo content for the "MRO & Spares
// supplier fragmentation" scenario. It exists so the demo has a fast,
// deterministic, presentable report while the live generator
// (lib/ai/actions/claude-action-plan.ts) is being proven out.
//
// Deleting this file and dropping it from the generator list in
// action-plan-service.ts is a complete, sufficient removal: nothing else
// imports it, no other module knows these numbers exist, and no caller
// branches on `kind === "demo"` for anything other than labelling. The
// registry, the tool schemas, the query engine, the API contract, the
// renderers, the cache, and the frontend are all entirely unaware of it.
//
// SCOPE GUARD (canHandle, below): this generator refuses anything but the
// scenario it was written for. A user on Payment Terms asking about DPO falls
// straight through to the live Claude generator rather than being handed a
// confident report about suppliers nobody asked about — §9's "must be
// dashboard-specific, never a generic business report" applies to the demo
// path exactly as much as to the real one.
//
// HONESTY: the plan's own `scope` line says out loud that it is a predefined
// illustrative dataset, and the API reports generator:"demo" alongside it. A
// downloaded .docx that outlives this conversation still says so on its face.

import "server-only";

import type { ActionPlanContext, ActionPlanGenerator } from "@/lib/ai/actions/action-plan-generator";
import type { ActionPlanResult } from "@/lib/ai/actions/action-plan-types";

const DEMO_DASHBOARD = "supplier-fragmentation";

// Matched against the user's objective so an unrelated question on the
// supplier-fragmentation dashboard ("which categories have active contracts?")
// still gets a real, live-generated report rather than this one.
const SCENARIO_KEYWORDS = ["mro", "spares", "fragment", "consolidat", "supplier base", "too many supplier"];

function buildDemoPlan(context: ActionPlanContext): ActionPlanResult {
  const filterNote = context.activeFilters ? ` Current view: ${context.activeFilters}.` : "";

  return {
    title: "MRO & Spares — Supplier Fragmentation Reduction Plan",
    objective:
      "Reduce supplier fragmentation in the MRO & Spares category while maintaining service levels, " +
      "business continuity, and plant-level availability.",
    scope:
      `${context.dashboardLabel} dashboard, MRO & Spares category.${filterNote} ` +
      "Figures in this report come from a predefined illustrative dataset prepared for demonstration, " +
      "not from a live query against your current data.",
    insightSummary:
      "MRO & Spares is served by 98 active suppliers against ₹42.6 Cr of annual committed spend. The top 10 " +
      "suppliers account for 61% of that spend, leaving 88 suppliers to share the remaining 39% — an average " +
      "of roughly ₹18.9 L each. 34 of those suppliers were transacted with only once in the period. The " +
      "category is therefore not fragmented uniformly: a manageable strategic core already exists, and the " +
      "fragmentation sits almost entirely in a long tail of low-value, low-frequency relationships that each " +
      "carry the same onboarding, compliance, and payment overhead as a major supplier.",

    facts: [
      { label: "Active suppliers in MRO & Spares", value: "98", source: "Count of distinct suppliers with committed spend in the period" },
      { label: "Total committed spend", value: "₹42.6 Cr", source: "Sum of purchase order line value for the category" },
      { label: "Top 10 supplier concentration", value: "61% of category spend", source: "Spend of the ten highest-value suppliers as a share of category total" },
      { label: "Suppliers below ₹25 L annual spend", value: "71 suppliers", source: "Supplier count filtered by annual spend threshold" },
      { label: "Spend held by those 71 suppliers", value: "₹9.8 Cr (23% of category)", source: "Sum of committed spend across the below-threshold supplier set" },
      { label: "Single-transaction suppliers", value: "34", source: "Suppliers with exactly one purchase order in the period" },
      { label: "Suppliers under an active framework agreement", value: "22 of 98", source: "Contract coverage for the category" },
      { label: "Sub-categories represented", value: "14", source: "Distinct sub-categories within MRO & Spares" },
    ],

    insights: [
      {
        insight: "Fragmentation is concentrated in the tail, not across the whole category — the strategic core is already reasonably consolidated.",
        basedOn: "Top 10 suppliers hold 61% of spend while the remaining 88 share 39%.",
      },
      {
        insight: "71 suppliers carry only 23% of category spend, so most of the supplier base generates administrative load out of proportion to its commercial value.",
        basedOn: "Supplier count below the ₹25 L threshold, and their combined spend share.",
      },
      {
        insight: "34 single-transaction suppliers suggest reactive, unplanned buying rather than a deliberately broad supply base.",
        basedOn: "Suppliers with exactly one purchase order in the period.",
      },
      {
        insight: "Contract coverage lags the supplier base badly — 76 of 98 suppliers transact with no framework agreement, which limits negotiating leverage and price consistency.",
        basedOn: "22 of 98 suppliers under an active framework agreement.",
      },
      {
        insight: "With 14 sub-categories across 98 suppliers, several sub-categories are likely served by overlapping suppliers who could be consolidated without reducing technical coverage.",
        basedOn: "Ratio of distinct sub-categories to active suppliers.",
      },
    ],

    recommendations: [
      {
        action: "Run a consolidation review of the 71 suppliers below ₹25 L annual spend, targeting a reduction to 25–30 retained suppliers in that band.",
        priority: "High",
        reason: "This group holds only 23% of category spend but 72% of the supplier count, so the administrative saving is large and the commercial disruption is small.",
        expectedImpact: "Materially lower transaction and vendor-management overhead, with limited exposure on spend.",
      },
      {
        action: "Retire or merge the 34 single-transaction supplier records after confirming none is a sole source for a critical spare.",
        priority: "High",
        reason: "One-off suppliers rarely reflect a deliberate sourcing decision and each still carries onboarding, compliance, and master-data cost.",
        expectedImpact: "Cleaner supplier master data and fewer compliance records to maintain.",
      },
      {
        action: "Put framework agreements in place for the top 20 suppliers by spend that currently transact without one.",
        priority: "High",
        reason: "76 of 98 suppliers have no active agreement, so most category spend is negotiated transaction by transaction.",
        expectedImpact: "Improved price consistency and a stronger position at renewal.",
      },
      {
        action: "Introduce a catalogue or punch-out route for high-frequency, low-value MRO consumables.",
        priority: "Medium",
        reason: "Repeat low-value buying is the mechanism that keeps generating new tail suppliers; consolidating the supplier list without changing the buying route lets the tail regrow.",
        expectedImpact: "Fewer new tail suppliers created, and less requisition-to-order handling time.",
      },
      {
        action: "Set a preferred-supplier list per sub-category and route new MRO requisitions through it by default.",
        priority: "Medium",
        reason: "14 sub-categories against 98 suppliers indicates overlapping coverage that a default routing rule can steer.",
        expectedImpact: "Spend steadily redirected toward retained suppliers without a hard block on exceptions.",
      },
      {
        action: "Add a quarterly review of newly onboarded MRO suppliers against the retained list.",
        priority: "Low",
        reason: "Consolidation is reversible; without a recurring check the supplier count drifts back up within a few quarters.",
        expectedImpact: "Consolidation gains held rather than eroded.",
      },
    ],

    benefits: [
      {
        metric: "Potential negotiated cost saving on addressable tail spend",
        formula: "Addressable spend (₹9.8 Cr) × assumed savings rate (5%)",
        assumption: "5% is an illustrative consolidation savings rate. It is not derived from your data and requires category-manager validation before use in a business case.",
        value: "₹49 L per year",
      },
      {
        metric: "Reduction in active supplier count",
        formula: "71 below-threshold suppliers − 28 retained (mid-point of the 25–30 target)",
        assumption: "Assumes no supplier in the group is a sole source for a critical spare. Each candidate needs a criticality check before removal.",
        value: "≈43 fewer active suppliers",
      },
      {
        metric: "Procurement administrative time released",
        formula: "Suppliers removed (≈43) × assumed annual vendor-management hours per supplier",
        assumption: "Per-supplier management effort is not tracked in this dashboard, so the hourly figure must come from the procurement team's own time study.",
        // No `value` on purpose: the dashboard cannot support a number here.
        // The renderers print "Not quantifiable from available dashboard data".
      },
      {
        metric: "Improved contract coverage",
        formula: "Suppliers under framework agreement, before (22) vs. after adding the top 20 uncovered suppliers (42)",
        assumption: "Assumes all 20 targeted suppliers agree to a framework agreement within the plan period; actual conversion is typically lower.",
        value: "22% → 43% of the supplier base",
      },
      {
        metric: "Working capital and payment-cycle improvement",
        formula: "Not derivable from this dashboard — payment terms and DPO are tracked separately.",
        assumption: "Consolidation often enables better payment terms, but this dashboard carries no payment data, so no figure is offered here.",
      },
    ],

    risks: [
      {
        risk: "A removed supplier turns out to be the sole source for a critical spare, causing a plant stoppage.",
        mitigation: "Screen every consolidation candidate against criticality and lead-time data before removal; exclude anything single-sourced.",
      },
      {
        risk: "Concentrating spend on fewer suppliers increases dependency and weakens the position if one fails.",
        mitigation: "Keep at least two qualified suppliers per sub-category and monitor the retained set for single-source exposure.",
      },
      {
        risk: "Plant teams bypass the preferred list under time pressure, regenerating the tail.",
        mitigation: "Pair the preferred list with a faster catalogue route so compliance is the path of least resistance, and review new suppliers quarterly.",
      },
      {
        risk: "Assumed savings do not materialise because current pricing is already competitive.",
        mitigation: "Validate the assumed rate against two or three actual renegotiations before committing to a savings target.",
      },
      {
        risk: "Supplier master-data cleanup removes records still referenced by open commitments.",
        mitigation: "Block rather than delete, and only after confirming no open purchase orders or unpaid invoices remain.",
      },
    ],

    implementationPlan: [
      { phase: "Phase 1 — Validate", action: "Confirm the supplier list, spend split, and criticality flags for the 71 below-threshold suppliers.", timeline: "Weeks 1–2", owner: "Category Manager, MRO" },
      { phase: "Phase 1 — Validate", action: "Screen the 34 single-transaction suppliers for sole-source and open-commitment status.", timeline: "Weeks 2–3", owner: "Procurement Operations" },
      { phase: "Phase 2 — Design", action: "Define the retained supplier list per sub-category and the exception route for anything outside it.", timeline: "Weeks 3–5", owner: "Category Manager, MRO" },
      { phase: "Phase 2 — Design", action: "Draft framework agreement terms for the top 20 uncovered suppliers.", timeline: "Weeks 4–6", owner: "Sourcing Lead" },
      { phase: "Phase 3 — Negotiate", action: "Run consolidation negotiations with retained suppliers in the tail band.", timeline: "Weeks 6–12", owner: "Sourcing Lead" },
      { phase: "Phase 3 — Negotiate", action: "Execute framework agreements and load agreed pricing.", timeline: "Weeks 8–14", owner: "Sourcing Lead / Contracts" },
      { phase: "Phase 4 — Transition", action: "Block retired supplier records and redirect open demand to retained suppliers.", timeline: "Weeks 12–16", owner: "Procurement Operations" },
      { phase: "Phase 4 — Transition", action: "Enable the catalogue route for high-frequency MRO consumables.", timeline: "Weeks 14–18", owner: "P2P / Systems" },
      { phase: "Phase 5 — Sustain", action: "Stand up the quarterly new-supplier review and track supplier count against the target.", timeline: "From week 18, quarterly", owner: "Category Manager, MRO" },
    ],

    assumptions: [
      "The 5% savings rate applied to addressable tail spend is an illustrative scenario, not a figure derived from your data, and requires business validation.",
      "No supplier in the consolidation group is a sole source for a critical spare — this must be verified before any removal.",
      "Demand volume and specification remain broadly stable over the plan period.",
      "Per-supplier vendor-management effort is not tracked in this dashboard, so administrative time savings cannot be quantified here.",
      "Payment-cycle and working-capital effects are out of scope for this dashboard; they are tracked under Payment Terms.",
      "The ₹25 L threshold used to define the tail is a working cut-off for this analysis, not a company standard.",
      "All figures in this report come from a predefined illustrative dataset prepared for demonstration.",
    ],

    nextSteps: [
      "Category Manager to confirm the 71-supplier consolidation candidate list within two weeks.",
      "Procurement Operations to return criticality and open-commitment flags for the single-transaction suppliers.",
      "Sourcing Lead to validate the assumed savings rate against two recent MRO renegotiations.",
      "Agree the retained-supplier target with plant stakeholders before Phase 2 begins.",
      "Schedule a decision review at the end of Phase 1 to approve or revise the target.",
    ],
  };
}

export const demoActionPlanGenerator: ActionPlanGenerator = {
  kind: "demo",

  canHandle(context: ActionPlanContext): boolean {
    if (context.dashboardKey !== DEMO_DASHBOARD) return false;
    const haystack = `${context.objective} ${context.activeFilters ?? ""}`.toLowerCase();
    return SCENARIO_KEYWORDS.some((keyword) => haystack.includes(keyword));
  },

  // Async only to satisfy the shared interface — there is nothing to await
  // here, which is exactly why the demo path returns in milliseconds.
  async generate(context: ActionPlanContext): Promise<ActionPlanResult> {
    return buildDemoPlan(context);
  },
};
