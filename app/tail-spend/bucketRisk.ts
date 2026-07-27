// Pure helpers mapping SAP invoice-value bucket labels ("<1K", "1K-5K",
// ">5M") onto the live micro-PO threshold, so charts can accent at-risk
// buckets. Kept free of component imports for direct unit testing.

export interface BucketValueRange {
  lower: number;
  upper: number;
}

/** Parse a bucket label like "<1K", "1K-5K", ">5M" into its [lower, upper) value range. */
export function bucketRange(label: string): BucketValueRange | null {
  const toNumber = (token: string): number => {
    const m = token.trim().match(/^([\d.]+)\s*([KM]?)$/i);
    if (!m) return NaN;
    const base = Number(m[1]);
    const mult = m[2].toUpperCase() === "M" ? 1_000_000 : m[2].toUpperCase() === "K" ? 1_000 : 1;
    return base * mult;
  };
  const lessThan = label.match(/^<\s*(.+)$/);
  if (lessThan) {
    const upper = toNumber(lessThan[1]);
    return Number.isFinite(upper) ? { lower: 0, upper } : null;
  }
  const greaterThan = label.match(/^>\s*(.+)$/);
  if (greaterThan) {
    const lower = toNumber(greaterThan[1]);
    return Number.isFinite(lower) ? { lower, upper: Infinity } : null;
  }
  const range = label.match(/^(.+?)-(.+)$/);
  if (range) {
    const lower = toNumber(range[1]);
    const upper = toNumber(range[2]);
    return Number.isFinite(lower) && Number.isFinite(upper) ? { lower, upper } : null;
  }
  return null;
}

/** rose = bucket entirely under the micro boundary; amber = boundary falls inside it. */
export function bucketRisk(
  label: string,
  microThreshold: number | undefined
): "danger" | "warning" | null {
  if (!microThreshold || microThreshold <= 0) return null;
  const range = bucketRange(label);
  if (!range) return null;
  if (range.upper <= microThreshold) return "danger";
  if (range.lower < microThreshold) return "warning";
  return null;
}
