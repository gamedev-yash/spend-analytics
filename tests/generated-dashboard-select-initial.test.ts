// Coverage for the Add Widget catalog's selection layer
// (lib/generated-dashboard/select-initial.ts). The widget planner marks each
// spec `essential`, but a model's count is a suggestion — these assert the
// clamping, the KPI-row carve-out, and the section spread that turn whatever
// it returns into a coherent opening screen.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitInitialWidgets } from "@/lib/generated-dashboard/select-initial";
import type { DashboardPlan, WidgetSpec } from "@/types/generated-dashboard";

const SECTION_IDS = ["sec-a", "sec-b", "sec-c", "sec-d"];

function plan(sectionIds: string[] = SECTION_IDS): DashboardPlan {
  return {
    title: "Test dashboard",
    subtitle: "",
    domain: "procurement",
    grain: "one purchase order line",
    headlineMetrics: [],
    sections: sectionIds.map((id, index) => ({
      id,
      heading: `Section ${id}`,
      intent: "",
      whyItMatters: "",
      priority: index + 1,
    })),
    caveats: [],
    excludedColumns: [],
  };
}

function widget(overrides: Partial<WidgetSpec> & { id: string }): WidgetSpec {
  return {
    sectionId: SECTION_IDS[0],
    title: overrides.id,
    kind: "bar",
    dimension: "Vendor Name",
    series: { type: "measures", items: [{ column: "Net Value INR", aggregation: "sum", label: "Spend" }] },
    colSpan: 6,
    ...overrides,
  };
}

/** N charts spread round-robin over the sections, so section spread is exercised. */
function charts(count: number, essential: boolean, prefix: string): WidgetSpec[] {
  return Array.from({ length: count }, (_, i) =>
    widget({ id: `${prefix}-${i}`, sectionId: SECTION_IDS[i % SECTION_IDS.length], essential })
  );
}

describe("splitInitialWidgets — chart budget", () => {
  it("clamps an over-eager model down to the initial-chart maximum", () => {
    const widgets = charts(20, true, "c");
    const { initial, library } = splitInitialWidgets(plan(), widgets);

    assert.equal(initial.length, 6);
    assert.equal(library.length, 14);
    assert.ok(initial.every((w) => w.essential === true));
  });

  it("backfills with non-essentials when the model marks too few", () => {
    const widgets = [...charts(2, true, "ess"), ...charts(10, false, "opt")];
    const { initial, library } = splitInitialWidgets(plan(), widgets);

    assert.equal(initial.length, 4, "should backfill up to the initial-chart minimum");
    assert.equal(library.length, 8);
    // Both essentials must survive the backfill — they're picked first.
    assert.ok(initial.some((w) => w.id === "ess-0"));
    assert.ok(initial.some((w) => w.id === "ess-1"));
  });

  it("falls back to a pure priority split when no widget declares `essential`", () => {
    const widgets = charts(12, false, "c").map((w) => {
      const undeclared: WidgetSpec = { ...w };
      delete undeclared.essential;
      return undeclared;
    });
    const { initial, library } = splitInitialWidgets(plan(), widgets);

    assert.equal(initial.length, 4);
    assert.equal(library.length, 8);
  });

  it("takes everything when the dataset supports fewer charts than the minimum", () => {
    const { initial, library } = splitInitialWidgets(plan(), charts(3, true, "c"));

    assert.equal(initial.length, 3);
    assert.equal(library.length, 0);
  });

  it("never places a widget in both arrays", () => {
    const widgets = [...charts(9, true, "ess"), ...charts(9, false, "opt")];
    const { initial, library } = splitInitialWidgets(plan(), widgets);

    const initialIds = new Set(initial.map((w) => w.id));
    assert.ok(library.every((w) => !initialIds.has(w.id)));
    assert.equal(initial.length + library.length, widgets.length);
  });
});

describe("splitInitialWidgets — KPI row", () => {
  it("keeps the KPI row without spending the chart budget on it", () => {
    const kpis = Array.from({ length: 4 }, (_, i) =>
      widget({ id: `kpi-${i}`, kind: "kpi", dimension: undefined, essential: true })
    );
    const { initial } = splitInitialWidgets(plan(), [...kpis, ...charts(10, true, "c")]);

    assert.equal(initial.filter((w) => w.kind === "kpi").length, 4);
    assert.equal(initial.filter((w) => w.kind !== "kpi").length, 6);
  });

  it("promotes a KPI the model left non-essential — the row is structural", () => {
    const kpi = widget({ id: "kpi-0", kind: "kpi", dimension: undefined, essential: false });
    const { initial, library } = splitInitialWidgets(plan(), [kpi, ...charts(8, true, "c")]);

    assert.ok(initial.some((w) => w.id === "kpi-0"));
    assert.ok(!library.some((w) => w.id === "kpi-0"));
  });

  it("caps a runaway KPI row at 6 and catalogs the rest", () => {
    const kpis = Array.from({ length: 9 }, (_, i) =>
      widget({ id: `kpi-${i}`, kind: "kpi", dimension: undefined, essential: true })
    );
    const { initial, library } = splitInitialWidgets(plan(), kpis);

    assert.equal(initial.length, 6);
    assert.equal(library.length, 3);
  });
});

describe("splitInitialWidgets — layout integrity", () => {
  it("spreads the initial charts across sections instead of draining the top one", () => {
    // 8 essentials available in section A alone, plus one in each of B/C/D.
    const widgets = [
      ...Array.from({ length: 8 }, (_, i) =>
        widget({ id: `a-${i}`, sectionId: "sec-a", essential: true })
      ),
      widget({ id: "b-0", sectionId: "sec-b", essential: true }),
      widget({ id: "c-0", sectionId: "sec-c", essential: true }),
      widget({ id: "d-0", sectionId: "sec-d", essential: true }),
    ];
    const { initial } = splitInitialWidgets(plan(), widgets);
    const sections = new Set(initial.map((w) => w.sectionId));

    assert.equal(sections.size, 4, "every section should be represented on the opening screen");
  });

  it("preserves the planner's original order within the initial set", () => {
    const widgets = charts(4, true, "c");
    const { initial } = splitInitialWidgets(plan(), widgets);

    assert.deepEqual(
      initial.map((w) => w.id),
      widgets.map((w) => w.id)
    );
  });

  it("rehomes a widget whose sectionId isn't in the plan, rather than letting it vanish", () => {
    // DashboardGrid only walks plan.sections — an unmatched sectionId renders
    // nothing, which would make "Add" look like a no-op.
    const stray = widget({ id: "stray", sectionId: "sec-typo", essential: true });
    const { initial } = splitInitialWidgets(plan(), [stray, ...charts(5, true, "c")]);

    const placed = initial.find((w) => w.id === "stray");
    assert.ok(placed, "the stray widget should still be selected");
    assert.equal(placed.sectionId, "sec-a", "and rehomed onto the highest-priority section");
  });
});
