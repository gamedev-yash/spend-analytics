// Coverage for the dimension/measure picker's model
// (lib/generated-dashboard/fields.ts) — the layer both Generate Custom
// Dashboard data sources feed into.
//
// The rules worth pinning down are the ones that involve judgement rather
// than a straight role lookup: which columns get shown where, which are ticked
// on arrival, and what counts as a selection too thin to generate from.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkFieldSelection,
  defaultFieldSelection,
  describeFields,
  projectRows,
} from "@/lib/generated-dashboard/fields";
import type { ColumnProfile, DatasetProfile } from "@/types/dataset-profile";

function column(overrides: Partial<ColumnProfile> & { name: string }): ColumnProfile {
  return {
    position: 0,
    role: "dimension",
    nullCount: 0,
    nullPct: 0,
    isConstant: false,
    distinctCount: 10,
    distinctRatio: 0.1,
    ...overrides,
  };
}

function profile(
  columns: ColumnProfile[],
  candidates: Partial<DatasetProfile["candidates"]> = {}
): DatasetProfile {
  return {
    rowCount: 100,
    columnCount: columns.length,
    sampled: false,
    parseWarnings: [],
    columns,
    candidates: {
      measures: [],
      dimensions: [],
      temporal: [],
      identifiers: [],
      ...candidates,
    },
    shape: { isLongFormat: false, reasoning: "" },
    truncated: false,
  };
}

/** Categorical stats shaped like build-profile's, for the columns that carry them. */
function categorical(values: string[]) {
  return {
    topValues: values.map((value) => ({ value, count: 1, share: 0.01 })),
    tailCount: 0,
    tailShare: 0,
  };
}

describe("describeFields — grouping", () => {
  it("maps each profiled role onto the bucket a person picks fields from", () => {
    const fields = describeFields(
      profile([
        column({ name: "Spend", role: "measure", numeric: numeric() }),
        column({ name: "Category", role: "dimension", categorical: categorical(["A", "B"]) }),
        column({ name: "PO Date", role: "temporal", temporal: temporal() }),
        column({ name: "PO Number", role: "identifier", distinctCount: 100, distinctRatio: 1 }),
        column({ name: "Currency", role: "constant", isConstant: true, distinctCount: 1 }),
      ])
    );

    const groupOf = (name: string) => fields.find((f) => f.name === name)?.group;
    assert.equal(groupOf("Spend"), "measure");
    assert.equal(groupOf("Category"), "dimension");
    assert.equal(groupOf("PO Date"), "temporal");
    assert.equal(groupOf("PO Number"), "other");
    assert.equal(groupOf("Currency"), "other");
  });

  it("lists a high-cardinality categorical column under Dimensions without recommending it", () => {
    // The Supplier case: build-profile demotes a 351-value column past its
    // 200-distinct dimension cap to "text", which would otherwise bury the
    // most important field on a spend dashboard in the collapsed Other group.
    const fields = describeFields(
      profile([
        column({
          name: "Supplier",
          role: "text",
          distinctCount: 351,
          distinctRatio: 0.35,
          categorical: categorical(["Tata Steel", "Ashok Bearings"]),
        }),
      ])
    );

    assert.equal(fields[0].group, "dimension");
    assert.equal(fields[0].recommended, false, "the profile's candidate ranking still decides defaults");
  });

  it("leaves genuinely free text in Other", () => {
    const fields = describeFields(
      profile([
        column({
          name: "Material Description",
          role: "text",
          distinctCount: 2156,
          distinctRatio: 1,
          text: { avgLength: 34, maxLength: 90 },
        }),
      ])
    );

    assert.equal(fields[0].group, "other");
  });
});

describe("defaultFieldSelection", () => {
  it("opens on exactly the profile's ranked candidates", () => {
    const fields = describeFields(
      profile(
        [
          column({ name: "Spend", role: "measure", numeric: numeric() }),
          column({ name: "Category", role: "dimension", categorical: categorical(["A"]) }),
          column({ name: "PO Number", role: "identifier", distinctCount: 100, distinctRatio: 1 }),
        ],
        { measures: ["Spend"], dimensions: ["Category"] }
      )
    );

    assert.deepEqual(defaultFieldSelection(fields), ["Spend", "Category"]);
  });

  it("returns them in column order, not candidate order", () => {
    // Projection follows this array, so a selection ordered by candidate rank
    // would silently reshuffle the stored dashboard's columns.
    const fields = describeFields(
      profile(
        [
          column({ name: "Category", role: "dimension", categorical: categorical(["A"]) }),
          column({ name: "Spend", role: "measure", numeric: numeric() }),
        ],
        { measures: ["Spend"], dimensions: ["Category"] }
      )
    );

    assert.deepEqual(defaultFieldSelection(fields), ["Category", "Spend"]);
  });

  it("falls back to anything chartable when the profile ranked nothing", () => {
    const fields = describeFields(
      profile([
        column({ name: "Spend", role: "measure", numeric: numeric() }),
        column({ name: "PO Number", role: "identifier", distinctCount: 100, distinctRatio: 1 }),
      ])
    );

    assert.deepEqual(defaultFieldSelection(fields), ["Spend"]);
  });

  it("never opens on an empty selection, even for a dataset of nothing but keys", () => {
    const fields = describeFields(
      profile([
        column({ name: "PO Number", role: "identifier", distinctCount: 100, distinctRatio: 1 }),
        column({ name: "Line ID", role: "identifier", distinctCount: 100, distinctRatio: 1 }),
      ])
    );

    assert.deepEqual(defaultFieldSelection(fields), ["PO Number", "Line ID"]);
  });
});

describe("checkFieldSelection", () => {
  const fields = describeFields(
    profile([
      column({ name: "Spend", role: "measure", numeric: numeric() }),
      column({ name: "Category", role: "dimension", categorical: categorical(["A"]) }),
    ])
  );

  it("blocks an empty selection", () => {
    assert.match(checkFieldSelection(fields, []).error ?? "", /at least one field/);
  });

  it("blocks a selection with no measure when the dataset offers one", () => {
    assert.match(checkFieldSelection(fields, ["Category"]).error ?? "", /at least one measure/);
  });

  it("allows a measure-only selection, warning that it will come out as KPIs", () => {
    const status = checkFieldSelection(fields, ["Spend"]);
    assert.equal(status.error, null);
    assert.match(status.hint ?? "", /KPI tiles/);
  });

  it("passes a measure plus something to group it by, silently", () => {
    assert.deepEqual(checkFieldSelection(fields, ["Spend", "Category"]), {
      error: null,
      hint: null,
    });
  });

  it("doesn't demand a measure from a dataset that has none", () => {
    const noMeasures = describeFields(
      profile([column({ name: "Category", role: "dimension", categorical: categorical(["A"]) })])
    );
    assert.equal(checkFieldSelection(noMeasures, ["Category"]).error, null);
  });
});

describe("projectRows", () => {
  it("keeps only the chosen columns — this is what keeps a dashboard storable", () => {
    const rows = [
      { Supplier: "Tata", Spend: 100, Notes: "x".repeat(500) },
      { Supplier: "Ashok", Spend: 200, Notes: "y".repeat(500) },
    ];
    const projected = projectRows(rows, ["Supplier", "Spend"]);

    assert.deepEqual(projected, [
      { Supplier: "Tata", Spend: 100 },
      { Supplier: "Ashok", Spend: 200 },
    ]);
    assert.ok(JSON.stringify(projected).length < JSON.stringify(rows).length / 4);
  });

  it("skips a column a ragged row is missing rather than writing an undefined key", () => {
    assert.deepEqual(projectRows([{ Supplier: "Tata" }], ["Supplier", "Spend"]), [
      { Supplier: "Tata" },
    ]);
  });
});

// ---------------------------------------------------------------------------

function numeric() {
  return {
    min: 0,
    max: 100,
    mean: 50,
    median: 50,
    p25: 25,
    p75: 75,
    p95: 95,
    stddev: 10,
    sum: 5000,
    negativeCount: 0,
    zeroCount: 0,
    integerOnly: true,
    decimalPlaces: 0,
    looksLikeYear: false,
  };
}

function temporal() {
  return {
    minDate: "2023-01-01T00:00:00.000Z",
    maxDate: "2025-12-31T00:00:00.000Z",
    spanDays: 1095,
    granularity: "day" as const,
    distinctPeriodCount: 1095,
    hasGaps: false,
  };
}
