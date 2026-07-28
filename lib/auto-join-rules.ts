// SAP pre-configured auto-join engine. Inspects uploaded datasets' column
// headers to (1) recognize standard SAP table extracts by their field
// signatures, (2) match them against pre-configured procurement join rules
// (PO header→item, invoice→PO, fact→dimension), and (3) fall back to generic
// foreign-key name matching for non-SAP CSVs (fact_invoices + dim_vendor).
//
// Table signatures and key fields follow the project's SAP extraction field
// mapping workbook (Updated_sap_field_mapping_spend_analytics.xlsx): e.g.
// EKPO carries EBELN/EBELP/MATKL/NETWR, LFA1 carries LIFNR/NAME1. Note that
// mapping's RSEG extract has no GJAHR column — composite rules therefore
// tolerate missing key parts by joining on the parts both sides carry
// (downgrading confidence to 'medium').

import type { Dataset } from "@/context/DatasetsContext";
import { findColumn, normalizeKey } from "@/lib/dataset-rows";

// ---------------------------------------------------------------------------
// SAP table signatures
// ---------------------------------------------------------------------------

export interface SapTableSignature {
  table: string;
  description: string;
  /** A dataset matches when EVERY one of these columns is present. */
  requiredColumns: string[];
}

export const SAP_TABLE_SIGNATURES: SapTableSignature[] = [
  { table: "EKKO", description: "PO Header", requiredColumns: ["EBELN", "BUKRS", "LIFNR", "BEDAT"] },
  { table: "EKPO", description: "PO Item", requiredColumns: ["EBELN", "EBELP", "MATKL", "NETWR"] },
  { table: "EKKN", description: "PO Account Assignment", requiredColumns: ["EBELN", "EBELP", "ZEKKN", "KOSTL"] },
  { table: "RBKP", description: "Invoice Header", requiredColumns: ["BELNR", "GJAHR", "LIFNR", "RMWWR"] },
  { table: "RSEG", description: "Invoice Item", requiredColumns: ["BELNR", "EBELN", "WRBTR"] },
  { table: "LFA1", description: "Vendor Master", requiredColumns: ["LIFNR", "NAME1"] },
  { table: "T023T", description: "Material Groups", requiredColumns: ["MATKL", "WGBEZ"] },
  { table: "T001", description: "Company Codes", requiredColumns: ["BUKRS", "BUTXT"] },
  { table: "T001W", description: "Plants", requiredColumns: ["WERKS", "NAME1"] },
];

/**
 * Identify which SAP table a dataset looks like. When several signatures
 * match (e.g. an already-joined extract), the most specific one — most
 * required columns — wins.
 */
export function detectSapTable(dataset: Dataset): SapTableSignature | null {
  const normalized = new Set(dataset.columns.map((c) => normalizeKey(c.id)));
  let best: SapTableSignature | null = null;
  for (const signature of SAP_TABLE_SIGNATURES) {
    const matches = signature.requiredColumns.every((col) => normalized.has(normalizeKey(col)));
    if (matches && (!best || signature.requiredColumns.length > best.requiredColumns.length)) {
      best = signature;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Pre-configured preset join rules (SAP table pairs, fact side on the left)
// ---------------------------------------------------------------------------

interface SapPresetRule {
  name: string;
  leftTable: string;
  rightTable: string;
  /** [leftColumn, rightColumn] pairs; composites list several. */
  keyPairs: [string, string][];
}

const SAP_PRESET_RULES: SapPresetRule[] = [
  { name: "PO Items + PO Account Assignment", leftTable: "EKPO", rightTable: "EKKN", keyPairs: [["EBELN", "EBELN"], ["EBELP", "EBELP"]] },
  { name: "Invoice Items + PO Items", leftTable: "RSEG", rightTable: "EKPO", keyPairs: [["EBELN", "EBELN"], ["EBELP", "EBELP"]] },
  { name: "Invoice Headers + Invoice Items", leftTable: "RBKP", rightTable: "RSEG", keyPairs: [["BELNR", "BELNR"], ["GJAHR", "GJAHR"]] },
  { name: "PO Headers + PO Items", leftTable: "EKKO", rightTable: "EKPO", keyPairs: [["EBELN", "EBELN"]] },
  { name: "PO Headers + Vendor Master", leftTable: "EKKO", rightTable: "LFA1", keyPairs: [["LIFNR", "LIFNR"]] },
  { name: "Invoice Headers + Vendor Master", leftTable: "RBKP", rightTable: "LFA1", keyPairs: [["LIFNR", "LIFNR"]] },
  { name: "PO Items + Material Groups", leftTable: "EKPO", rightTable: "T023T", keyPairs: [["MATKL", "MATKL"]] },
  { name: "Invoice Items + Material Groups", leftTable: "RSEG", rightTable: "T023T", keyPairs: [["MATKL", "MATKL"]] },
  { name: "PO Items + Plants", leftTable: "EKPO", rightTable: "T001W", keyPairs: [["WERKS", "WERKS"]] },
  { name: "Invoice Items + Plants", leftTable: "RSEG", rightTable: "T001W", keyPairs: [["WERKS", "WERKS"]] },
  { name: "PO Headers + Company Codes", leftTable: "EKKO", rightTable: "T001", keyPairs: [["BUKRS", "BUKRS"]] },
];

// ---------------------------------------------------------------------------
// Generic procurement foreign-key aliases (non-SAP CSVs)
// ---------------------------------------------------------------------------

const VENDOR_KEYS = ["LIFNR", "vendor_id", "supplier_id", "vendorId", "supplierId"];
const VENDOR_NAMES = ["NAME1", "vendor_name", "supplier_name", "vendorName", "supplierName"];
const CATEGORY_KEYS = ["MATKL", "category_id", "category_code", "categoryId", "categoryCode"];
const CATEGORY_NAMES = ["WGBEZ", "category_name", "categoryName"];
const PLANT_KEYS = ["WERKS", "plant_id", "plant_code", "plantId", "plantCode"];
const PLANT_NAMES = ["plant_name", "plantName", "NAME1"];
/** A dataset with one of these is treated as transactional (fact/line-item). */
const VALUE_COLUMNS = [
  "NETWR", "WRBTR", "RMWWR", "DMBTR",
  "invoice_value_inr", "net_value_inr", "amount", "value", "spend", "total_spend", "totalSpend",
];

interface GenericDimensionRule {
  name: string;
  keyAliases: string[];
  /** Right side must carry one of these to qualify as the dimension/master. */
  dimensionNameAliases: string[];
}

const GENERIC_DIMENSION_RULES: GenericDimensionRule[] = [
  { name: "Transactions + Vendor Master", keyAliases: VENDOR_KEYS, dimensionNameAliases: VENDOR_NAMES },
  { name: "Line Items + Category Master", keyAliases: CATEGORY_KEYS, dimensionNameAliases: CATEGORY_NAMES },
  { name: "Line Items + Plant Master", keyAliases: PLANT_KEYS, dimensionNameAliases: PLANT_NAMES },
];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export interface AutoJoinSuggestion {
  confidence: "high" | "medium";
  presetName: string;
  /** First key column per side (full composite in leftKeys/rightKeys). */
  leftKey: string;
  rightKey: string;
  leftKeys: string[];
  rightKeys: string[];
  joinType: "left";
  /** Human explanation, e.g. "SAP EKPO (PO Item) + T023T (Material Groups)". */
  reason: string;
}

function buildSuggestion(
  confidence: "high" | "medium",
  presetName: string,
  leftKeys: string[],
  rightKeys: string[],
  reason: string
): AutoJoinSuggestion {
  return {
    confidence,
    presetName,
    leftKey: leftKeys[0],
    rightKey: rightKeys[0],
    leftKeys,
    rightKeys,
    joinType: "left",
    reason,
  };
}

function trySapRules(left: Dataset, right: Dataset): AutoJoinSuggestion | null {
  const leftTable = detectSapTable(left);
  const rightTable = detectSapTable(right);
  if (!leftTable || !rightTable) return null;

  for (const rule of SAP_PRESET_RULES) {
    if (rule.leftTable !== leftTable.table || rule.rightTable !== rightTable.table) continue;

    // Resolve each rule key against the actual (case-insensitive) column ids;
    // tolerate missing composite parts (e.g. this project's RSEG extract has
    // no GJAHR) by joining on the parts both sides carry.
    const leftKeys: string[] = [];
    const rightKeys: string[] = [];
    for (const [leftCol, rightCol] of rule.keyPairs) {
      const l = findColumn(left, [leftCol]);
      const r = findColumn(right, [rightCol]);
      if (l && r) {
        leftKeys.push(l);
        rightKeys.push(r);
      }
    }
    if (leftKeys.length === 0) continue;

    const complete = leftKeys.length === rule.keyPairs.length;
    const reason = `SAP ${leftTable.table} (${leftTable.description}) + ${rightTable.table} (${rightTable.description})${
      complete ? "" : " — partial key match"
    }`;
    return buildSuggestion(complete ? "high" : "medium", rule.name, leftKeys, rightKeys, reason);
  }
  return null;
}

function tryGenericDimensionRules(left: Dataset, right: Dataset): AutoJoinSuggestion | null {
  // Left must look transactional; right must look like a master/dimension
  // (has the descriptive name column, carries no spend measure of its own).
  const leftIsTransactional = findColumn(left, VALUE_COLUMNS) !== null;
  const rightHasValue = findColumn(right, VALUE_COLUMNS) !== null;
  if (!leftIsTransactional || rightHasValue) return null;

  for (const rule of GENERIC_DIMENSION_RULES) {
    const leftKey = findColumn(left, rule.keyAliases);
    const rightKey = findColumn(right, rule.keyAliases);
    const rightName = findColumn(right, rule.dimensionNameAliases);
    if (!leftKey || !rightKey || !rightName) continue;
    return buildSuggestion(
      "high",
      rule.name,
      [leftKey],
      [rightKey],
      `Foreign key ${leftKey} → ${rightKey}; dimension name column "${rightName}"`
    );
  }
  return null;
}

function trySharedIdFallback(left: Dataset, right: Dataset): AutoJoinSuggestion | null {
  const rightByNorm = new Map(right.columns.map((c) => [normalizeKey(c.id), c.id]));
  for (const col of left.columns) {
    const norm = normalizeKey(col.id);
    if (!norm.endsWith("id")) continue;
    const rightCol = rightByNorm.get(norm);
    if (rightCol === undefined) continue;
    return buildSuggestion(
      "medium",
      "Shared Key Column",
      [col.id],
      [rightCol],
      `Both datasets carry an id-like column "${col.id}"`
    );
  }
  return null;
}

/**
 * Inspect a (left, right) dataset pair — in that join orientation — and
 * return the best pre-configured or inferred join, or null. High confidence
 * comes from full SAP preset matches and recognized fact→dimension key
 * pairs; medium from partial composite matches and bare shared id columns.
 */
export function detectAutoJoin(leftDataset: Dataset, rightDataset: Dataset): AutoJoinSuggestion | null {
  return (
    trySapRules(leftDataset, rightDataset) ??
    tryGenericDimensionRules(leftDataset, rightDataset) ??
    trySharedIdFallback(leftDataset, rightDataset)
  );
}

export interface ResolvedAutoJoin {
  left: Dataset;
  right: Dataset;
  suggestion: AutoJoinSuggestion;
}

/**
 * Try both orientations of a dataset pair and return the better suggestion
 * (rules encode the fact/transactional side as left, so usually exactly one
 * orientation matches).
 */
export function resolveAutoJoin(a: Dataset, b: Dataset): ResolvedAutoJoin | null {
  const forward = detectAutoJoin(a, b);
  const backward = detectAutoJoin(b, a);
  const rank = (s: AutoJoinSuggestion | null) => (s === null ? 0 : s.confidence === "high" ? 2 : 1);
  if (rank(forward) >= rank(backward)) {
    return forward ? { left: a, right: b, suggestion: forward } : null;
  }
  return backward ? { left: b, right: a, suggestion: backward } : null;
}

/** All auto-join candidates across the current datasets (non-joined pairs). */
export function suggestAutoJoins(datasets: Dataset[]): ResolvedAutoJoin[] {
  const sources = datasets.filter((d) => !d.isJoined);
  const results: ResolvedAutoJoin[] = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const resolved = resolveAutoJoin(sources[i], sources[j]);
      if (resolved) results.push(resolved);
    }
  }
  // Highest-confidence suggestions first.
  return results.sort(
    (x, y) => Number(y.suggestion.confidence === "high") - Number(x.suggestion.confidence === "high")
  );
}
