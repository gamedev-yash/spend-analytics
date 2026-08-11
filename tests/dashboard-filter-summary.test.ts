// Coverage for the "does the AI Assistant know about the dashboard's own
// active filters" fix: each dashboard publishes a plain-language summary via
// context/DashboardActiveFiltersContext.tsx, built by a pure function per
// dashboard so it's testable without mounting any React tree. These tests
// exercise those pure builders directly.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMultiSelectPart,
  formatMultiSelectPartFromOptions,
  formatDateRangePart,
  joinFilterSummaryParts,
  buildPlantCategoryDateFilterSummary,
} from "@/lib/dashboard-filters/format-filter-summary";
import { buildPaymentTermsFilterSummary } from "@/app/payment-terms/filterSummary";
import { buildSingleSourceRiskFilterSummary } from "@/app/single-source-risk/filterSummary";
import { buildTailSpendFilterSummary } from "@/app/tail-spend/lib/filterSummary";
import { buildSupplierFragmentationFilterSummary } from "@/app/supplier-fragmentation/lib/filterSummary";
import type { FilterState as PaymentTermsFilterState } from "@/app/payment-terms/types";
import type { FilterState as SingleSourceRiskFilterState } from "@/app/single-source-risk/types";
import type { TailSpendFilterState } from "@/app/tail-spend/lib/useTailSpendStore";

describe("format-filter-summary primitives", () => {
  it("formatMultiSelectPart drops out entirely when nothing is selected", () => {
    assert.equal(formatMultiSelectPart("Plant", []), null);
    assert.equal(formatMultiSelectPart("Plant", ["Pune", "Chennai"]), "Plant: Pune, Chennai");
  });

  it("formatMultiSelectPartFromOptions resolves ids to labels and drops unresolvable ones", () => {
    const options = [{ value: "P01", label: "Pune" }, { value: "P02", label: "Chennai" }];
    assert.equal(formatMultiSelectPartFromOptions("Plant", [], options), null);
    assert.equal(formatMultiSelectPartFromOptions("Plant", ["P01"], options), "Plant: Pune");
    assert.equal(formatMultiSelectPartFromOptions("Plant", ["P01", "P99"], options), "Plant: Pune");
    assert.equal(formatMultiSelectPartFromOptions("Plant", ["P99"], options), null);
  });

  it("formatDateRangePart is null exactly when the range still matches the dashboard default", () => {
    assert.equal(formatDateRangePart("2024-01-01", "2024-12-31", "2024-01-01", "2024-12-31"), null);
    assert.equal(
      formatDateRangePart("2025-01-01", "2025-06-30", "2024-01-01", "2024-12-31"),
      "Date: 2025-01-01 to 2025-06-30"
    );
  });

  it("joinFilterSummaryParts is null when every part was null, never an empty string", () => {
    assert.equal(joinFilterSummaryParts([null, null]), null);
    assert.equal(joinFilterSummaryParts([null, "Plant: Pune", null, "Date: x to y"]), "Plant: Pune · Date: x to y");
  });
});

describe("Spend Overview / Compliance filter summary", () => {
  const plantOptions = [{ code: "P01", name: "Pune" }, { code: "P02", name: "Chennai" }];

  it("is null when nothing has been changed from defaults", () => {
    const summary = buildPlantCategoryDateFilterSummary({
      selectedPlantCodes: [],
      plantOptions,
      selectedCategories: [],
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
      defaultDateFrom: "2024-01-01",
      defaultDateTo: "2024-12-31",
    });
    assert.equal(summary, null);
  });

  it("combines plant (resolved from codes), category, and a changed date range", () => {
    const summary = buildPlantCategoryDateFilterSummary({
      selectedPlantCodes: ["P01"],
      plantOptions,
      selectedCategories: ["IT & Telecom"],
      dateFrom: "2025-01-01",
      dateTo: "2025-06-30",
      defaultDateFrom: "2024-01-01",
      defaultDateTo: "2024-12-31",
    });
    assert.equal(summary, "Plant: Pune · Category: IT & Telecom · Date: 2025-01-01 to 2025-06-30");
  });
});

describe("Payment Terms filter summary", () => {
  const categoryOptions = [{ value: "C1", label: "Packaging Materials" }];
  const globalUltimateOptions = [{ value: "GU1", label: "Vedanta Aluminium" }];
  const sourceSystemOptions = [{ value: "1000", label: "SAP — 1000" }];
  const plantOptions = [{ value: "P01", label: "Pune" }];
  const paymentTermOptions = [{ value: "NT30", label: "Net 30" }];

  const baseFilters: PaymentTermsFilterState = {
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    categoryCodes: [],
    globalUltimateIds: [],
    sourceSystemIds: [],
    plantIds: [],
    paymentTermCodes: [],
  };

  it("is null with every filter at its default", () => {
    const summary = buildPaymentTermsFilterSummary({
      filters: baseFilters,
      defaultDateFrom: "2024-01-01",
      defaultDateTo: "2024-12-31",
      categoryOptions,
      globalUltimateOptions,
      sourceSystemOptions,
      plantOptions,
      paymentTermOptions,
    });
    assert.equal(summary, null);
  });

  it("names every active dimension by its resolved label", () => {
    const summary = buildPaymentTermsFilterSummary({
      filters: { ...baseFilters, categoryCodes: ["C1"], plantIds: ["P01"], paymentTermCodes: ["NT30"] },
      defaultDateFrom: "2024-01-01",
      defaultDateTo: "2024-12-31",
      categoryOptions,
      globalUltimateOptions,
      sourceSystemOptions,
      plantOptions,
      paymentTermOptions,
    });
    assert.equal(summary, "Category: Packaging Materials · Plant: Pune · Payment Term: Net 30");
  });
});

describe("Single Source Risk filter summary", () => {
  const categoryOptions = [{ value: "C1", label: "Packaging Materials" }];
  const globalUltimateOptions: { value: string; label: string }[] = [];
  const sourceSystemOptions: { value: string; label: string }[] = [];
  const plantOptions: { value: string; label: string }[] = [];

  const baseFilters: SingleSourceRiskFilterState = {
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    categoryCodes: [],
    globalUltimateIds: [],
    sourceSystemIds: [],
    plantIds: [],
    supplierCountPerCategory: 1,
  };

  it("omits the at-risk threshold when it's still the default of 1", () => {
    const summary = buildSingleSourceRiskFilterSummary({
      filters: { ...baseFilters, categoryCodes: ["C1"] },
      defaultDateFrom: "2024-01-01",
      defaultDateTo: "2024-12-31",
      categoryOptions,
      globalUltimateOptions,
      sourceSystemOptions,
      plantOptions,
    });
    assert.equal(summary, "Category: Packaging Materials");
  });

  it("surfaces the at-risk threshold once the user moves it off the default", () => {
    const summary = buildSingleSourceRiskFilterSummary({
      filters: { ...baseFilters, supplierCountPerCategory: 2 },
      defaultDateFrom: "2024-01-01",
      defaultDateTo: "2024-12-31",
      categoryOptions,
      globalUltimateOptions,
      sourceSystemOptions,
      plantOptions,
    });
    assert.equal(summary, "At-risk threshold: ≤2 suppliers");
  });
});

describe("Tail Spend filter summary", () => {
  const ALL_BUCKETS = ["0-10K", "10K-50K", "50K-1L", "1L+"];

  const baseFilters: TailSpendFilterState = {
    categories: [],
    suppliers: [],
    plants: [],
    sourceSystems: [],
    dateFrom: "2024-01-01",
    dateTo: "2026-12-31",
    paretoThreshold: 80,
    selectedBuckets: new Set(ALL_BUCKETS),
  };

  it("is null at every default (including display-only plants/sourceSystems, which are never even accepted)", () => {
    const summary = buildTailSpendFilterSummary({
      filters: baseFilters,
      allBucketLabels: ALL_BUCKETS,
      dateMin: "2024-01-01",
      dateMax: "2026-12-31",
    });
    assert.equal(summary, null);
  });

  it("ignores plants/sourceSystems entirely — they're display-only and never narrow computed numbers", () => {
    const summary = buildTailSpendFilterSummary({
      filters: { ...baseFilters, plants: ["Pune Plant"], sourceSystems: ["SAP ECC"] },
      allBucketLabels: ALL_BUCKETS,
      dateMin: "2024-01-01",
      dateMax: "2026-12-31",
    });
    assert.equal(summary, null);
  });

  it("surfaces categories/suppliers, a non-default Pareto threshold, and a narrowed bucket selection", () => {
    const summary = buildTailSpendFilterSummary({
      filters: {
        ...baseFilters,
        categories: ["Packaging"],
        paretoThreshold: 90,
        selectedBuckets: new Set(["0-10K"]),
      },
      allBucketLabels: ALL_BUCKETS,
      dateMin: "2024-01-01",
      dateMax: "2026-12-31",
    });
    assert.equal(summary, "Category: Packaging · Pareto threshold: 90% · Invoice value buckets: 0-10K");
  });
});

describe("Supplier Fragmentation filter summary", () => {
  const plantOptions = [{ code: "P01", name: "Pune" }];

  it("is null with no plant/category/cross-filter and the default date range", () => {
    const summary = buildSupplierFragmentationFilterSummary({
      filters: { plants: [], l1s: [], dateFrom: "2024-01-01", dateTo: "2024-12-31" },
      plantOptions,
      crossFilterLabel: "",
      defaultDateFrom: "2024-01-01",
      defaultDateTo: "2024-12-31",
    });
    assert.equal(summary, null);
  });

  it("includes a heatmap/bar cross-filter selection as its own part", () => {
    const summary = buildSupplierFragmentationFilterSummary({
      filters: { plants: ["P01"], l1s: [], dateFrom: "2024-01-01", dateTo: "2024-12-31" },
      plantOptions,
      crossFilterLabel: "Hindustan Zinc · MRO & Spares",
      defaultDateFrom: "2024-01-01",
      defaultDateTo: "2024-12-31",
    });
    assert.equal(summary, "Plant: Pune · Chart selection: Hindustan Zinc · MRO & Spares");
  });
});
