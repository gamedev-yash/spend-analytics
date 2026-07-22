const LAKH = 100_000;
const CRORE = 10_000_000;

/** Always expressed in ₹ Crore, e.g. "₹12.5 Cr" / "₹18,306.4 Cr". */
export function formatCr(value: number, digits = 1): string {
  const cr = value / CRORE;
  const formatted = cr.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `₹${formatted} Cr`;
}

/** Always expressed in ₹ Lakh, e.g. "₹45.2 L". */
export function formatLakh(value: number, digits = 1): string {
  return `₹${(value / LAKH).toFixed(digits)} L`;
}

/** Picks Cr for large values, Lakh for mid-size, plain ₹ for small — the Indian-format convention. */
export function formatInr(value: number, digits = 1): string {
  const abs = Math.abs(value);
  if (abs >= CRORE) return formatCr(value, digits);
  if (abs >= LAKH) return formatLakh(value, digits);
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

/** Compact axis-tick style: "12.5Cr" / "45.2L" (no ₹ symbol, no space — for chart axes). */
export function formatInrCompact(value: number, digits = 1): string {
  const abs = Math.abs(value);
  if (abs >= CRORE) return `${(value / CRORE).toFixed(digits)}Cr`;
  if (abs >= LAKH) return `${(value / LAKH).toFixed(digits)}L`;
  return String(Math.round(value));
}

export function formatPercentInr(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercentInr(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function crToInr(cr: number): number {
  return cr * CRORE;
}
export function inrToCr(inr: number): number {
  return inr / CRORE;
}
