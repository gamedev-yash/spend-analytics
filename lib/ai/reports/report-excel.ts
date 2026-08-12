// ActionPlanResult → .xlsx (five-sheet workbook).
//
// SAME INPUT OBJECT AS THE WORD RENDERER, AND NO BUSINESS LOGIC OF ITS OWN.
// This file decides sheet names, column widths, and header styling. It never
// computes a figure, never re-derives a benefit, never rephrases a
// recommendation — every value written below is a property read straight off
// the ActionPlanResult. That is what makes the .xlsx and the .docx incapable
// of disagreeing (§14): they are two projections of one object, not two
// pipelines that happen to be fed similar data.
//
// Sheet layout follows §13, with the fact/insight/recommendation/assumption
// separation carried through into the workbook structure itself — supporting
// data, insights, and benefits-with-assumptions are separate sheets, so
// nobody can accidentally pivot an assumption as though it were measured.
//
// ExcelJS is write-only here: no file is read, no template is loaded, nothing
// touches the filesystem. The workbook is serialized straight to a buffer for
// lib/ai/reports/artifact-store.ts.

import "server-only";

import ExcelJS from "exceljs";
import type { ActionPlanResult } from "@/lib/ai/actions/action-plan-types";
import { NONE_IDENTIFIED, NOT_QUANTIFIABLE } from "@/lib/ai/reports/report-labels";

const HEADER_FILL = "FFF1F5F9"; // slate-100, ARGB
const ACCENT = "FF0F172A"; // slate-900, ARGB
const MUTED = "FF64748B"; // slate-500, ARGB

interface Column {
  header: string;
  width: number;
}

/**
 * One consistent sheet shape for all five tabs: title row, optional note row,
 * styled header row, then data. Rows are plain string arrays — a renderer
 * that accepted richer cell types would be tempted to format numbers, which
 * is the generator's job, not this file's.
 */
function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  title: string,
  note: string | null,
  columns: Column[],
  rows: string[][]
): void {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: note ? 4 : 3 }],
  });

  const titleRow = sheet.addRow([title]);
  titleRow.font = { bold: true, size: 14, color: { argb: ACCENT } };
  sheet.mergeCells(titleRow.number, 1, titleRow.number, Math.max(columns.length, 1));

  if (note) {
    const noteRow = sheet.addRow([note]);
    noteRow.font = { italic: true, size: 10, color: { argb: MUTED } };
    noteRow.alignment = { wrapText: true, vertical: "top" };
    sheet.mergeCells(noteRow.number, 1, noteRow.number, Math.max(columns.length, 1));
  }

  sheet.addRow([]);

  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.font = { bold: true, size: 11, color: { argb: ACCENT } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
    cell.alignment = { vertical: "middle" };
  });

  columns.forEach((column, i) => {
    sheet.getColumn(i + 1).width = column.width;
  });

  if (rows.length === 0) {
    // Same rule as the Word renderer: state that the section is empty rather
    // than leaving a blank sheet that reads as a failed export.
    const emptyRow = sheet.addRow([NONE_IDENTIFIED]);
    emptyRow.font = { italic: true, color: { argb: MUTED } };
    return;
  }

  for (const values of rows) {
    const row = sheet.addRow(values);
    row.alignment = { wrapText: true, vertical: "top" };
  }

  // AutoFilter over the data block only — makes a long recommendations or
  // supporting-data sheet usable without turning the title rows into filter
  // headers.
  sheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number + rows.length, column: columns.length },
  };
}

export async function renderActionPlanExcel(plan: ActionPlanResult): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Vedata Dashboard AI Assistant";
  workbook.title = plan.title;

  // Sheet 1 — Executive Summary. A label/value sheet rather than a table,
  // since this is the orientation page someone reads first.
  addSheet(
    workbook,
    "Executive Summary",
    plan.title,
    plan.scope,
    [
      { header: "Section", width: 22 },
      { header: "Detail", width: 110 },
    ],
    [
      ["Objective", plan.objective],
      ["Summary", plan.insightSummary],
      ["Scope", plan.scope],
      ["Facts recorded", String(plan.facts.length)],
      ["Insights identified", String(plan.insights.length)],
      ["Recommended actions", String(plan.recommendations.length)],
      ["Risks noted", String(plan.risks.length)],
      ...plan.nextSteps.map((step, i) => [`Next step ${i + 1}`, step]),
    ]
  );

  // Sheet 2 — Supporting Data. Measured values only, each with its basis.
  addSheet(
    workbook,
    "Supporting Data",
    "Key Data / Findings",
    "Values read from the dashboard's own data. Each row states what was counted or summed.",
    [
      { header: "Measure", width: 42 },
      { header: "Value", width: 22 },
      { header: "Basis", width: 70 },
    ],
    plan.facts.map((f) => [f.label, f.value, f.source])
  );

  // Sheet 3 — Insights. Deliberately separate from Supporting Data so a
  // derived reading is never mistaken for a measured one.
  addSheet(
    workbook,
    "Insights",
    "Key Insights",
    "Observations derived from the supporting data — not measured values.",
    [
      { header: "Insight", width: 80 },
      { header: "Based on", width: 60 },
    ],
    plan.insights.map((i) => [i.insight, i.basedOn])
  );

  // Sheet 4 — Recommended Actions.
  addSheet(
    workbook,
    "Recommended Actions",
    "Recommended Actions & Implementation",
    "Actions suggested on the strength of the insights, followed by the phased implementation plan.",
    [
      { header: "Priority", width: 12 },
      { header: "Action", width: 60 },
      { header: "Why", width: 55 },
      { header: "Expected impact", width: 45 },
    ],
    plan.recommendations.map((r) => [r.priority, r.action, r.reason, r.expectedImpact])
  );

  // The implementation plan rides on the same sheet as the actions it
  // sequences — separating them would make a reader cross-reference two tabs
  // to answer "who does this and when".
  const actionsSheet = workbook.getWorksheet("Recommended Actions");
  if (actionsSheet) {
    actionsSheet.addRow([]);
    const planTitle = actionsSheet.addRow(["Implementation Strategy"]);
    planTitle.font = { bold: true, size: 12, color: { argb: ACCENT } };
    const planHeader = actionsSheet.addRow(["Phase", "Action", "Timeline", "Owner"]);
    planHeader.font = { bold: true, size: 11, color: { argb: ACCENT } };
    planHeader.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    });
    if (plan.implementationPlan.length === 0) {
      actionsSheet.addRow([NONE_IDENTIFIED]).font = { italic: true, color: { argb: MUTED } };
    } else {
      for (const phase of plan.implementationPlan) {
        actionsSheet.addRow([phase.phase, phase.action, phase.timeline, phase.owner]).alignment = {
          wrapText: true,
          vertical: "top",
        };
      }
    }
  }

  // Sheet 5 — Benefits & Assumptions. The two belong on one sheet precisely
  // because a benefit figure is meaningless without the assumption under it.
  addSheet(
    workbook,
    "Benefits & Assumptions",
    "Potential Benefits",
    "Estimates only. Every figure is shown with the arithmetic and the assumption behind it, and requires business validation.",
    [
      { header: "Benefit", width: 34 },
      { header: "How it is derived", width: 44 },
      { header: "Assumption", width: 62 },
      { header: "Estimated value", width: 26 },
    ],
    plan.benefits.map((b) => [b.metric, b.formula, b.assumption, b.value ?? NOT_QUANTIFIABLE])
  );

  const benefitsSheet = workbook.getWorksheet("Benefits & Assumptions");
  if (benefitsSheet) {
    benefitsSheet.addRow([]);
    const assumptionsTitle = benefitsSheet.addRow(["Assumptions"]);
    assumptionsTitle.font = { bold: true, size: 12, color: { argb: ACCENT } };
    const assumptionsNote = benefitsSheet.addRow([
      "Conditions the estimates rest on. These are not findings from the data.",
    ]);
    assumptionsNote.font = { italic: true, size: 10, color: { argb: MUTED } };
    if (plan.assumptions.length === 0) {
      benefitsSheet.addRow([NONE_IDENTIFIED]).font = { italic: true, color: { argb: MUTED } };
    } else {
      for (const assumption of plan.assumptions) {
        benefitsSheet.addRow([assumption]).alignment = { wrapText: true, vertical: "top" };
      }
    }

    benefitsSheet.addRow([]);
    const risksTitle = benefitsSheet.addRow(["Risks & Considerations"]);
    risksTitle.font = { bold: true, size: 12, color: { argb: ACCENT } };
    const risksHeader = benefitsSheet.addRow(["Risk", "Mitigation"]);
    risksHeader.font = { bold: true, size: 11, color: { argb: ACCENT } };
    risksHeader.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    });
    if (plan.risks.length === 0) {
      benefitsSheet.addRow([NONE_IDENTIFIED]).font = { italic: true, color: { argb: MUTED } };
    } else {
      for (const risk of plan.risks) {
        benefitsSheet.addRow([risk.risk, risk.mitigation]).alignment = { wrapText: true, vertical: "top" };
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
