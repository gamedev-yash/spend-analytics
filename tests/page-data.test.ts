// The core dashboards' provider loaders, run against the real sample provider.
//
// Two properties matter and are both checked here:
//   1. Every payload a loader issues compiles through buildQuery — so a typo'd
//      column name fails in CI, not in the browser as a silent mock fallback.
//   2. The numbers match an independent aggregation of the same CSV.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuery } from "@/lib/server/query-builder";
import { getDataset, listColumns } from "@/lib/server/metadata-registry";
import { getSampleDataset, sampleDataProvider } from "@/lib/server/sample-data-source";
import { loadSpendOverviewFromProvider } from "@/lib/page-data/spend-overview-from-provider";
import { loadSupplierFragmentationFromProvider } from "@/lib/page-data/supplier-fragmentation-from-provider";
import { loadTailSpendFromProvider } from "@/lib/page-data/tail-spend-from-provider";
import { createRunner, grouped, INVOICES_DATASET, PO_ITEMS_DATASET } from "@/lib/page-data/provider-queries";
import { COUNT_ALL, type IDataProvider, type QueryPayload } from "@/types/data-provider";

/** Wraps the sample provider, recording payloads so they can be re-validated. */
function recordingProvider(): { provider: IDataProvider; issued: QueryPayload[] } {
  const issued: QueryPayload[] = [];
  const provider: IDataProvider = {
    id: "recording",
    getDatasets: () => sampleDataProvider.getDatasets(),
    getDatasetMetadata: (id) => sampleDataProvider.getDatasetMetadata(id),
    queryWidgetData: (payload) => {
      issued.push(payload);
      return sampleDataProvider.queryWidgetData(payload);
    },
  };
  return { provider, issued };
}

/** Every issued payload must be a query the T-SQL builder accepts. */
function assertPayloadsCompile(issued: QueryPayload[], label: string): void {
  assert.ok(issued.length > 0, `${label} issued no queries`);
  for (const payload of issued) {
    assert.doesNotThrow(
      () => buildQuery(payload),
      `${label}: payload rejected by the query builder — ${JSON.stringify(payload)}`
    );
    assert.ok(
      (payload.limit ?? 1) <= 1000,
      `${label}: limit ${String(payload.limit)} exceeds the provider cap`
    );
  }
}

/** Independent aggregation over the sample rows, bypassing the provider. */
function sampleTotals() {
  const dataset = getSampleDataset(PO_ITEMS_DATASET);
  assert.ok(dataset, "sample fact_po_items must load");
  let spend = 0;
  const vendors = new Set<string>();
  const categories = new Map<string, number>();
  for (const row of dataset.rows) {
    const value = Number(row.net_order_value_inr) || 0;
    spend += value;
    vendors.add(String(row.vendor_id ?? ""));
    const l1 = String(row.category_l1_name ?? "");
    categories.set(l1, (categories.get(l1) ?? 0) + value);
  }
  return { rowCount: dataset.rows.length, spend, vendorCount: vendors.size, categories };
}

const TOTALS = sampleTotals();

const near = (a: number, b: number, tolerance = 1) => Math.abs(a - b) <= tolerance;

describe("spend-overview provider loader", () => {
  it("issues only queries the builder accepts, and fills every widget slot", async () => {
    const { provider, issued } = recordingProvider();
    const data = await loadSpendOverviewFromProvider(provider);

    assert.ok(data, "loader must produce data from the sample warehouse");
    assertPayloadsCompile(issued, "spend-overview");

    // Non-empty for each widget the canvas renders.
    assert.ok(data.treemapNodes.length > 0, "treemap");
    assert.ok(data.topSuppliers.rows.length > 0, "top suppliers");
    assert.ok(data.trend.length > 0, "trend");
    assert.ok(data.buSpend.length > 0, "BU split");
    assert.ok((data.sunburstNodes ?? []).length > 0, "sunburst");
    assert.ok(data.metricsRows.length > 0, "metrics table");
    assert.ok(data.insightText.length > 20, "insight text");
  });

  it("reports totals matching an independent aggregation", async () => {
    const data = await loadSpendOverviewFromProvider(sampleDataProvider);
    assert.ok(data);
    assert.ok(
      near(data.kpis.totalSpendInr, TOTALS.spend, 1),
      `total ${data.kpis.totalSpendInr} != ${TOTALS.spend}`
    );
    assert.equal(data.kpis.poCount, TOTALS.rowCount);
    assert.equal(data.kpis.activeSupplierCount, TOTALS.vendorCount);
    assert.ok(
      near(data.kpis.avgPoValueInr, TOTALS.spend / TOTALS.rowCount, 0.02),
      "average PO value"
    );
  });

  it("ranks the top category the same way an independent aggregation does", async () => {
    const data = await loadSpendOverviewFromProvider(sampleDataProvider);
    assert.ok(data);
    const expectedTop = [...TOTALS.categories.entries()].sort((a, b) => b[1] - a[1])[0];
    assert.equal(data.metricsRows[0].category, expectedTop[0]);
    assert.ok(near(data.metricsRows[0].totalSpendInr, expectedTop[1], 1));
  });

  it("keeps every trend bucket at month grain and in chronological order", async () => {
    const data = await loadSpendOverviewFromProvider(sampleDataProvider);
    assert.ok(data);
    const months = data.trend.map((point) => point.month);
    assert.deepEqual(months, [...months].sort(), "trend must read left-to-right in time");
    for (const month of months) assert.match(month, /^\d{4}-\d{2}$/);
    // Trend totals must reconcile with the headline figure.
    const summed = data.trend.reduce((total, point) => total + point.total, 0);
    assert.ok(
      near(summed, data.kpis.totalSpendInr, Math.max(1, data.kpis.totalSpendInr * 1e-6)),
      `trend sums to ${summed}, headline is ${data.kpis.totalSpendInr}`
    );
  });

  it("percentages are shares of the whole, not of the page", async () => {
    const data = await loadSpendOverviewFromProvider(sampleDataProvider);
    assert.ok(data);
    const l1Total = data.metricsRows.reduce((sum, row) => sum + row.percentOfTotal, 0);
    assert.ok(l1Total > 99 && l1Total < 101, `L1 shares sum to ${l1Total}, expected ~100`);
    assert.ok(
      data.kpis.offContractPercent >= 0 && data.kpis.offContractPercent <= 100,
      "off-contract share must be a percentage"
    );
  });

  it("counts real invoices rather than labelling PO documents as invoices", async () => {
    // fact_invoices is a separate, smaller dataset from fact_po_items — the two
    // counts must not collapse to the same number just because one query ran.
    const invoices = getSampleDataset(INVOICES_DATASET);
    assert.ok(invoices);
    const distinctInvoices = new Set(invoices.rows.map((row) => row.invoice_number)).size;

    const data = await loadSpendOverviewFromProvider(sampleDataProvider);
    assert.ok(data);
    assert.equal(data.kpis.invoiceCount, distinctInvoices, "the KPI ribbon's Invoices figure must be invoices");
    assert.notEqual(data.kpis.invoiceCount, data.kpis.poCount, "invoices and POs are different row grains");
  });

  it("derives per-category YoY from real fiscal-year totals, not a flat zero", async () => {
    const dataset = getSampleDataset(PO_ITEMS_DATASET);
    assert.ok(dataset);
    // Fiscal year (Apr-Mar), matching ClientCsvAdapter's own timeGrain:"year"
    // bucketing (lib/adapters/client-csv-adapter.ts) — the loader's fiscal-year
    // comparison rides the same grain as the headline KPI's YoY.
    const byCategoryYear = new Map<string, Map<number, number>>();
    for (const row of dataset.rows) {
      const category = String(row.category_l1_name ?? "");
      const match = /^(\d{4})-(\d{2})/.exec(String(row.po_date ?? ""));
      if (!category || !match) continue;
      const calendarYear = Number(match[1]);
      const month = Number(match[2]);
      const fiscalYear = month >= 4 ? calendarYear : calendarYear - 1;
      const years = byCategoryYear.get(category) ?? new Map<number, number>();
      years.set(fiscalYear, (years.get(fiscalYear) ?? 0) + (Number(row.net_order_value_inr) || 0));
      byCategoryYear.set(category, years);
    }

    const data = await loadSpendOverviewFromProvider(sampleDataProvider);
    assert.ok(data);

    // At least one category must show real movement — a leftover `yoyChangePercent: 0`
    // placeholder would make every row read exactly zero.
    assert.ok(
      data.metricsRows.some((row) => row.yoyChangePercent !== 0),
      "every category reads 0% YoY — looks like a hardcoded placeholder"
    );

    for (const row of data.metricsRows) {
      const years = byCategoryYear.get(row.category);
      assert.ok(years, `unexpected category "${row.category}"`);
      const sortedYears = [...years.keys()].sort((a, b) => a - b);
      const latest = years.get(sortedYears.at(-1) ?? -1) ?? 0;
      const previous = years.get(sortedYears.at(-2) ?? -1) ?? 0;
      const expected = previous > 0 ? Math.round(((latest - previous) / previous) * 1000) / 10 : 0;
      assert.ok(
        near(row.yoyChangePercent, expected, 0.5),
        `${row.category}: YoY ${row.yoyChangePercent} != expected ${expected}`
      );
    }
  });
});

describe("tail-spend provider loader", () => {
  it("issues only valid queries and derives the full page shape", async () => {
    const { provider, issued } = recordingProvider();
    const result = await loadTailSpendFromProvider(provider, 25_000);

    assert.ok(result, "loader must produce data");
    assertPayloadsCompile(issued, "tail-spend");

    const { data } = result;
    assert.ok(data.supplierBubbles.length > 0, "supplier bubbles");
    assert.ok(data.paretoDeciles.length > 0, "pareto deciles");
    assert.ok(data.categoryBreakdown.length > 0, "category breakdown");
    assert.ok(data.segmentComparison.length > 0, "segment comparison");
    assert.ok(data.sapSupplierReport.length > 0, "supplier detail report");
    assert.equal(result.buckets.length, 7, "one aggregate per value band");
  });

  it("total spend and PO count reconcile with the source rows", async () => {
    const result = await loadTailSpendFromProvider(sampleDataProvider, 25_000);
    assert.ok(result);
    const spend = result.data.supplierBubbles.reduce((sum, s) => sum + s.totalSpend, 0);
    const poCount = result.data.supplierBubbles.reduce((sum, s) => sum + s.poCount, 0);
    assert.ok(near(spend, TOTALS.spend, TOTALS.spend * 1e-6), `supplier spend ${spend}`);
    assert.equal(poCount, TOTALS.rowCount);
  });

  it("value-band aggregates account for every row exactly once", async () => {
    const result = await loadTailSpendFromProvider(sampleDataProvider, 25_000);
    assert.ok(result);
    const counted = result.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    assert.equal(counted, TOTALS.rowCount, "bands must partition the fact table");
    const banded = result.buckets.reduce((sum, bucket) => sum + bucket.spend, 0);
    assert.ok(near(banded, TOTALS.spend, TOTALS.spend * 1e-6));
  });

  it("segments every supplier and orders Pareto deciles by descending share", async () => {
    const result = await loadTailSpendFromProvider(sampleDataProvider, 25_000);
    assert.ok(result);
    const segments = new Set(result.data.supplierBubbles.map((s) => s.segment));
    for (const segment of segments) {
      assert.ok(["Strategic", "Core", "Tail"].includes(segment), `unexpected segment ${segment}`);
    }
    const deciles = result.data.paretoDeciles;
    assert.ok(deciles.length > 0);

    // The bands are unequal width (top 10%, 10-20%, then 20-point bands), so raw
    // band share is not monotonic — spend *per supplier* is, and that is what
    // makes the curve a Pareto curve.
    const density = deciles.map((d) => d.spendPercentOfTotal / d.supplierCount);
    assert.deepEqual(
      density.map((d) => Math.round(d * 1e6)),
      [...density].sort((a, b) => b - a).map((d) => Math.round(d * 1e6)),
      "spend per supplier must not increase as you move down the ranking"
    );

    const cumulative = deciles.map((d) => d.cumulativeSpendPercent);
    assert.deepEqual(cumulative, [...cumulative].sort((a, b) => a - b), "cumulative must not dip");
    assert.ok(
      Math.abs((cumulative.at(-1) ?? 0) - 100) < 1.5,
      `cumulative ends at ${String(cumulative.at(-1))}, expected ~100`
    );
    // Every supplier lands in exactly one band.
    const banded = deciles.reduce((sum, d) => sum + d.supplierCount, 0);
    assert.equal(banded, result.data.supplierBubbles.length);
  });

  it("reports exact per-category spend, not the primary-category approximation", async () => {
    // The supplier-grain intermediate carries one primary category per supplier,
    // so deriving category totals from it credits a supplier's whole spend to its
    // largest category — Raw Materials read 12,344 Cr against a true 5,817 Cr.
    // The loader queries categories directly and splices the exact figures in.
    const result = await loadTailSpendFromProvider(sampleDataProvider, 25_000);
    assert.ok(result);

    for (const category of result.data.categoryBreakdown) {
      const expected = TOTALS.categories.get(category.category);
      assert.ok(expected !== undefined, `unexpected category "${category.category}"`);
      assert.ok(
        near(category.totalSpend, expected, Math.max(1, expected * 1e-6)),
        `${category.category}: ${category.totalSpend} != ${expected}`
      );
      // The segment split has to reconstitute the category total.
      const split = category.strategicSpend + category.coreSpend + category.tailSpend;
      assert.ok(near(split, category.totalSpend, 1), `${category.category}: split ${split}`);
    }

    const summed = result.data.categoryBreakdown.reduce((sum, c) => sum + c.totalSpend, 0);
    assert.ok(near(summed, TOTALS.spend, TOTALS.spend * 1e-6), `categories sum to ${summed}`);
    // sapCategoryRows is projected from the same rows, so it must agree.
    assert.equal(result.data.sapCategoryRows.length, result.data.categoryBreakdown.length);
    assert.ok(
      near(
        result.data.sapCategoryRows.reduce((sum, r) => sum + r.spend, 0),
        summed,
        1
      )
    );
  });

  it("counts real invoices rather than labelling PO documents as invoices", async () => {
    const invoices = getSampleDataset("fact_invoices");
    assert.ok(invoices);
    const distinctInvoices = new Set(invoices.rows.map((row) => row.invoice_number)).size;

    const result = await loadTailSpendFromProvider(sampleDataProvider, 25_000);
    assert.ok(result);
    const reported = result.data.sapSupplierReport.reduce((sum, row) => sum + row.invoiceCount, 0);
    assert.equal(reported, distinctInvoices, "the KPI ribbon's Invoices figure must be invoices");
  });

  it("a higher micro-PO threshold can only classify more POs as micro", async () => {
    const [low, high] = await Promise.all([
      loadTailSpendFromProvider(sampleDataProvider, 10_000),
      loadTailSpendFromProvider(sampleDataProvider, 1_000_000),
    ]);
    assert.ok(low && high);
    const micro = (r: NonNullable<typeof low>) =>
      r.data.consolidationCandidates.reduce((sum, c) => sum + c.microPOCount, 0);
    assert.ok(micro(high) >= micro(low), `${micro(high)} should be >= ${micro(low)}`);
  });
});

describe("supplier-fragmentation provider loader", () => {
  it("issues only valid queries and derives category concentration", async () => {
    const { provider, issued } = recordingProvider();
    const data = await loadSupplierFragmentationFromProvider(provider);

    assert.ok(data, "loader must produce data");
    assertPayloadsCompile(issued, "supplier-fragmentation");
    assert.ok(data.categories.length > 0, "category rows");

    for (const category of data.categories) {
      assert.ok(category.supplierCount > 0, `${category.category} has no suppliers`);
      assert.ok(
        category.singleUseSuppliers <= category.supplierCount,
        `${category.category}: single-use ${category.singleUseSuppliers} > total ${category.supplierCount}`
      );
      assert.ok(
        category.top3ConcentrationPercent >= 0 && category.top3ConcentrationPercent <= 100,
        `${category.category}: concentration ${category.top3ConcentrationPercent} out of range`
      );
    }
  });

  it("derives KPIs from the category rows it built", async () => {
    const data = await loadSupplierFragmentationFromProvider(sampleDataProvider);
    assert.ok(data);
    const summed = data.categories.reduce((sum, c) => sum + c.supplierCount, 0);
    assert.equal(data.totalActiveSuppliers, summed);
    assert.equal(
      data.avgSuppliersPerCategory,
      Math.round(summed / data.categories.length),
      "average must follow from the same rows"
    );
    assert.ok(data.categories.every((c) => c.spendCr >= 0));
  });

  it("computes top-10 concentration from a real global vendor ranking, not the static mock", async () => {
    const dataset = getSampleDataset(PO_ITEMS_DATASET);
    assert.ok(dataset);
    const byVendor = new Map<string, number>();
    for (const row of dataset.rows) {
      const vendor = String(row.vendor_name ?? "");
      byVendor.set(vendor, (byVendor.get(vendor) ?? 0) + (Number(row.net_order_value_inr) || 0));
    }
    const ranked = [...byVendor.values()].sort((a, b) => b - a);
    const total = ranked.reduce((sum, v) => sum + v, 0);
    const top10 = ranked.slice(0, 10).reduce((sum, v) => sum + v, 0);
    const expected = Math.round((top10 / total) * 100);

    const data = await loadSupplierFragmentationFromProvider(sampleDataProvider);
    assert.ok(data);
    assert.equal(
      data.top10ConcentrationPercent,
      expected,
      `top-10 concentration ${data.top10ConcentrationPercent} != independently computed ${expected}`
    );
  });
});

describe("loader payload hygiene", () => {
  it("names only registry columns", async () => {
    const dataset = getDataset(PO_ITEMS_DATASET);
    assert.ok(dataset);
    const known = new Set(listColumns(dataset).map((c) => c.id));

    const { provider, issued } = recordingProvider();
    await Promise.all([
      loadSpendOverviewFromProvider(provider),
      loadTailSpendFromProvider(provider, 25_000),
      loadSupplierFragmentationFromProvider(provider),
    ]);

    for (const payload of issued) {
      if (payload.datasetId !== PO_ITEMS_DATASET) continue;
      for (const field of payload.dimensions ?? []) {
        assert.ok(known.has(field), `dimension "${field}" is not a registry column`);
      }
      for (const measure of payload.measures ?? []) {
        assert.ok(
          measure.field === COUNT_ALL || known.has(measure.field),
          `measure "${measure.field}" is not a registry column`
        );
      }
      for (const filter of payload.filters ?? []) {
        assert.ok(known.has(filter.field), `filter "${filter.field}" is not a registry column`);
      }
    }
  });

  it("the shared runner records what it issued", async () => {
    const runner = createRunner(sampleDataProvider);
    await runner.run(
      grouped({
        datasetId: PO_ITEMS_DATASET,
        measures: { total: [COUNT_ALL, "count"] },
      })
    );
    assert.equal(runner.issued.length, 1);
    assert.equal(runner.issued[0].datasetId, PO_ITEMS_DATASET);
  });
});
