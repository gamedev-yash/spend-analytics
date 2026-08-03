// Renders a DatasetProfile (types/dataset-profile.ts) into a compact,
// information-dense text block for LLM consumption — a data-dictionary style
// summary, not raw JSON. This text is the ONLY thing the planning/widget
// Claude calls see about the uploaded dataset.

import type { CategoricalTopValue, ColumnProfile, DatasetProfile } from "@/types/dataset-profile";

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function renderTopValues(topValues: CategoricalTopValue[], limit: number): string {
  return topValues
    .slice(0, limit)
    .map((t) => `${t.value} (${fmtPct(t.share)})`)
    .join(", ");
}

function renderColumnLine(col: ColumnProfile, topValueLimit: number): string {
  const parts: string[] = [
    `- ${col.name} [${col.role}]`,
    `null=${fmtPct(col.nullPct)}`,
    `distinct=${col.distinctCount} (${fmtPct(col.distinctRatio)})`,
  ];
  if (col.isConstant) parts.push("CONSTANT (single value)");

  if (col.numeric) {
    const n = col.numeric;
    parts.push(
      `range=[${fmtNum(n.min)}..${fmtNum(n.max)}]`,
      `mean=${fmtNum(n.mean)}`,
      `median=${fmtNum(n.median)}`,
      `p25=${fmtNum(n.p25)}`,
      `p75=${fmtNum(n.p75)}`,
      `p95=${fmtNum(n.p95)}`,
      `stddev=${fmtNum(n.stddev)}`,
      `sum=${fmtNum(n.sum)}`,
      n.integerOnly ? "integer-only" : `decimals<=${n.decimalPlaces}`,
      n.negativeCount > 0 ? `negatives=${n.negativeCount}` : "",
      n.zeroCount > 0 ? `zeros=${n.zeroCount}` : "",
      n.looksLikeYear ? "LOOKS LIKE A YEAR, not a real measure" : "",
    );
  }

  if (col.temporal) {
    const t = col.temporal;
    parts.push(
      `span=${t.minDate.slice(0, 10)}..${t.maxDate.slice(0, 10)} (${t.spanDays}d)`,
      `granularity=${t.granularity}`,
      `periods=${t.distinctPeriodCount}`,
      t.hasGaps ? "has gaps (missing periods in span)" : "no gaps",
    );
  }

  if (col.categorical) {
    const cat = col.categorical;
    parts.push(`top-values: ${renderTopValues(cat.topValues, topValueLimit)}`);
    if (cat.tailCount > 0) parts.push(`tail="other" ${cat.tailCount} rows (${fmtPct(cat.tailShare)})`);
  }

  if (col.text) {
    parts.push(`avg-length=${fmtNum(col.text.avgLength)}`, `max-length=${col.text.maxLength}`);
  }

  if (col.coercion) {
    const co = col.coercion;
    const flags: string[] = [];
    if (co.numericStoredAsText) flags.push("numeric stored as text");
    if (co.dateStoredAsText) flags.push("date stored as text (non-ISO format)");
    if (co.currencySymbol) flags.push(`currency=${co.currencySymbol}`);
    if (co.percentFormat) flags.push("percent format");
    if (flags.length > 0) parts.push(`coercion: ${flags.join(", ")}`);
  }

  return parts.filter((p) => p.length > 0).join(" | ");
}

function renderCandidates(label: string, names: string[]): string {
  return `${label}: ${names.length > 0 ? names.join(", ") : "(none detected)"}`;
}

export function renderDatasetProfile(profile: DatasetProfile): string {
  const sections: string[] = [];

  const headerBits = [
    `rows=${profile.rowCount}`,
    `columns=${profile.columnCount}`,
    profile.sampled
      ? `sampled=true (stats based on first ${profile.sampleSize} rows for classification, exact counts scanned in full)`
      : "sampled=false",
    profile.truncated ? "truncated=true (detailed stats limited to highest-signal columns, see below)" : "truncated=false",
  ];
  const headerLines = [`DATASET: ${headerBits.join(", ")}`];
  if (profile.parseWarnings.length > 0) {
    headerLines.push("WARNINGS:");
    for (const w of profile.parseWarnings) headerLines.push(`  - ${w}`);
  }
  sections.push(headerLines.join("\n"));

  const topValueLimit = profile.truncated ? 3 : 8;
  const columnLines = ["COLUMNS:", ...profile.columns.map((col) => renderColumnLine(col, topValueLimit))];
  sections.push(columnLines.join("\n"));

  const candidateLines = [
    "CANDIDATE COLUMNS (ranked, most relevant first):",
    renderCandidates("measures", profile.candidates.measures),
    renderCandidates("dimensions", profile.candidates.dimensions),
    renderCandidates("temporal", profile.candidates.temporal),
    renderCandidates("identifiers", profile.candidates.identifiers),
  ];
  sections.push(candidateLines.join("\n"));

  const shapeLines = [
    "SHAPE:",
    `isLongFormat=${profile.shape.isLongFormat}`,
    profile.shape.metricNameColumn ? `metricNameColumn=${profile.shape.metricNameColumn}` : "",
    profile.shape.metricValueColumn ? `metricValueColumn=${profile.shape.metricValueColumn}` : "",
    `reasoning: ${profile.shape.reasoning}`,
  ].filter((l) => l !== "");
  sections.push(shapeLines.join("\n"));

  return sections.join("\n\n");
}
