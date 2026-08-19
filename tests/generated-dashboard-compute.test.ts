// Coverage for the AI-generated dashboard's aggregation engine
// (lib/generated-dashboard/compute.ts), focused on the pivot-only
// "percentOfTotal" aggregation: the only way the engine can express a true
// rate/share (e.g. "on-time payment rate") from a categorical outcome
// column, as opposed to a raw count mislabeled as a rate.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeKpiValue, computeWidgetSeries } from "@/lib/generated-dashboard/compute";
import type { WidgetSpec } from "@/types/generated-dashboard";

function kpiWidget(overrides: Partial<WidgetSpec> = {}): WidgetSpec {
  return {
    id: "kpi-widget",
    sectionId: "sec-a",
    title: "KPI",
    kind: "kpi",
    series: {
      type: "pivot",
      dimension: "Payment Status",
      values: ["On Time"],
      measure: { column: "Payment Status", aggregation: "percentOfTotal", label: "On-Time Rate" },
    },
    colSpan: 3,
    formatHint: "percent",
    ...overrides,
  };
}

// 5 "On Time" of 8 total rows (2 of 4 in January, 3 of 4 in February).
const INVOICE_ROWS = [
  { Month: "2026-01", "Payment Status": "On Time", Amount: 100 },
  { Month: "2026-01", "Payment Status": "On Time", Amount: 100 },
  { Month: "2026-01", "Payment Status": "Late", Amount: 100 },
  { Month: "2026-01", "Payment Status": "Late", Amount: 100 },
  { Month: "2026-02", "Payment Status": "On Time", Amount: 100 },
  { Month: "2026-02", "Payment Status": "On Time", Amount: 100 },
  { Month: "2026-02", "Payment Status": "On Time", Amount: 100 },
  { Month: "2026-02", "Payment Status": "Late", Amount: 100 },
];

describe("computeKpiValue — pivot percentOfTotal", () => {
  it("computes a share of matching rows over all rows, not a raw count", () => {
    const value = computeKpiValue(kpiWidget(), INVOICE_ROWS);
    // 5 "On Time" of 8 total = 62.5%, not the raw count of 5.
    assert.equal(value, 62.5);
  });

  it("combines multiple pivot values into one rate", () => {
    const widget = kpiWidget({
      series: {
        type: "pivot",
        dimension: "Payment Status",
        values: ["On Time", "Late"],
        measure: { column: "Payment Status", aggregation: "percentOfTotal", label: "Coverage" },
      },
    });
    assert.equal(computeKpiValue(widget, INVOICE_ROWS), 100);
  });

  it("still returns a raw count when aggregation is plain count (unchanged behavior)", () => {
    const widget = kpiWidget({
      series: {
        type: "pivot",
        dimension: "Payment Status",
        values: ["On Time"],
        measure: { column: "Payment Status", aggregation: "count", label: "On-Time Count" },
      },
    });
    assert.equal(computeKpiValue(widget, INVOICE_ROWS), 5);
  });

  it("returns 0 rather than NaN when there are no rows", () => {
    assert.equal(computeKpiValue(kpiWidget(), []), 0);
  });
});

describe("computeWidgetSeries — pivot percentOfTotal", () => {
  it("computes a per-group share, independent of other groups' totals", () => {
    const widget: WidgetSpec = {
      id: "trend-widget",
      sectionId: "sec-a",
      title: "On-Time Rate by Month",
      kind: "line",
      dimension: "Month",
      series: {
        type: "pivot",
        dimension: "Payment Status",
        values: ["On Time"],
        measure: { column: "Payment Status", aggregation: "percentOfTotal", label: "On-Time Rate" },
      },
      sort: "temporal",
      colSpan: 6,
      formatHint: "percent",
    };
    const points = computeWidgetSeries(widget, INVOICE_ROWS);
    assert.deepEqual(
      points.map((p) => [p.label, p.value]),
      [
        ["2026-01", 50], // 2 of 4 that month
        ["2026-02", 75], // 3 of 4 that month
      ]
    );
  });
});
