// ActionPlanResult → .docx (executive report layout).
//
// LAYOUT ONLY. Every string a reader sees comes from the ActionPlanResult
// passed in — this file contributes section headings ("Recommended Actions"),
// table column headers ("Priority"), and the one honest fallback for a benefit
// the data could not quantify. It contains no business content, no supplier
// names, no figures, and no scenario-specific text of any kind, so the same
// renderer is indifferent to which dashboard or objective produced its input.
//
// SHARES ITS INPUT WITH THE EXCEL RENDERER AND DERIVES NOTHING OF ITS OWN.
// Neither renderer computes, reformats, or supplements a business value — if
// the two documents ever disagreed, the bug would be upstream in the
// generator, never here. That is the §14 single-source-of-truth guarantee,
// and it is why neither file imports the other.
//
// Section order follows §12 of the spec.

import "server-only";

import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ActionPlanResult } from "@/lib/ai/actions/action-plan-types";
import { NONE_IDENTIFIED, NOT_QUANTIFIABLE } from "@/lib/ai/reports/report-labels";

const ACCENT = "0F172A"; // slate-900 — matches the app's enterprise palette
const MUTED = "64748B"; // slate-500
const HEADER_FILL = "F1F5F9"; // slate-100

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 140 },
    children: [new TextRun({ text, bold: true, size: 26, color: ACCENT })],
  });
}

function body(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 21 })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 21 })],
  });
}

function muted(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 18, color: MUTED, italics: true })],
  });
}

function cell(text: string, opts: { bold?: boolean; fill?: string } = {}): TableCell {
  return new TableCell({
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: 19 })] })],
  });
}

/** Header row + body rows. `columnWidths` are percentages and must total 100. */
function table(headers: string[], rows: string[][], columnWidths: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h) => cell(h, { bold: true, fill: HEADER_FILL })),
      }),
      ...rows.map((row) => new TableRow({ children: row.map((value) => cell(value)) })),
    ],
  });
}

/** Either the table, or the explicit "none" line — never a silently missing section. */
function tableOrNone(headers: string[], rows: string[][], columnWidths: number[]): (Table | Paragraph)[] {
  return rows.length > 0 ? [table(headers, rows, columnWidths)] : [body(NONE_IDENTIFIED)];
}

function listOrNone(items: string[]): Paragraph[] {
  return items.length > 0 ? items.map(bullet) : [body(NONE_IDENTIFIED)];
}

export async function renderActionPlanWord(plan: ActionPlanResult): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: plan.title, bold: true, size: 40, color: ACCENT })],
    }),
    muted(plan.scope),
    new Paragraph({
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 6 } },
      children: [],
    }),

    heading("Executive Summary"),
    body(plan.insightSummary),

    heading("1. Objective"),
    body(plan.objective),

    heading("2. Current Situation"),
    body(plan.scope),

    heading("3. Key Data / Findings"),
    // Facts carry their own source line precisely so a reader can trace any
    // figure in this document back to what was actually counted.
    muted("Figures below are values read from the dashboard's own data."),
    ...tableOrNone(
      ["Measure", "Value", "Basis"],
      plan.facts.map((f) => [f.label, f.value, f.source]),
      [40, 20, 40]
    ),

    heading("4. Key Insights"),
    muted("Observations derived from the findings above — not measured values."),
    ...tableOrNone(
      ["Insight", "Based on"],
      plan.insights.map((i) => [i.insight, i.basedOn]),
      [62, 38]
    ),

    ...(plan.opportunities.length > 0
      ? [
          heading("5. Opportunities"),
          muted("Areas worth pursuing that follow from the insights above. Not all can be sized from this dashboard's data."),
          table(
            ["Opportunity", "Based on", "Indicative scale"],
            plan.opportunities.map((o) => [o.opportunity, o.basedOn, o.scale ?? NOT_QUANTIFIABLE]),
            [44, 34, 22]
          ),
        ]
      : []),

    heading("5. Business Impact"),
    body(plan.insightSummary),

    heading("6. Potential Benefits"),
    muted(
      "Estimates only. Each figure below is shown with the arithmetic and the assumption behind it, and requires business validation before use in a business case."
    ),
    ...tableOrNone(
      ["Benefit", "Starting from", "How it is derived", "Assumption", "Estimated value", "Confidence"],
      plan.benefits.map((b) => [b.metric, b.basis, b.formula, b.assumption, b.value ?? NOT_QUANTIFIABLE, b.confidence]),
      [18, 17, 18, 23, 15, 9]
    ),

    heading("7. Recommended Actions"),
    ...tableOrNone(
      ["Priority", "Action", "Why", "Evidence", "Expected impact", "Depends on"],
      plan.recommendations.map((r) => [r.priority, r.action, r.reason, r.evidence, r.expectedImpact, r.dependencies ?? "—"]),
      [9, 23, 19, 19, 19, 11]
    ),

    heading("8. Implementation Strategy"),
    ...tableOrNone(
      ["Phase", "Action", "Timeline", "Owner", "Success measure"],
      plan.implementationPlan.map((p) => [p.phase, p.action, p.timeline, p.owner, p.successMetric ?? "—"]),
      [14, 32, 14, 16, 24]
    ),

    heading("9. Risks / Considerations"),
    ...tableOrNone(
      ["Risk", "Mitigation"],
      plan.risks.map((r) => [r.risk, r.mitigation]),
      [50, 50]
    ),

    heading("10. Next Steps"),
    ...listOrNone(plan.nextSteps),

    heading("11. Assumptions"),
    muted("These are conditions the estimates rest on. They are not findings from the data."),
    ...listOrNone(plan.assumptions),

    // Only rendered when there ARE gaps. An objective the dashboard answered in
    // full should not carry an empty "what we couldn't tell you" section — that
    // would read as a caveat where none exists. This is the opposite rule from
    // every section above, which always render, because those are expected
    // content and this is an exception report.
    ...(plan.dataGaps.length > 0
      ? [
          heading("12. Data Not Available"),
          muted(
            "The objective needed the following, which this dashboard does not carry. Nothing in this report estimates around these gaps."
          ),
          ...plan.dataGaps.map(bullet),
        ]
      : []),
  ];

  const doc = new Document({
    creator: "Vedata Dashboard AI Assistant",
    title: plan.title,
    description: plan.objective,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 21 } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
        children,
        footers: undefined,
      },
    ],
  });

  // Buffer is a Uint8Array subclass, but the store and the Response body both
  // want the plain view — normalize here so nothing downstream depends on
  // which one docx happened to hand back.
  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
