// Statistical profile of an uploaded CSV, built entirely from computed
// aggregates (counts, quantiles, bounded top-K labels) rather than raw row
// samples, so it's safe to send off-device as the basis for AI dashboard
// planning.

export type ColumnRole = "measure" | "dimension" | "temporal" | "identifier" | "text" | "constant";

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  p95: number;
  stddev: number;
  sum: number;
  negativeCount: number;
  zeroCount: number;
  integerOnly: boolean;
  decimalPlaces: number;
  /** e.g. a 4-digit int column clustered in 1990-2035 — a hint it's not a real measure. */
  looksLikeYear: boolean;
}

export interface TemporalStats {
  minDate: string;
  maxDate: string;
  spanDays: number;
  granularity: "day" | "week" | "month" | "quarter" | "year" | "irregular";
  distinctPeriodCount: number;
  hasGaps: boolean;
}

export interface CategoricalTopValue {
  value: string;
  count: number;
  share: number;
}

export interface CategoricalStats {
  topValues: CategoricalTopValue[];
  tailCount: number;
  tailShare: number;
}

export interface TextStats {
  avgLength: number;
  maxLength: number;
}

export interface CoercionInfo {
  numericStoredAsText: boolean;
  dateStoredAsText: boolean;
  currencySymbol?: string;
  percentFormat?: boolean;
}

export interface ColumnProfile {
  name: string;
  position: number;
  role: ColumnRole;
  nullCount: number;
  nullPct: number;
  isConstant: boolean;
  /** distinctCount / rowCount — near 1.0 is the strongest identifier tell. */
  distinctCount: number;
  distinctRatio: number;
  numeric?: NumericStats;
  temporal?: TemporalStats;
  categorical?: CategoricalStats;
  text?: TextStats;
  coercion?: CoercionInfo;
}

export interface DatasetShapeHint {
  /** True when the data is one-metric-per-row (name + value columns) rather than one-column-per-metric. */
  isLongFormat: boolean;
  metricNameColumn?: string;
  metricValueColumn?: string;
  reasoning: string;
}

export interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  sampled: boolean;
  sampleSize?: number;
  parseWarnings: string[];
  columns: ColumnProfile[];
  candidates: {
    measures: string[];
    dimensions: string[];
    temporal: string[];
    identifiers: string[];
  };
  shape: DatasetShapeHint;
  truncated: boolean;
}
