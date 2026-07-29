// Query-builder tests. Run with:
//
//   npm test
//
// node:test under tsx — no test framework dependency. The --conditions=react-server
// flag in the npm script lets these import modules marked "server-only".

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuery, MAX_ROWS, QueryValidationError } from "@/lib/server/query-builder";
import { getDataset, listColumns, listDatasets } from "@/lib/server/metadata-registry";
import { COUNT_ALL, type QueryPayload, type QueryResult } from "@/types/data-provider";

/** Collapse whitespace so assertions read against SQL shape, not formatting. */
function flat(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function expectRejected(payload: QueryPayload, fragment: string): QueryValidationError {
  try {
    buildQuery(payload);
  } catch (err) {
    assert.ok(
      err instanceof QueryValidationError,
      `expected QueryValidationError, got ${String(err)}`
    );
    assert.equal(err.status, 400, "validation errors must map to HTTP 400");
    assert.ok(
      err.message.includes(fragment),
      `message ${JSON.stringify(err.message)} should mention ${JSON.stringify(fragment)}`
    );
    return err;
  }
  throw new Error(`expected buildQuery to reject with ${JSON.stringify(fragment)}`);
}

// ---------------------------------------------------------------------------
// (a) Top 10 Spend by Category — the canonical widget payload
// ---------------------------------------------------------------------------

describe("Top 10 Spend by Category", () => {
  // Exactly what lib/widget-query.buildWidgetPayload emits for a bar widget.
  const payload: QueryPayload = {
    datasetId: "fact_po_items",
    dimensions: ["category_l1_name"],
    measures: [
      { field: "net_order_value_inr", aggregation: "sum", alias: "value" },
      { field: COUNT_ALL, aggregation: "count", alias: "count" },
    ],
    filters: [],
    sort: { field: "value", direction: "desc" },
    limit: 10,
  };

  const built = buildQuery(payload);
  const sql = flat(built.sql);

  it("caps rows with TOP (10)", () => {
    assert.ok(sql.startsWith("SELECT TOP (10)"), sql);
    assert.equal(built.limit, 10);
  });

  it("selects the qualified dimension and both aggregates, aliased", () => {
    assert.ok(
      sql.includes("dim_material_category.category_l1_name AS [category_l1_name]"),
      sql
    );
    assert.ok(sql.includes("SUM(fact_po_items.net_order_value_inr) AS [value]"), sql);
    assert.ok(sql.includes("COUNT(*) AS [count]"), sql);
  });

  it("reads FROM the fact and LEFT JOINs only the dimension it needs", () => {
    assert.ok(sql.includes("FROM dbo.fact_po_items"), sql);
    assert.ok(
      sql.includes(
        "LEFT JOIN dbo.dim_material_category ON fact_po_items.category_key = dim_material_category.category_key"
      ),
      sql
    );
    // No dimension was requested from these, so they must not be joined.
    assert.ok(!sql.includes("dim_vendor"), "vendor join should not appear");
    assert.ok(!sql.includes("dim_plant"), "plant join should not appear");
    assert.ok(!sql.includes("dim_date"), "date join should not appear");
  });

  it("groups by the dimension and orders by the measure alias", () => {
    assert.ok(sql.includes("GROUP BY dim_material_category.category_l1_name"), sql);
    assert.ok(sql.includes("ORDER BY [value] DESC"), sql);
  });

  it("emits no WHERE clause and no parameters for an empty filter list", () => {
    assert.ok(!sql.includes("WHERE"), sql);
    assert.deepEqual(built.parameters, []);
  });

  it("builds a matching pre-grouping COUNT for totalMatchingRows", () => {
    const countSql = flat(built.countSql);
    assert.ok(countSql.includes("COUNT_BIG(*) AS [totalMatchingRows]"), countSql);
    assert.ok(countSql.includes("FROM dbo.fact_po_items"), countSql);
    // The count has no filters, so it needs no joins at all.
    assert.ok(!countSql.includes("LEFT JOIN"), countSql);
    assert.ok(!countSql.includes("GROUP BY"), countSql);
  });

  it("reports result keys in SELECT order", () => {
    assert.deepEqual(built.columns, ["category_l1_name", "value", "count"]);
  });
});

// ---------------------------------------------------------------------------
// Parameterization and joins
// ---------------------------------------------------------------------------

describe("filters", () => {
  it("binds values as @p0, @p1 and never inlines them", () => {
    const built = buildQuery({
      datasetId: "fact_po_items",
      dimensions: ["vendor_name"],
      measures: [{ field: "net_order_value_inr", aggregation: "sum", alias: "value" }],
      filters: [
        { field: "plant_name", operator: "eq", value: "Hindustan Zinc" },
        { field: "net_order_value_inr", operator: "gte", value: 100000 },
      ],
    });
    const sql = flat(built.sql);
    assert.ok(sql.includes("WHERE dim_plant.plant_name = @p0"), sql);
    assert.ok(sql.includes("AND fact_po_items.net_order_value_inr >= @p1"), sql);
    assert.ok(!sql.includes("Hindustan Zinc"), "filter value must not appear in SQL text");
    assert.deepEqual(built.parameters, [
      { name: "p0", value: "Hindustan Zinc" },
      { name: "p1", value: 100000 },
    ]);
  });

  it("expands `in` to one parameter per element", () => {
    const built = buildQuery({
      datasetId: "fact_po_items",
      dimensions: ["vendor_name"],
      measures: [{ field: COUNT_ALL, aggregation: "count", alias: "count" }],
      filters: [{ field: "currency_code", operator: "in", value: ["INR", "USD", "EUR"] }],
    });
    assert.ok(
      flat(built.sql).includes("fact_po_items.currency_code IN (@p0, @p1, @p2)"),
      flat(built.sql)
    );
    assert.equal(built.parameters.length, 3);
  });

  it("maps every allowed operator to its T-SQL form", () => {
    const expected: Record<string, string> = {
      eq: "=",
      neq: "<>",
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
    };
    for (const [operator, sqlOperator] of Object.entries(expected)) {
      const built = buildQuery({
        datasetId: "fact_po_items",
        measures: [{ field: COUNT_ALL, aggregation: "count", alias: "count" }],
        filters: [
          {
            field: "net_order_value_inr",
            operator: operator as "eq",
            value: 1,
          },
        ],
      });
      assert.ok(
        flat(built.sql).includes(`fact_po_items.net_order_value_inr ${sqlOperator} @p0`),
        `${operator} should render as ${sqlOperator}: ${flat(built.sql)}`
      );
    }
  });

  it("joins a dimension needed only by a filter, and only in the count when filtered", () => {
    const built = buildQuery({
      datasetId: "fact_po_items",
      measures: [{ field: "net_order_value_inr", aggregation: "sum", alias: "value" }],
      filters: [{ field: "category_l1_name", operator: "eq", value: "Raw Materials" }],
    });
    assert.ok(flat(built.sql).includes("LEFT JOIN dbo.dim_material_category"), flat(built.sql));
    assert.ok(flat(built.countSql).includes("LEFT JOIN dbo.dim_material_category"), flat(built.countSql));
  });
});

// ---------------------------------------------------------------------------
// (b) Rejections
// ---------------------------------------------------------------------------

describe("rejects unsafe or unknown input", () => {
  it("rejects an unknown datasetId", () => {
    expectRejected({ datasetId: "sys.objects", measures: [] }, 'Unknown datasetId "sys.objects"');
  });

  it("rejects an unknown dimension", () => {
    expectRejected(
      { datasetId: "fact_po_items", dimensions: ["password_hash"] },
      'Unknown field "password_hash"'
    );
  });

  it("rejects an unknown measure field", () => {
    expectRejected(
      {
        datasetId: "fact_po_items",
        measures: [{ field: "1=1", aggregation: "sum", alias: "value" }],
      },
      'Unknown field "1=1"'
    );
  });

  it("rejects an unknown filter field", () => {
    expectRejected(
      {
        datasetId: "fact_po_items",
        measures: [{ field: COUNT_ALL, aggregation: "count", alias: "count" }],
        filters: [{ field: "vendor_name; DROP TABLE dim_vendor", operator: "eq", value: "x" }],
      },
      "Unknown field"
    );
  });

  it("rejects an unmapped operator", () => {
    expectRejected(
      {
        datasetId: "fact_po_items",
        measures: [{ field: COUNT_ALL, aggregation: "count", alias: "count" }],
        filters: [
          { field: "vendor_name", operator: "like" as unknown as "eq", value: "%x%" },
        ],
      },
      'Unsupported operator "like"'
    );
  });

  it("rejects an unmapped aggregation", () => {
    expectRejected(
      {
        datasetId: "fact_po_items",
        measures: [
          { field: "net_order_value_inr", aggregation: "median" as unknown as "sum", alias: "value" },
        ],
      },
      'Unsupported aggregation "median"'
    );
  });

  it("rejects a measure alias that is not a plain identifier", () => {
    expectRejected(
      {
        datasetId: "fact_po_items",
        measures: [{ field: "net_order_value_inr", aggregation: "sum", alias: "value] AS x, (SELECT 1)" }],
      },
      "Measure alias must match"
    );
  });

  it("rejects duplicate measure aliases", () => {
    expectRejected(
      {
        datasetId: "fact_po_items",
        measures: [
          { field: "net_order_value_inr", aggregation: "sum", alias: "value" },
          { field: "po_quantity", aggregation: "sum", alias: "value" },
        ],
      },
      'Duplicate measure alias "value"'
    );
  });

  it("rejects summing a non-numeric column", () => {
    expectRejected(
      {
        datasetId: "fact_po_items",
        measures: [{ field: "vendor_name", aggregation: "sum", alias: "value" }],
      },
      "not a measure"
    );
  });

  it("rejects sorting by something that is neither measure nor dimension", () => {
    expectRejected(
      {
        datasetId: "fact_po_items",
        dimensions: ["vendor_name"],
        measures: [{ field: COUNT_ALL, aggregation: "count", alias: "count" }],
        sort: { field: "net_order_value_inr", direction: "desc" },
      },
      "Cannot sort by"
    );
  });

  it("rejects a limit above the hard cap instead of silently clamping", () => {
    expectRejected(
      {
        datasetId: "fact_po_items",
        measures: [{ field: COUNT_ALL, aggregation: "count", alias: "count" }],
        limit: MAX_ROWS + 1,
      },
      `exceeds the maximum of ${MAX_ROWS}`
    );
  });

  it("rejects an empty `in` list", () => {
    expectRejected(
      {
        datasetId: "fact_po_items",
        measures: [{ field: COUNT_ALL, aggregation: "count", alias: "count" }],
        filters: [{ field: "currency_code", operator: "in", value: [] }],
      },
      "non-empty array"
    );
  });

  it("rejects a query with neither dimensions nor measures", () => {
    expectRejected({ datasetId: "fact_po_items" }, "at least one dimension or measure");
  });

  it("applies the hard row cap when no limit is given", () => {
    const built = buildQuery({
      datasetId: "fact_po_items",
      dimensions: ["vendor_name"],
      measures: [{ field: COUNT_ALL, aggregation: "count", alias: "count" }],
    });
    assert.equal(built.limit, MAX_ROWS);
    assert.ok(flat(built.sql).startsWith(`SELECT TOP (${MAX_ROWS})`), flat(built.sql));
  });
});

// ---------------------------------------------------------------------------
// Time grain
// ---------------------------------------------------------------------------

describe("time grain", () => {
  it("groups a date dimension by month and orders chronologically, not by month name", () => {
    const built = buildQuery({
      datasetId: "fact_po_items",
      dimensions: ["po_date"],
      measures: [{ field: "net_order_value_inr", aggregation: "sum", alias: "value" }],
      timeGrain: "month",
      sort: { field: "po_date", direction: "desc" },
      limit: 12,
    });
    const sql = flat(built.sql);
    assert.ok(sql.includes("LEFT JOIN dbo.dim_date ON fact_po_items.po_date_key = dim_date.date_key"), sql);
    // Label matches ClientCsvAdapter's "2025-03".
    assert.ok(sql.includes("CONCAT(dim_date.[year], '-', RIGHT(CONCAT('0', dim_date.[month]), 2)) AS [po_date]"), sql);
    assert.ok(sql.includes("GROUP BY dim_date.[year], dim_date.[month]"), sql);
    assert.ok(sql.includes("ORDER BY dim_date.[year] DESC, dim_date.[month] DESC"), sql);
    assert.ok(!sql.includes("ORDER BY dim_date.month_name"), "month_name would sort alphabetically");
  });

  it("groups by calendar quarter", () => {
    const built = buildQuery({
      datasetId: "fact_po_items",
      dimensions: ["po_date"],
      measures: [{ field: "net_order_value_inr", aggregation: "sum", alias: "value" }],
      timeGrain: "quarter",
    });
    const sql = flat(built.sql);
    assert.ok(sql.includes("CONCAT(dim_date.[year], '-Q', dim_date.[quarter]) AS [po_date]"), sql);
    assert.ok(sql.includes("GROUP BY dim_date.[year], dim_date.[quarter]"), sql);
  });

  it("groups the year grain on fiscal_year", () => {
    const built = buildQuery({
      datasetId: "fact_invoices",
      dimensions: ["posting_date"],
      measures: [{ field: "gross_amount_inr", aggregation: "sum", alias: "value" }],
      timeGrain: "year",
    });
    const sql = flat(built.sql);
    assert.ok(sql.includes("GROUP BY dim_date.fiscal_year"), sql);
    assert.ok(sql.includes("'FY'"), sql);
  });

  it("adds the dataset's own date bucket when a grain is set with no date dimension", () => {
    const built = buildQuery({
      datasetId: "fact_invoices",
      dimensions: ["vendor_name"],
      measures: [{ field: "gross_amount_inr", aggregation: "sum", alias: "value" }],
      timeGrain: "month",
    });
    const sql = flat(built.sql);
    assert.deepEqual(built.columns, ["vendor_name", "posting_date", "value"]);
    assert.ok(sql.includes("LEFT JOIN dbo.dim_date ON fact_invoices.posting_date_key = dim_date.date_key"), sql);
    assert.ok(sql.includes("GROUP BY dim_vendor.vendor_name, dim_date.[year], dim_date.[month]"), sql);
  });

  it("aliases the second dim_date role so both dates can be queried at once", () => {
    const built = buildQuery({
      datasetId: "fact_invoices",
      dimensions: ["invoice_date"],
      measures: [{ field: COUNT_ALL, aggregation: "count", alias: "count" }],
    });
    const sql = flat(built.sql);
    assert.ok(
      sql.includes(
        "LEFT JOIN dbo.dim_date AS dim_invoice_date ON fact_invoices.invoice_date_key = dim_invoice_date.date_key"
      ),
      sql
    );
    assert.ok(sql.includes("dim_invoice_date.[year]"), sql);
  });
});

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

describe("aggregations", () => {
  it("divides avg by every row in the group, matching ClientCsvAdapter", () => {
    const built = buildQuery({
      datasetId: "fact_po_items",
      dimensions: ["vendor_name"],
      measures: [{ field: "unit_price", aggregation: "avg", alias: "value" }],
    });
    const sql = flat(built.sql);
    assert.ok(
      sql.includes("CAST(SUM(fact_po_items.unit_price) AS DECIMAL(38, 6)) / NULLIF(COUNT(*), 0) AS [value]"),
      sql
    );
    assert.ok(!/\bAVG\(/.test(sql), "SQL AVG() would ignore NULL rows and diverge from the CSV provider");
  });

  it("renders distinct as COUNT(DISTINCT ...)", () => {
    const built = buildQuery({
      datasetId: "fact_po_items",
      dimensions: ["category_l1_name"],
      measures: [{ field: "vendor_id", aggregation: "distinct", alias: "value" }],
    });
    assert.ok(flat(built.sql).includes("COUNT(DISTINCT dim_vendor.vendor_id) AS [value]"), flat(built.sql));
  });

  it("rejects a non-count aggregation on the COUNT_ALL sentinel", () => {
    expectRejected(
      {
        datasetId: "fact_po_items",
        measures: [{ field: COUNT_ALL, aggregation: "sum", alias: "value" }],
      },
      "only \"count\" can aggregate every row"
    );
  });

  it("emits no GROUP BY for a KPI-style payload with no dimensions", () => {
    const built = buildQuery({
      datasetId: "fact_invoices",
      measures: [
        { field: "gross_amount_inr", aggregation: "sum", alias: "value" },
        { field: COUNT_ALL, aggregation: "count", alias: "count" },
      ],
    });
    const sql = flat(built.sql);
    assert.ok(!sql.includes("GROUP BY"), sql);
    assert.ok(sql.includes("SUM(fact_invoices.gross_amount_inr) AS [value]"), sql);
    assert.deepEqual(built.columns, ["value", "count"]);
  });
});

// ---------------------------------------------------------------------------
// (c) The registry and the IDataProvider contract
// ---------------------------------------------------------------------------

describe("metadata registry", () => {
  it("defines both fact datasets with the fields the dashboards use", () => {
    assert.deepEqual(
      listDatasets().map((d) => d.id).sort(),
      ["fact_invoices", "fact_po_items"]
    );
    const required: Record<string, string[]> = {
      fact_po_items: ["vendor_name", "category_l1_name", "plant_name", "net_order_value_inr", "po_date"],
      fact_invoices: ["vendor_name", "category_l1_name", "plant_name", "gross_amount_inr", "posting_date"],
    };
    for (const [datasetId, fields] of Object.entries(required)) {
      const dataset = getDataset(datasetId);
      assert.ok(dataset, `${datasetId} must exist`);
      const ids = new Set(listColumns(dataset).map((c) => c.id));
      for (const field of fields) {
        assert.ok(ids.has(field), `${datasetId} must define ${field}`);
      }
    }
  });

  it("fully qualifies every sqlExpression and points requiresJoin at an allowed join", () => {
    for (const dataset of listDatasets()) {
      for (const column of listColumns(dataset)) {
        assert.match(
          column.sqlExpression,
          /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/,
          `${dataset.id}.${column.id} must be table-qualified`
        );
        assert.equal(
          column.sqlExpression.split(".")[0],
          column.table,
          `${dataset.id}.${column.id} expression must be prefixed with its own table`
        );
        if (column.requiresJoin) {
          assert.ok(
            column.requiresJoin in dataset.allowedJoins,
            `${dataset.id}.${column.id} requires join "${column.requiresJoin}" which is not allowed`
          );
          assert.equal(
            column.table,
            column.requiresJoin,
            `${dataset.id}.${column.id} should read through its own join alias`
          );
        } else {
          assert.equal(
            column.table,
            dataset.primaryTable,
            `${dataset.id}.${column.id} has no requiresJoin so it must live on the fact`
          );
        }
      }
      // Every join's right-hand side must reference the alias being joined.
      for (const [alias, join] of Object.entries(dataset.allowedJoins)) {
        assert.equal(join.on[1].split(".")[0], alias, `join ${alias} must key off its own alias`);
        assert.equal(
          join.on[0].split(".")[0],
          dataset.primaryTable,
          `join ${alias} must hang off ${dataset.primaryTable}`
        );
      }
    }
  });
});

describe("QueryResult contract", () => {
  it("names result keys so rows are addressable by dimension id and measure alias", () => {
    const built = buildQuery({
      datasetId: "fact_po_items",
      dimensions: ["category_l1_name"],
      measures: [
        { field: "net_order_value_inr", aggregation: "sum", alias: "value" },
        { field: COUNT_ALL, aggregation: "count", alias: "count" },
      ],
      sort: { field: "value", direction: "desc" },
      limit: 10,
    });

    // A row as the driver would return it, keyed by the aliases above.
    const row: Record<string, unknown> = { category_l1_name: "Raw Materials", value: 12345.67, count: 42 };
    for (const key of built.columns) {
      assert.ok(key in row, `result row must carry "${key}"`);
    }

    // The shape the route wraps in { success, data } and IDataProvider consumes.
    const result: QueryResult = {
      rows: [row],
      totalMatchingRows: 10000,
      executionTimeMs: 12.34,
    };
    assert.equal(result.rows.length, 1);
    assert.equal(typeof result.totalMatchingRows, "number");
    assert.equal(typeof result.executionTimeMs, "number");
    assert.equal(result.rows[0].category_l1_name, "Raw Materials");
  });
});
