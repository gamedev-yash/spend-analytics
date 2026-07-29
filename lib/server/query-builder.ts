// Turns a QueryPayload into parameterized T-SQL.
//
// The security model is an allowlist, not escaping: identifiers only ever come
// from lib/server/metadata-registry (literals in our own source), and every
// client-supplied *value* becomes a bound parameter (@p0, @p1, …). A field or
// operator the registry does not define is rejected as a 400 rather than
// interpolated, so there is no code path where request text reaches the SQL
// text. The identifier assertions below are a second line of defence against a
// malformed registry entry.

import {
  getColumn,
  getDataset,
  DB_SCHEMA,
  type ColumnDefinition,
  type DatasetDefinition,
} from "@/lib/server/metadata-registry";
import { COUNT_ALL, type QueryOperator, type QueryPayload, type TimeGrain } from "@/types/data-provider";

/** Hard ceiling on returned rows, whatever the payload asks for. */
export const MAX_ROWS = 1000;

/** Per-statement execution budget. */
export const STATEMENT_TIMEOUT_MS = 10_000;

/** T-SQL allows 2100 parameters per batch; stay clear of the edge. */
const MAX_PARAMETERS = 2000;

/** The only operators that reach SQL. Anything else is a 400. */
const OPERATORS: Record<QueryOperator, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  in: "IN",
};

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const QUALIFIED_COLUMN = /^[A-Za-z_][A-Za-z0-9_]{0,127}\.[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** A rejected payload — the route turns this into a 400. */
export class QueryValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "QueryValidationError";
  }
}

export interface QueryParameter {
  /** Placeholder name without the leading @, e.g. "p0". */
  name: string;
  value: unknown;
}

export interface BuiltQuery {
  /** The grouped SELECT. */
  sql: string;
  /**
   * COUNT over the same FROM/WHERE, before grouping — QueryResult's
   * totalMatchingRows. It cannot be derived from the grouped result because
   * TOP (n) returns only part of it.
   */
  countSql: string;
  parameters: QueryParameter[];
  /** Result keys in SELECT order: dimension ids, then measure aliases. */
  columns: string[];
  /** Row cap actually applied. */
  limit: number;
}

// ---------------------------------------------------------------------------
// Assertions on registry-supplied identifiers
// ---------------------------------------------------------------------------

function assertQualified(expression: string, context: string): string {
  if (!QUALIFIED_COLUMN.test(expression)) {
    throw new Error(`metadata-registry: ${context} is not a qualified column ("${expression}")`);
  }
  return expression;
}

function assertIdentifier(value: string, context: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`metadata-registry: ${context} is not a safe identifier ("${value}")`);
  }
  return value;
}

/** Bracket-quoted result alias. Validated first, so the brackets can't be escaped. */
function quoteAlias(alias: string): string {
  return `[${alias}]`;
}

// ---------------------------------------------------------------------------
// Time grain
// ---------------------------------------------------------------------------

interface GroupingTerm {
  /** Key this term lands on in each result row. */
  field: string;
  /** SELECT expression producing the value. */
  selectSql: string;
  /** GROUP BY and ORDER BY terms — for a date grain, the underlying integers. */
  keySql: string[];
  /** Join alias this term needs, if any. */
  requiresJoin?: string;
}

/**
 * Grouping term for a date column at the given grain.
 *
 * Grouping and ordering use dim_date's integer columns while the SELECT builds
 * the label from them: ordering by month_name would sort April before January.
 * Labels match ClientCsvAdapter's dateBucket exactly.
 */
function timeGrainTerm(column: ColumnDefinition, grain: TimeGrain): GroupingTerm {
  const alias = assertIdentifier(column.table, `table for column "${column.id}"`);
  const year = `${alias}.[year]`;
  const fiscalYear = `${alias}.fiscal_year`;

  if (grain === "quarter") {
    return {
      field: column.id,
      selectSql: `CONCAT(${year}, '-Q', ${alias}.[quarter])`,
      keySql: [year, `${alias}.[quarter]`],
      requiresJoin: column.requiresJoin,
    };
  }
  if (grain === "year") {
    // Indian fiscal year: FY2025-26 covers April 2025 to March 2026.
    return {
      field: column.id,
      selectSql: `CONCAT('FY', ${fiscalYear}, '-', RIGHT(CONCAT('0', (${fiscalYear} + 1) % 100), 2))`,
      keySql: [fiscalYear],
      requiresJoin: column.requiresJoin,
    };
  }
  return {
    field: column.id,
    selectSql: `CONCAT(${year}, '-', RIGHT(CONCAT('0', ${alias}.[month]), 2))`,
    keySql: [year, `${alias}.[month]`],
    requiresJoin: column.requiresJoin,
  };
}

/**
 * The date column a bare `timeGrain` applies to: whichever one reads through
 * the join anchored on the dataset's defaultDateKey.
 */
function defaultDateColumn(dataset: DatasetDefinition): ColumnDefinition {
  const alias = Object.keys(dataset.allowedJoins).find(
    (key) => dataset.allowedJoins[key].on[0] === dataset.defaultDateKey
  );
  const column = alias
    ? Object.values(dataset.columns).find((c) => c.type === "date" && c.table === alias)
    : undefined;
  if (!column) {
    throw new QueryValidationError(
      `Dataset "${dataset.id}" has no date column for timeGrain grouping.`
    );
  }
  return column;
}

// ---------------------------------------------------------------------------
// Measures
// ---------------------------------------------------------------------------

function aggregateSql(dataset: DatasetDefinition, field: string, aggregation: string, alias: string): string {
  if (field === COUNT_ALL) {
    if (aggregation !== "count") {
      throw new QueryValidationError(
        `Measure "${alias}" uses "${aggregation}" on "${COUNT_ALL}"; only "count" can aggregate every row.`
      );
    }
    return "COUNT(*)";
  }

  const column = requireColumn(dataset, field, `measure "${alias}"`);
  const expression = assertQualified(column.sqlExpression, `column "${column.id}"`);

  switch (aggregation) {
    case "sum":
      requireNumeric(column, aggregation);
      return `SUM(${expression})`;
    case "avg":
      requireNumeric(column, aggregation);
      // Divided by every row in the group rather than the non-NULL ones, so the
      // number matches ClientCsvAdapter. SQL's AVG() would skip NULLs.
      return `CAST(SUM(${expression}) AS DECIMAL(38, 6)) / NULLIF(COUNT(*), 0)`;
    case "count":
      return `COUNT(${expression})`;
    case "distinct":
      return `COUNT(DISTINCT ${expression})`;
    default:
      throw new QueryValidationError(
        `Unsupported aggregation "${aggregation}" for measure "${alias}". Use sum, avg, count, or distinct.`
      );
  }
}

function requireNumeric(column: ColumnDefinition, aggregation: string): void {
  if (column.type !== "number") {
    throw new QueryValidationError(
      `Cannot ${aggregation} "${column.id}" — it is a ${column.type} column, not a measure.`
    );
  }
}

function requireColumn(dataset: DatasetDefinition, field: string, context: string): ColumnDefinition {
  const column = getColumn(dataset, field);
  if (!column) {
    throw new QueryValidationError(
      `Unknown field "${field}" for ${context} on dataset "${dataset.id}".`
    );
  }
  return column;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildQuery(payload: QueryPayload): BuiltQuery {
  const dataset = getDataset(payload.datasetId);
  if (!dataset) {
    throw new QueryValidationError(`Unknown datasetId "${payload.datasetId}".`);
  }

  const parameters: QueryParameter[] = [];
  const bind = (value: unknown): string => {
    if (parameters.length >= MAX_PARAMETERS) {
      throw new QueryValidationError(`Too many filter values (limit ${MAX_PARAMETERS}).`);
    }
    const name = `p${parameters.length}`;
    parameters.push({ name, value });
    return `@${name}`;
  };

  // --- dimensions ---------------------------------------------------------
  const grain = payload.timeGrain;
  const dimensions = payload.dimensions ?? [];
  const grouping: GroupingTerm[] = dimensions.map((field) => {
    const column = requireColumn(dataset, field, "dimension");
    if (column.type === "date") return timeGrainTerm(column, grain ?? "month");
    return {
      field: column.id,
      selectSql: assertQualified(column.sqlExpression, `column "${column.id}"`),
      keySql: [assertQualified(column.sqlExpression, `column "${column.id}"`)],
      requiresJoin: column.requiresJoin,
    };
  });

  // A grain with no date dimension listed means "also bucket by time".
  if (grain && !grouping.some((term) => dataset.columns[term.field]?.type === "date")) {
    grouping.push(timeGrainTerm(defaultDateColumn(dataset), grain));
  }

  // --- measures -----------------------------------------------------------
  const measures = payload.measures ?? [];
  const seenAliases = new Set<string>();
  const measureSelects = measures.map((measure) => {
    const alias = assertClientAlias(measure.alias);
    if (seenAliases.has(alias)) {
      throw new QueryValidationError(`Duplicate measure alias "${alias}".`);
    }
    seenAliases.add(alias);
    return `${aggregateSql(dataset, measure.field, measure.aggregation, alias)} AS ${quoteAlias(alias)}`;
  });

  if (grouping.length === 0 && measureSelects.length === 0) {
    throw new QueryValidationError("A query needs at least one dimension or measure.");
  }

  // --- filters ------------------------------------------------------------
  const filters = payload.filters ?? [];
  const joinsNeededByFilters = new Set<string>();
  const where: string[] = [];
  for (const filter of filters) {
    const column = requireColumn(dataset, filter.field, "filter");
    const expression = assertQualified(column.sqlExpression, `column "${column.id}"`);
    if (column.requiresJoin) joinsNeededByFilters.add(column.requiresJoin);

    if (!Object.prototype.hasOwnProperty.call(OPERATORS, filter.operator)) {
      throw new QueryValidationError(
        `Unsupported operator "${String(filter.operator)}" on "${filter.field}". Allowed: ${Object.keys(OPERATORS).join(", ")}.`
      );
    }
    const operator = OPERATORS[filter.operator];

    if (filter.operator === "in") {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        throw new QueryValidationError(`Operator "in" on "${filter.field}" needs a non-empty array.`);
      }
      const placeholders = filter.value.map((value) => bind(value));
      where.push(`${expression} IN (${placeholders.join(", ")})`);
    } else {
      if (filter.value === null || filter.value === undefined) {
        throw new QueryValidationError(
          `Operator "${filter.operator}" on "${filter.field}" needs a value; use a dedicated null filter instead.`
        );
      }
      where.push(`${expression} ${operator} ${bind(filter.value)}`);
    }
  }

  // --- joins --------------------------------------------------------------
  const joinsNeeded = new Set<string>(joinsNeededByFilters);
  for (const term of grouping) if (term.requiresJoin) joinsNeeded.add(term.requiresJoin);
  for (const measure of measures) {
    if (measure.field === COUNT_ALL) continue;
    const column = getColumn(dataset, measure.field);
    if (column?.requiresJoin) joinsNeeded.add(column.requiresJoin);
  }

  // --- sort ---------------------------------------------------------------
  const orderBy: string[] = [];
  if (payload.sort) {
    const direction = payload.sort.direction === "desc" ? "DESC" : "ASC";
    if (seenAliases.has(payload.sort.field)) {
      orderBy.push(`${quoteAlias(payload.sort.field)} ${direction}`);
    } else {
      const term = grouping.find((g) => g.field === payload.sort?.field);
      if (!term) {
        throw new QueryValidationError(
          `Cannot sort by "${payload.sort.field}" — it is neither a measure alias nor a grouped dimension.`
        );
      }
      for (const key of term.keySql) orderBy.push(`${key} ${direction}`);
    }
  }

  // --- limit --------------------------------------------------------------
  if (payload.limit !== undefined) {
    if (!Number.isInteger(payload.limit) || payload.limit < 1) {
      throw new QueryValidationError(`limit must be a positive integer, got ${String(payload.limit)}.`);
    }
    if (payload.limit > MAX_ROWS) {
      throw new QueryValidationError(`limit ${payload.limit} exceeds the maximum of ${MAX_ROWS}.`);
    }
  }
  const limit = payload.limit ?? MAX_ROWS;

  // --- assemble -----------------------------------------------------------
  const selects = [
    ...grouping.map((term) => `${term.selectSql} AS ${quoteAlias(term.field)}`),
    ...measureSelects,
  ];
  const fromClause = [
    `FROM ${DB_SCHEMA}.${assertIdentifier(dataset.primaryTable, "primaryTable")}`,
    ...renderJoins(dataset, joinsNeeded),
  ];
  const whereClause = where.length > 0 ? [`WHERE ${where.join("\n  AND ")}`] : [];
  const groupByClause =
    grouping.length > 0 ? [`GROUP BY ${grouping.flatMap((term) => term.keySql).join(", ")}`] : [];
  const orderByClause = orderBy.length > 0 ? [`ORDER BY ${orderBy.join(", ")}`] : [];

  const sql = [
    `SELECT TOP (${limit})`,
    `  ${selects.join(",\n  ")}`,
    ...fromClause,
    ...whereClause,
    ...groupByClause,
    ...orderByClause,
  ].join("\n");

  // The count only needs the joins its own filters reference; LEFT JOINs on
  // unique dimension keys cannot change the row count.
  const countSql = [
    "SELECT COUNT_BIG(*) AS [totalMatchingRows]",
    `FROM ${DB_SCHEMA}.${dataset.primaryTable}`,
    ...renderJoins(dataset, joinsNeededByFilters),
    ...whereClause,
  ].join("\n");

  return {
    sql,
    countSql,
    parameters,
    columns: [...grouping.map((term) => term.field), ...measures.map((measure) => measure.alias)],
    limit,
  };
}

/** LEFT JOINs in registry declaration order, so output is stable. */
function renderJoins(dataset: DatasetDefinition, needed: Set<string>): string[] {
  const clauses: string[] = [];
  for (const alias of Object.keys(dataset.allowedJoins)) {
    if (!needed.has(alias)) continue;
    const join = dataset.allowedJoins[alias];
    assertIdentifier(alias, "join alias");
    assertIdentifier(join.table, `table for join "${alias}"`);
    const [left, right] = join.on;
    assertQualified(left, `join "${alias}" left side`);
    assertQualified(right, `join "${alias}" right side`);
    // An alias is only emitted when it differs from the table, which is how the
    // same dimension serves two roles (dim_date / dim_invoice_date).
    const target =
      alias === join.table
        ? `${DB_SCHEMA}.${join.table}`
        : `${DB_SCHEMA}.${join.table} AS ${alias}`;
    clauses.push(`LEFT JOIN ${target} ON ${left} = ${right}`);
  }
  const unknown = [...needed].filter((alias) => !(alias in dataset.allowedJoins));
  if (unknown.length > 0) {
    throw new QueryValidationError(
      `Dataset "${dataset.id}" does not allow join(s): ${unknown.join(", ")}.`
    );
  }
  return clauses;
}

/** Measure aliases come from the client, so they are validated, not escaped. */
function assertClientAlias(alias: unknown): string {
  if (typeof alias !== "string" || !IDENTIFIER.test(alias)) {
    throw new QueryValidationError(
      `Measure alias must match /^[A-Za-z_][A-Za-z0-9_]*$/, got ${JSON.stringify(alias)}.`
    );
  }
  return alias;
}
