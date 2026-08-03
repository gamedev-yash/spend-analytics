// Builds a DatasetProfile (types/dataset-profile.ts) from raw parsed CSV
// rows — pure computed aggregates (counts, quantiles, bounded top-K labels),
// never raw row samples, so the result is safe to send off-device as the
// basis for AI dashboard planning. Written fresh for the "Generate Custom
// Dashboard" feature; does not import any column-inference code from the
// older custom-dashboard builder.

import type {
  CategoricalStats,
  ColumnProfile,
  ColumnRole,
  CoercionInfo,
  DatasetProfile,
  DatasetShapeHint,
  NumericStats,
  TemporalStats,
  TextStats,
} from "@/types/dataset-profile";

const SAMPLE_CAP = 2000;
const WIDE_COLUMN_CAP = 60;
const MAX_CANDIDATES_PER_ROLE = 15;
const CATEGORICAL_DISTINCT_CAP = 500;
const CATEGORICAL_RATIO_CAP = 0.5;
const DIMENSION_MIN_DISTINCT = 2;
const DIMENSION_MAX_DISTINCT = 200;
const IDENTIFIER_RATIO = 0.9;
const NULL_HEAVY_RATIO = 0.9;
const LONG_FORMAT_MAX_METRIC_NAMES = 15;

// ---------------------------------------------------------------------------
// Tolerant parsing helpers
// ---------------------------------------------------------------------------

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  return String(value);
}

interface NumericParse {
  value: number;
  currencySymbol?: string;
  hadPercent: boolean;
  hadSymbols: boolean;
}

/** Strips ₹$€£, commas, %, whitespace and parenthesis-negatives; tolerant of leading/trailing junk. */
function parseNumericTolerant(raw: string): NumericParse | null {
  const s = raw.trim();
  if (!s) return null;
  const currencyMatch = /[₹$€£]/.exec(s);
  const hadPercent = s.includes("%");
  let cleaned = s.replace(/[₹$€£,%\s]/g, "");
  let negative = false;
  if (/^\(.+\)$/.test(cleaned)) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) return null;
  let value = Number(cleaned);
  if (Number.isNaN(value)) return null;
  if (negative) value = -Math.abs(value);
  const hadSymbols = cleaned !== s.trim() || negative;
  return { value, currencySymbol: currencyMatch?.[0], hadPercent, hadSymbols };
}

/** Max fractional-digit count in the numeric portion of a raw cell (before Number() rounding). */
function decimalPlacesOf(raw: string): number {
  const cleaned = raw.replace(/[₹$€£,%\s()]/g, "");
  const m = /\.(\d+)$/.exec(cleaned);
  return m ? m[1].length : 0;
}

function isValidYmd(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** ISO 8601 / YYYY-MM-DD / MM/DD/YYYY / DD-MM-YYYY, each verified against a real calendar date. */
function tryParseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z?)?$/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi, se] = m;
    const year = Number(y), month = Number(mo), day = Number(d);
    if (!isValidYmd(year, month, day)) return null;
    return new Date(Date.UTC(year, month - 1, day, h ? Number(h) : 0, mi ? Number(mi) : 0, se ? Number(se) : 0));
  }

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const mo = Number(m[1]), d = Number(m[2]), y = Number(m[3]);
    return isValidYmd(y, mo, d) ? new Date(Date.UTC(y, mo - 1, d)) : null;
  }

  m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    return isValidYmd(y, mo, d) ? new Date(Date.UTC(y, mo - 1, d)) : null;
  }

  return null;
}

function isIsoDateFormat(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(raw.trim());
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const ID_NAME_RE = /\b(id|uuid|guid|code|key|no|number)\b/;
const MEASURE_NAME_RE = /\b(spend|amount|amt|cost|value|val|revenue|price|total|sum|budget|expense|savings)\b/;
const DIMENSION_NAME_RE =
  /\b(category|categories|vendor|supplier|region|site|status|type|department|dept|segment|group|class|plant|location|owner|criticality|band|equipment)\b/;

function looksIdLike(name: string): boolean {
  return ID_NAME_RE.test(normalizeName(name));
}

// ---------------------------------------------------------------------------
// Pass 1: cheap, dataset-wide classification (every column, always)
// ---------------------------------------------------------------------------

type ColumnType = "numeric" | "temporal" | "string" | "empty";

interface Pass1Column {
  name: string;
  position: number;
  nonEmptyValues: string[];
  nullCount: number;
  distinctCount: number;
  distinctRatio: number;
  isConstant: boolean;
  type: ColumnType;
  sampleNumericRatio: number;
  sampleDateRatio: number;
  sampleIntegerOnly: boolean;
  role: ColumnRole;
}

function collectColumnNames(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const addKeys = (row: Record<string, unknown>) => {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  };
  if (rows.length > 0) addKeys(rows[0]);
  for (const row of rows) addKeys(row);
  return order;
}

function classifyColumn(name: string, position: number, rows: Record<string, unknown>[], rowCount: number): Pass1Column {
  const nonEmptyValues: string[] = [];
  let nullCount = 0;
  const distinctSet = new Set<string>();

  for (const row of rows) {
    const s = cellToString(row[name]).trim();
    if (s === "") {
      nullCount += 1;
      continue;
    }
    nonEmptyValues.push(s);
    distinctSet.add(s);
  }

  const distinctCount = distinctSet.size;
  const distinctRatio = rowCount > 0 ? distinctCount / rowCount : 0;
  const isConstant = distinctCount <= 1;

  const sample = nonEmptyValues.length > SAMPLE_CAP ? nonEmptyValues.slice(0, SAMPLE_CAP) : nonEmptyValues;
  let numericHits = 0;
  let dateHits = 0;
  let sampleMaxDecimalPlaces = 0;
  for (const v of sample) {
    const num = parseNumericTolerant(v);
    if (num) {
      numericHits += 1;
      const dp = decimalPlacesOf(v);
      if (dp > sampleMaxDecimalPlaces) sampleMaxDecimalPlaces = dp;
    }
    if (tryParseDate(v)) dateHits += 1;
  }
  const sampleNumericRatio = sample.length > 0 ? numericHits / sample.length : 0;
  const sampleDateRatio = sample.length > 0 ? dateHits / sample.length : 0;

  let type: ColumnType = "empty";
  if (sample.length > 0) {
    if (sampleNumericRatio >= 0.9) type = "numeric";
    else if (sampleDateRatio >= 0.9) type = "temporal";
    else type = "string";
  }

  const role = assignRole({ name, type, distinctRatio, distinctCount, isConstant, integerOnly: sampleMaxDecimalPlaces === 0 });

  return {
    name,
    position,
    nonEmptyValues,
    nullCount,
    distinctCount,
    distinctRatio,
    isConstant,
    type,
    sampleNumericRatio,
    sampleDateRatio,
    sampleIntegerOnly: sampleMaxDecimalPlaces === 0,
    role,
  };
}

function assignRole(args: {
  name: string;
  type: ColumnType;
  distinctRatio: number;
  distinctCount: number;
  isConstant: boolean;
  integerOnly: boolean;
}): ColumnRole {
  const { name, type, distinctRatio, distinctCount, isConstant, integerOnly } = args;
  if (isConstant) return "constant";
  if (type === "temporal") return "temporal";
  if (looksIdLike(name)) return "identifier";
  if (distinctRatio > IDENTIFIER_RATIO && (type !== "numeric" || integerOnly)) return "identifier";
  if (type === "numeric") return "measure";
  if (type === "string" && distinctCount >= DIMENSION_MIN_DISTINCT && distinctCount <= DIMENSION_MAX_DISTINCT) return "dimension";
  return "text";
}

// ---------------------------------------------------------------------------
// Pass 2: expensive per-role-type stats (only for the "detailed" column set)
// ---------------------------------------------------------------------------

function computeNumericStats(values: string[]): NumericStats | undefined {
  const parsed: number[] = [];
  let maxDecimalPlaces = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  for (const raw of values) {
    const p = parseNumericTolerant(raw);
    if (!p) continue;
    parsed.push(p.value);
    if (p.value < 0) negativeCount += 1;
    if (p.value === 0) zeroCount += 1;
    const dp = decimalPlacesOf(raw);
    if (dp > maxDecimalPlaces) maxDecimalPlaces = dp;
  }
  if (parsed.length === 0) return undefined;

  const sorted = [...parsed].sort((a, b) => a - b);
  const sum = parsed.reduce((a, b) => a + b, 0);
  const mean = sum / parsed.length;
  const variance = parsed.reduce((a, b) => a + (b - mean) ** 2, 0) / parsed.length;
  const stddev = Math.sqrt(variance);
  const integerOnly = maxDecimalPlaces === 0;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const looksLikeYear = integerOnly && min >= 1990 && max <= 2100;

  return {
    min,
    max,
    mean,
    median: percentile(sorted, 50),
    p25: percentile(sorted, 25),
    p75: percentile(sorted, 75),
    p95: percentile(sorted, 95),
    stddev,
    sum,
    negativeCount,
    zeroCount,
    integerOnly,
    decimalPlaces: maxDecimalPlaces,
    looksLikeYear,
  };
}

function computeTemporalStats(values: string[]): TemporalStats | undefined {
  const dates: Date[] = [];
  for (const raw of values) {
    const d = tryParseDate(raw);
    if (d) dates.push(d);
  }
  if (dates.length === 0) return undefined;

  const msValues = dates.map((d) => d.getTime());
  const minMs = Math.min(...msValues);
  const maxMs = Math.max(...msValues);
  const minDate = new Date(minMs).toISOString();
  const maxDate = new Date(maxMs).toISOString();
  const spanDays = Math.round((maxMs - minMs) / 86_400_000);

  const distinctDayIdx = Array.from(new Set(msValues.map((ms) => Math.floor(ms / 86_400_000)))).sort((a, b) => a - b);

  let medianGap = 0;
  if (distinctDayIdx.length > 1) {
    const gaps: number[] = [];
    for (let i = 1; i < distinctDayIdx.length; i++) gaps.push(distinctDayIdx[i] - distinctDayIdx[i - 1]);
    gaps.sort((a, b) => a - b);
    medianGap = gaps[Math.floor(gaps.length / 2)];
  }

  let granularity: TemporalStats["granularity"];
  if (distinctDayIdx.length <= 1 || medianGap <= 1) granularity = "day";
  else if (medianGap <= 9) granularity = "week";
  else if (medianGap <= 45) granularity = "month";
  else if (medianGap <= 135) granularity = "quarter";
  else if (medianGap <= 450) granularity = "year";
  else granularity = "irregular";

  const periodKeys = new Set<string>();
  for (const dayIdx of distinctDayIdx) {
    const d = new Date(dayIdx * 86_400_000);
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth();
    let key: string;
    switch (granularity) {
      case "day":
        key = `${y}-${mo}-${d.getUTCDate()}`;
        break;
      case "week":
        key = `w${Math.floor(dayIdx / 7)}`;
        break;
      case "month":
        key = `${y}-${mo}`;
        break;
      case "quarter":
        key = `${y}-Q${Math.floor(mo / 3)}`;
        break;
      case "year":
        key = `${y}`;
        break;
      default:
        key = `d${dayIdx}`;
    }
    periodKeys.add(key);
  }
  const distinctPeriodCount = periodKeys.size;

  const minD = new Date(minMs);
  const maxD = new Date(maxMs);
  const monthsBetween = (maxD.getUTCFullYear() - minD.getUTCFullYear()) * 12 + (maxD.getUTCMonth() - minD.getUTCMonth());
  let expected = distinctPeriodCount;
  switch (granularity) {
    case "day":
      expected = spanDays + 1;
      break;
    case "week":
      expected = Math.floor(spanDays / 7) + 1;
      break;
    case "month":
      expected = monthsBetween + 1;
      break;
    case "quarter":
      expected = Math.floor(monthsBetween / 3) + 1;
      break;
    case "year":
      expected = maxD.getUTCFullYear() - minD.getUTCFullYear() + 1;
      break;
    default:
      expected = distinctPeriodCount;
  }
  const hasGaps = granularity !== "irregular" && distinctPeriodCount < expected;

  return { minDate, maxDate, spanDays, granularity, distinctPeriodCount, hasGaps };
}

function computeCategoricalStats(values: string[], rowCount: number): CategoricalStats {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const topValues = sorted.slice(0, 10).map(([value, count]) => ({
    value,
    count,
    share: rowCount > 0 ? count / rowCount : 0,
  }));
  const topSum = topValues.reduce((a, t) => a + t.count, 0);
  const tailCount = values.length - topSum;
  const tailShare = rowCount > 0 ? tailCount / rowCount : 0;
  return { topValues, tailCount, tailShare };
}

function computeTextStats(values: string[]): TextStats {
  let totalLen = 0;
  let maxLen = 0;
  for (const v of values) {
    totalLen += v.length;
    if (v.length > maxLen) maxLen = v.length;
  }
  return { avgLength: values.length > 0 ? totalLen / values.length : 0, maxLength: maxLen };
}

function computeCoercion(type: ColumnType, sample: string[]): CoercionInfo | undefined {
  if (type === "numeric") {
    let hadSymbolsCount = 0;
    let percentCount = 0;
    const currencyCounts = new Map<string, number>();
    for (const v of sample) {
      const p = parseNumericTolerant(v);
      if (!p) continue;
      if (p.hadSymbols) hadSymbolsCount += 1;
      if (p.hadPercent) percentCount += 1;
      if (p.currencySymbol) currencyCounts.set(p.currencySymbol, (currencyCounts.get(p.currencySymbol) ?? 0) + 1);
    }
    let currencySymbol: string | undefined;
    let bestCount = 0;
    for (const [sym, count] of currencyCounts) {
      if (count > bestCount) {
        bestCount = count;
        currencySymbol = sym;
      }
    }
    return {
      numericStoredAsText: hadSymbolsCount > 0,
      dateStoredAsText: false,
      currencySymbol,
      percentFormat: sample.length > 0 && percentCount / sample.length > 0.5,
    };
  }
  if (type === "temporal") {
    let isoCount = 0;
    let nonIsoCount = 0;
    for (const v of sample) {
      if (!tryParseDate(v)) continue;
      if (isIsoDateFormat(v)) isoCount += 1;
      else nonIsoCount += 1;
    }
    return {
      numericStoredAsText: false,
      dateStoredAsText: nonIsoCount > 0 && nonIsoCount >= isoCount,
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Candidate ranking + long-format shape detection
// ---------------------------------------------------------------------------

function rankMeasures(cols: ColumnProfile[]): string[] {
  return cols
    .filter((c) => c.role === "measure")
    .sort((a, b) => {
      const am = MEASURE_NAME_RE.test(normalizeName(a.name)) ? 0 : 1;
      const bm = MEASURE_NAME_RE.test(normalizeName(b.name)) ? 0 : 1;
      if (am !== bm) return am - bm;
      return a.position - b.position;
    })
    .slice(0, MAX_CANDIDATES_PER_ROLE)
    .map((c) => c.name);
}

function rankDimensions(cols: ColumnProfile[]): string[] {
  return cols
    .filter((c) => c.role === "dimension")
    .sort((a, b) => {
      const am = DIMENSION_NAME_RE.test(normalizeName(a.name)) ? 0 : 1;
      const bm = DIMENSION_NAME_RE.test(normalizeName(b.name)) ? 0 : 1;
      if (am !== bm) return am - bm;
      return a.distinctCount - b.distinctCount;
    })
    .slice(0, MAX_CANDIDATES_PER_ROLE)
    .map((c) => c.name);
}

function rankTemporal(cols: ColumnProfile[]): string[] {
  return cols
    .filter((c) => c.role === "temporal")
    .sort((a, b) => (b.temporal?.distinctPeriodCount ?? 0) - (a.temporal?.distinctPeriodCount ?? 0) || a.position - b.position)
    .slice(0, MAX_CANDIDATES_PER_ROLE)
    .map((c) => c.name);
}

function rankIdentifiers(cols: ColumnProfile[]): string[] {
  return cols
    .filter((c) => c.role === "identifier")
    .sort((a, b) => b.distinctRatio - a.distinctRatio)
    .slice(0, MAX_CANDIDATES_PER_ROLE)
    .map((c) => c.name);
}

function detectShape(cols: ColumnProfile[], measureNames: string[]): DatasetShapeHint {
  if (measureNames.length !== 1) {
    if (measureNames.length > 1) {
      return {
        isLongFormat: false,
        reasoning: `Found ${measureNames.length} independent measure columns (${measureNames.slice(0, 4).join(", ")}${measureNames.length > 4 ? ", ..." : ""}), so the data reads as one row per entity with multiple measures rather than a tidy metric-name/value layout.`,
      };
    }
    return { isLongFormat: false, reasoning: "No numeric measure column was detected, so a metric-name/value long format cannot apply." };
  }

  const metricValueColumn = measureNames[0];
  const nameCandidates = cols.filter(
    (c) =>
      c.role === "dimension" &&
      c.distinctCount >= 2 &&
      c.distinctCount <= LONG_FORMAT_MAX_METRIC_NAMES &&
      c.categorical &&
      c.categorical.topValues.every((t) => t.value.length <= 40),
  );

  if (nameCandidates.length === 0) {
    return {
      isLongFormat: false,
      reasoning: `"${metricValueColumn}" is the only measure column, but no low-cardinality, label-like column was found to act as a metric-name column, so this doesn't read as a long/tidy layout.`,
    };
  }

  const metricNameColumn = [...nameCandidates].sort((a, b) => a.distinctCount - b.distinctCount)[0].name;
  return {
    isLongFormat: true,
    metricNameColumn,
    metricValueColumn,
    reasoning: `Column "${metricNameColumn}" has ${nameCandidates[0].distinctCount} short, label-like values and "${metricValueColumn}" is the only measure column, so each row looks like one (entity, metric) observation rather than one entity with many measure columns.`,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildDatasetProfile(rows: Record<string, unknown>[]): DatasetProfile {
  const rowCount = rows.length;

  if (rowCount === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      sampled: false,
      parseWarnings: ["Dataset has no rows."],
      columns: [],
      candidates: { measures: [], dimensions: [], temporal: [], identifiers: [] },
      shape: { isLongFormat: false, reasoning: "No rows to analyze." },
      truncated: false,
    };
  }

  const columnNames = collectColumnNames(rows);
  const columnCount = columnNames.length;
  const sampled = rowCount > SAMPLE_CAP;
  const truncated = columnCount > WIDE_COLUMN_CAP;

  const pass1 = columnNames.map((name, position) => classifyColumn(name, position, rows, rowCount));

  let detailedNames: Set<string>;
  if (!truncated) {
    detailedNames = new Set(columnNames);
  } else {
    const candidateRoles: ColumnRole[] = ["measure", "dimension", "temporal", "identifier"];
    const byRole = candidateRoles.flatMap((role) =>
      pass1.filter((c) => c.role === role).slice(0, MAX_CANDIDATES_PER_ROLE * 2),
    );
    detailedNames = new Set(byRole.map((c) => c.name));
  }

  const parseWarnings: string[] = [];
  const columns: ColumnProfile[] = pass1.map((c) => {
    const nullPct = rowCount > 0 ? c.nullCount / rowCount : 0;
    if (nullPct >= NULL_HEAVY_RATIO) {
      parseWarnings.push(`Column "${c.name}" is ${Math.round(nullPct * 100)}% empty.`);
    }
    if (c.type === "string" && (c.sampleNumericRatio > 0.15 || c.sampleDateRatio > 0.15)) {
      parseWarnings.push(`Column "${c.name}" appears to have mixed numeric/text or date/text values.`);
    }

    const profile: ColumnProfile = {
      name: c.name,
      position: c.position,
      role: c.role,
      nullCount: c.nullCount,
      nullPct,
      isConstant: c.isConstant,
      distinctCount: c.distinctCount,
      distinctRatio: c.distinctRatio,
    };

    if (!detailedNames.has(c.name) || c.isConstant) return profile;

    const sample = c.nonEmptyValues.length > SAMPLE_CAP ? c.nonEmptyValues.slice(0, SAMPLE_CAP) : c.nonEmptyValues;

    if (c.type === "numeric") {
      profile.numeric = computeNumericStats(c.nonEmptyValues);
      profile.coercion = computeCoercion("numeric", sample);
    } else if (c.type === "temporal") {
      profile.temporal = computeTemporalStats(c.nonEmptyValues);
      profile.coercion = computeCoercion("temporal", sample);
    } else if (c.type === "string") {
      const eligibleForCategorical = c.distinctCount <= CATEGORICAL_DISTINCT_CAP || c.distinctRatio <= CATEGORICAL_RATIO_CAP;
      if (eligibleForCategorical) {
        profile.categorical = computeCategoricalStats(c.nonEmptyValues, rowCount);
      } else {
        profile.text = computeTextStats(c.nonEmptyValues);
      }
    }

    return profile;
  });

  if (truncated) {
    parseWarnings.push(
      `Dataset has ${columnCount} columns; detailed statistics were limited to the ${detailedNames.size} highest-signal columns.`,
    );
  }

  const measures = rankMeasures(columns);
  const dimensions = rankDimensions(columns);
  const temporal = rankTemporal(columns);
  const identifiers = rankIdentifiers(columns);

  const shape = detectShape(columns, measures);

  return {
    rowCount,
    columnCount,
    sampled,
    sampleSize: sampled ? SAMPLE_CAP : undefined,
    parseWarnings,
    columns,
    candidates: { measures, dimensions, temporal, identifiers },
    shape,
    truncated,
  };
}
