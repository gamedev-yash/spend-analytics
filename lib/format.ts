const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const plainNumber = new Intl.NumberFormat("en-US");

export function formatUsdCompact(value: number): string {
  return compactUsd.format(value);
}

export function formatUsd(value: number): string {
  return fullUsd.format(value);
}

export function formatNumber(value: number): string {
  return plainNumber.format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatMonthLabel(month: string): string {
  // "2025-01" -> "Jan 2025"
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
