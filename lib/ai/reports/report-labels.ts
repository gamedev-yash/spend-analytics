// The handful of strings BOTH renderers print that don't come from the
// ActionPlanResult.
//
// They live here rather than being duplicated in report-word.ts and
// report-excel.ts for the same reason the two renderers share one input
// object: if the Word document said "cannot be estimated" and the Excel sheet
// said "N/A" for the same benefit, a reader comparing the two would reasonably
// conclude one of them was wrong. There is exactly one wording, in one place.
//
// Nothing business-specific belongs in this file — these are rendering
// fallbacks, not content.

import "server-only";

/** Shown wherever a generator declined to quantify a benefit. The visible half of the never-fabricate-a-number rule. */
export const NOT_QUANTIFIABLE = "Not quantifiable from available dashboard data";

/** Shown instead of omitting an empty section, so a thin report reads as a finding rather than a rendering bug. */
export const NONE_IDENTIFIED = "None identified for this scope.";
