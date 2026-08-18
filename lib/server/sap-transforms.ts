// Transforms shared by the Azure SQL seed ETL (scripts/seed-azure-sql.ts) and
// the no-database fallback the query API serves from the sample CSVs
// (lib/server/sample-data-source.ts). Both have to agree: if the fallback
// computed a fiscal year or an FX rate differently from the warehouse, the same
// QueryPayload would return different numbers depending on whether a connection
// string happened to be set.
//
// No "server-only" marker here — the seed script is a plain tsx CLI.

/** Document-currency → INR. Sample amounts are already INR, so ETL divides by these. */
export const FX_TO_INR: Record<string, number> = {
  INR: 1,
  USD: Number(process.env.USD_INR_RATE ?? 83.5),
  EUR: Number(process.env.EUR_INR_RATE ?? 90),
};

/** Rate for a document currency; unknown codes fall back to 1 and are reported. */
export function fxRate(currency: string, onUnknown?: (code: string) => void): number {
  const rate = FX_TO_INR[currency.toUpperCase()];
  if (rate === undefined) {
    onUnknown?.(currency);
    return 1;
  }
  return rate;
}

/**
 * Indian fiscal calendar, 1 April – 31 March. April is period 1 of the year that
 * starts it, so January–March belong to the previous fiscal year:
 * 25 Jan 2024 → fiscalYear 2023, quarter 4, period 10.
 */
export function fiscalParts(year: number, month: number): {
  fiscalYear: number;
  fiscalQuarter: number;
  fiscalPeriod: number;
} {
  const fiscalPeriod = month >= 4 ? month - 3 : month + 9;
  return {
    fiscalYear: month >= 4 ? year : year - 1,
    fiscalQuarter: Math.ceil(fiscalPeriod / 3),
    fiscalPeriod,
  };
}

/**
 * "CATERPILLAR-GRP" → "Caterpillar Group"; "CUMMINS GROUP" → "Cummins Group"
 * (not "Cummins Group Group" — an existing GROUP/GRP suffix is stripped before
 * the canonical one below is appended). "GRP-008" is this extract's
 * placeholder for a domestic group with no assigned brand name, so it renders
 * as "Group 008" — its own number, never the SAP-style code verbatim.
 */
export function humanizeGroupName(code: string): string {
  const trimmed = code.trim();

  const numbered = /^GRP-(\d+)$/i.exec(trimmed);
  if (numbered) return `Group ${numbered[1]}`;

  const withoutSuffix = trimmed.replace(/[-_\s]+(GROUP|GRP)$/i, "");

  const titled = withoutSuffix
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) =>
      word.length <= 3 && word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");

  return `${titled} Group`;
}
